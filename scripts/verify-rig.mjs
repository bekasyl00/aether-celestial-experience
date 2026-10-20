import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Vector3 } from 'three';
import { createSculpture, getCharacterDesign } from '../src/sculptures.js';
import { createArticulatedSculpture } from '../src/rig.js';

const hashGeometry = group => {
  const hash = createHash('sha256');
  group.updateMatrixWorld(true);
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const attribute of [mesh.geometry.getAttribute('position'), mesh.geometry.getIndex()]) {
      if (!attribute) continue;
      const array = attribute.array;
      hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
    }
  });
  return hash.digest('hex');
};

const hashes = new Set();
const archetypes = new Set();
for (const kind of ['angel', 'demon']) {
  for (let seed = 1; seed <= 500; seed++) {
    const group = createSculpture(kind, seed, 'distant');
    const hash = hashGeometry(group);
    assert(!hashes.has(hash), `Repeated geometry bytes: ${kind} ${seed}`);
    hashes.add(hash);
    archetypes.add(getCharacterDesign(kind, seed).archetype);
    if ([1, 137, 500].includes(seed)) {
      assert.equal(hashGeometry(createSculpture(kind, seed, 'distant')), hash, 'A seeded sculpture must be reproducible');
    }
  }
}
assert.equal(hashes.size, 1000);
assert.equal(archetypes.size, 20);

let validatedVertices = 0;
let validatedDeformations = 0;
const testedJoints = {
  leftForearm: [.65, 0, 0], rightUpperArm: [.6, 0, 0],
  leftShin: [.55, 0, 0], rightThigh: [.5, 0, 0],
  spine: [0, .5, 0], head: [0, .5, 0], leftWingRoot: [0, 0, .45],
};
for (const [kind, seed, detail] of [['angel', 1, 'hero'], ['demon', 137, 'hero'], ['angel', 500, 'population'], ['demon', 500, 'population']]) {
  const group = createArticulatedSculpture(kind, seed, detail);
  const { rig } = group;
  assert.equal(rig.skeleton.bones.length, 24);
  assert(rig.meshes.every(mesh => mesh.isSkinnedMesh));
  const weightedBones = new Set();
  for (const mesh of rig.meshes) {
    const weights = mesh.geometry.getAttribute('skinWeight');
    const indices = mesh.geometry.getAttribute('skinIndex');
    const positions = mesh.geometry.getAttribute('position');
    assert.equal(weights.count, positions.count);
    assert.equal(indices.count, positions.count);
    for (let vertex = 0; vertex < weights.count; vertex++) {
      let total = 0;
      for (let influence = 0; influence < 4; influence++) {
        const weight = weights.array[vertex * 4 + influence];
        const index = indices.array[vertex * 4 + influence];
        assert(Number.isFinite(weight) && weight >= 0 && weight <= 1, 'Skin weights must be finite and normalized');
        assert(Number.isInteger(index) && index >= 0 && index < 24, 'Skin index must refer to a real bone');
        total += weight;
        if (weight > .001) weightedBones.add(index);
      }
      assert(Math.abs(total - 1) < 1e-5, `Unnormalized skin weights at ${kind} vertex ${vertex}`);
    }
    validatedVertices += weights.count;
    const used = mesh.geometry.getIndex().array;
    for (let i = 0; i < used.length; i += 499) {
      const vertex = used[i];
      const original = new Vector3().fromBufferAttribute(positions, vertex);
      const bound = mesh.getVertexPosition(vertex, new Vector3());
      assert(original.distanceTo(bound) < 1e-5, 'Binding must preserve the authored mesh');
    }
  }
  assert(weightedBones.size >= 18, `${kind} must have meaningful weights across the body`);
  for (const [joint, rotation] of Object.entries(testedJoints)) {
    rig.reset();
    const boneIndex = rig.skeleton.bones.indexOf(rig.bones[joint]);
    const pivot = rig.bindPositions[joint];
    let best;
    for (const mesh of rig.meshes) {
      const positions = mesh.geometry.getAttribute('position');
      const weights = mesh.geometry.getAttribute('skinWeight');
      const indices = mesh.geometry.getAttribute('skinIndex');
      // Only referenced triangles count: unused/shared buffer vertices do not.
      for (const vertex of new Set(mesh.geometry.getIndex().array)) {
        let influence = 0;
        for (let i = 0; i < 4; i++) if (indices.array[vertex * 4 + i] === boneIndex) influence += weights.array[vertex * 4 + i];
        if (influence < .5) continue;
        const point = new Vector3().fromBufferAttribute(positions, vertex);
        const radius = point.distanceTo(pivot);
        if (!best || radius > best.radius) best = { mesh, vertex, radius };
      }
    }
    assert(best, `No rendered vertex influenced by ${kind} ${joint}`);
    const before = best.mesh.getVertexPosition(best.vertex, new Vector3());
    const rootBefore = group.matrixWorld.clone();
    rig.pose({ [joint]: rotation });
    const after = best.mesh.getVertexPosition(best.vertex, new Vector3());
    assert(after.distanceTo(before) > .01, `${kind} ${joint} must deform rendered vertices`);
    assert(group.matrixWorld.equals(rootBefore), 'Articulation must not merely move the whole sculpture');
    rig.reset();
    assert(best.mesh.getVertexPosition(best.vertex, new Vector3()).distanceTo(before) < 1e-5, 'Reset must restore the original geometry');
    validatedDeformations++;
  }
  const gripBefore = rig.weaponGrip.getWorldPosition(new Vector3());
  rig.pose({ rightForearm: [.65, .2, 0] });
  assert(rig.weaponGrip.getWorldPosition(new Vector3()).distanceTo(gripBefore) > .05, 'Weapon grip must follow the hand chain');
  rig.dispose();
}
console.log(JSON.stringify({ uniqueGeometrySHA256: hashes.size, archetypes: archetypes.size, rigsChecked: 4, validatedVertices, independentJointDeformations: validatedDeformations, weaponGripsFollowHands: true }, null, 2));
