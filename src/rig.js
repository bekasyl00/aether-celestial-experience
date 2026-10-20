import * as THREE from 'three';
import {
  createSculpture,
  getCharacterDesign,
  transformSculpturePoint,
  RIG_PARTS,
} from './sculptures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// left denotes negative model X, right positive X; model faces positive Z.
// Rest bone rotations are identity. All pose rotations are local offsets.
export const RIG_HIERARCHY = Object.freeze({
  root: null,
  hips: 'root',
  spine: 'hips',
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  leftUpperArm: 'chest',
  leftForearm: 'leftUpperArm',
  leftHand: 'leftForearm',
  rightUpperArm: 'chest',
  rightForearm: 'rightUpperArm',
  rightHand: 'rightForearm',
  leftThigh: 'hips',
  leftShin: 'leftThigh',
  leftFoot: 'leftShin',
  rightThigh: 'hips',
  rightShin: 'rightThigh',
  rightFoot: 'rightShin',
  leftWingRoot: 'chest',
  leftWingTip: 'leftWingRoot',
  rightWingRoot: 'chest',
  rightWingTip: 'rightWingRoot',
  tail: 'hips',
  tailTip: 'tail',
});

/** Model-space bind pivots, after the very same seeded morph as the vertices. */
export function getRigJointPositions(kind = 'angel', seed = 1) {
  const design = getCharacterDesign(kind, seed);
  const angel = design.kind === 'angel';
  const canonical = {
    root: V(0, 0, 0),
    hips: V(0, 2.82, 0.03),
    spine: V(0, 3.31, 0.025),
    chest: V(0, 4.02, 0.025),
    neck: V(0, 4.35, 0.035),
    head: V(0, 4.84, 0.075),
    tail: V(0, 2.8, -0.25),
    tailTip: V(1.1, 0.8, -0.8),
  };
  for (const side of [-1, 1]) {
    const name = side < 0 ? 'left' : 'right';
    canonical[`${name}UpperArm`] = V(side * 0.65, 4.08, 0.035);
    canonical[`${name}Forearm`] = V(side * 1.02, 3.55, 0.09);
    canonical[`${name}Hand`] = V(side * (angel ? 1.11 : 1.04), angel ? 3.14 : 2.98, 0.36);
    canonical[`${name}Thigh`] = V(side * 0.23, 2.82, 0.03);
    canonical[`${name}Shin`] = V(side * 0.25, 1.55, 0.06);
    canonical[`${name}Foot`] = V(side * 0.26, 0.3, 0.02);
    canonical[`${name}WingRoot`] = V(side * 0.48, 4.0, -0.3);
    canonical[`${name}WingTip`] = angel ? V(side * 2.1, 5.39, -0.42) : V(side * 2.03, 5.56, -0.48);
  }
  return Object.fromEntries(Object.entries(canonical).map(([name, point]) => [
    name, name === 'root' ? point : transformSculpturePoint(point, design),
  ]));
}

function projection(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  return clamp(((point.x - start.x) * dx + (point.y - start.y) * dy + (point.z - start.z) * dz)
    / Math.max(0.00001, lengthSquared), 0, 1);
}

function skinInfluences(tag, point, joints, design) {
  const y = point.y / design.bodyHeight;
  switch (tag) {
    case RIG_PARTS.body: {
      if (y < 3.4) {
        const spine = smooth(2.98, 3.4, y);
        return [['hips', 1 - spine], ['spine', spine]];
      }
      const chest = smooth(3.4, 3.92, y);
      return [['spine', 1 - chest], ['chest', chest]];
    }
    case RIG_PARTS.robe: {
      // The skirt follows separate thighs and shins; the center panel receives
      // continuous left/right weights, rather than rotating as a rigid cone.
      const hips = smooth(2.13, 3.12, y);
      const left = 1 - smooth(-0.21 * design.robeWidth, 0.21 * design.robeWidth, point.x);
      const shin = 1 - smooth(1.1, 1.96, y);
      return [
        ['hips', hips],
        ['leftThigh', (1 - hips) * left * (1 - shin)],
        ['leftShin', (1 - hips) * left * shin],
        ['rightThigh', (1 - hips) * (1 - left) * (1 - shin)],
        ['rightShin', (1 - hips) * (1 - left) * shin],
      ];
    }
    case RIG_PARTS.neck: {
      const head = smooth(4.34, 4.55, y);
      const chest = 1 - smooth(4.2, 4.38, y);
      return [['chest', chest * (1 - head)], ['neck', (1 - chest) * (1 - head)], ['head', head]];
    }
    case RIG_PARTS.head:
    case RIG_PARTS.halo:
      return [['head', 1]];
    case RIG_PARTS.leftHand:
    case RIG_PARTS.leftWeapon:
      return [['leftHand', 1]];
    case RIG_PARTS.rightHand:
    case RIG_PARTS.rightWeapon:
      return [['rightHand', 1]];
    case RIG_PARTS.leftFoot:
      return [['leftFoot', 1]];
    case RIG_PARTS.rightFoot:
      return [['rightFoot', 1]];
    case RIG_PARTS.tail: {
      const tip = smooth(0.45, 1.7, Math.abs(point.x));
      return [['tail', 1 - tip], ['tailTip', tip]];
    }
    default:
      break;
  }
  const side = [
    RIG_PARTS.leftUpperArm, RIG_PARTS.leftForearm, RIG_PARTS.leftThigh,
    RIG_PARTS.leftShin, RIG_PARTS.leftWing,
  ].includes(tag) ? 'left' : 'right';
  if (tag === RIG_PARTS.leftUpperArm || tag === RIG_PARTS.rightUpperArm) {
    const t = projection(point, joints[`${side}UpperArm`], joints[`${side}Forearm`]);
    const chest = (1 - smooth(0, 0.22, t)) * 0.19;
    const elbow = smooth(0.78, 1, t) * 0.5;
    return [['chest', chest], [`${side}UpperArm`, 1 - chest - elbow], [`${side}Forearm`, elbow]];
  }
  if (tag === RIG_PARTS.leftForearm || tag === RIG_PARTS.rightForearm) {
    const t = projection(point, joints[`${side}Forearm`], joints[`${side}Hand`]);
    const elbow = (1 - smooth(0, 0.2, t)) * 0.5;
    const wrist = smooth(0.82, 1, t) * 0.5;
    return [[`${side}UpperArm`, elbow], [`${side}Forearm`, 1 - elbow - wrist], [`${side}Hand`, wrist]];
  }
  if (tag === RIG_PARTS.leftThigh || tag === RIG_PARTS.rightThigh) {
    const t = projection(point, joints[`${side}Thigh`], joints[`${side}Shin`]);
    const hip = (1 - smooth(0, 0.16, t)) * 0.2;
    const knee = smooth(0.78, 1, t) * 0.5;
    return [['hips', hip], [`${side}Thigh`, 1 - hip - knee], [`${side}Shin`, knee]];
  }
  if (tag === RIG_PARTS.leftShin || tag === RIG_PARTS.rightShin) {
    const t = projection(point, joints[`${side}Shin`], joints[`${side}Foot`]);
    const knee = (1 - smooth(0, 0.22, t)) * 0.5;
    const foot = smooth(0.82, 1, t) * 0.5;
    return [[`${side}Thigh`, knee], [`${side}Shin`, 1 - knee - foot], [`${side}Foot`, foot]];
  }
  if (tag === RIG_PARTS.leftWing || tag === RIG_PARTS.rightWing) {
    const t = projection(point, joints[`${side}WingRoot`], joints[`${side}WingTip`]);
    const tip = smooth(0.5, 1, t);
    return [[`${side}WingRoot`, 1 - tip], [`${side}WingTip`, tip]];
  }
  return [['hips', 1]];
}

function addSkinAttributes(geometry, joints, design, indexByBone) {
  const positions = geometry.getAttribute('position');
  const tags = geometry.getAttribute('partTag');
  const skinIndices = new Uint16Array(positions.count * 4);
  const skinWeights = new Float32Array(positions.count * 4);
  const point = new THREE.Vector3();
  for (let i = 0; i < positions.count; i += 1) {
    point.fromBufferAttribute(positions, i);
    const influences = skinInfluences(Math.round(tags?.getX(i) ?? 0), point, joints, design)
      .filter(([, weight]) => weight > 0.000001)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const total = influences.reduce((sum, [, weight]) => sum + weight, 0);
    for (let j = 0; j < influences.length; j += 1) {
      skinIndices[i * 4 + j] = indexByBone[influences[j][0]];
      skinWeights[i * 4 + j] = influences[j][1] / total;
    }
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
}

function splitWeaponTriangles(geometry) {
  const tags = geometry.getAttribute('partTag');
  const indices = geometry.getIndex().array;
  const body = [];
  const weapon = [];
  for (let i = 0; i < indices.length; i += 3) {
    const tag = Math.round(tags.getX(indices[i]));
    const target = tag === RIG_PARTS.leftWeapon || tag === RIG_PARTS.rightWeapon ? weapon : body;
    target.push(indices[i], indices[i + 1], indices[i + 2]);
  }
  if (!weapon.length) return null;
  const weaponGeometry = new THREE.BufferGeometry();
  // These attributes are intentionally shared between the two owned geometries;
  // separate index buffers make the authored weapon independently hideable.
  for (const [name, attribute] of Object.entries(geometry.attributes)) weaponGeometry.setAttribute(name, attribute);
  weaponGeometry.setIndex(weapon);
  geometry.setIndex(body);
  return weaponGeometry;
}

/**
 * A 24-bone, four-weight articulated version of a seeded sculpture.
 *
 * group.rig.pose({rightUpperArm:[x,y,z], rightForearm:[x,y,z]}, blend)
 * uses local Euler offsets (radians, XYZ) from the identity bind pose.
 * Object values may be {rotation:[x,y,z], position:[x,y,z]} for bind-relative
 * translations. Missing joints retain their current pose. reset() restores all.
 *
 * Every returned geometry is owned by this group. Materials remain shared.
 */
export function createArticulatedSculpture(kind = 'angel', seed = 1, detail = 'hero') {
  const source = createSculpture(kind, seed, detail);
  const design = getCharacterDesign(kind, seed);
  const jointPositions = getRigJointPositions(kind, seed);
  const group = new THREE.Group();
  group.name = `${kind}-${design.seed}-articulated`;
  const bones = {};
  const boneList = [];
  const indexByBone = {};
  const rest = {};
  for (const [name, parent] of Object.entries(RIG_HIERARCHY)) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.copy(jointPositions[name]);
    if (parent) bone.position.sub(jointPositions[parent]);
    bones[name] = bone;
    indexByBone[name] = boneList.length;
    boneList.push(bone);
    if (parent) bones[parent].add(bone);
    else group.add(bone);
    rest[name] = {
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
      rotation: new THREE.Euler(),
      modelPosition: jointPositions[name].clone(),
    };
  }
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(boneList);
  skeleton.calculateInverses();
  const meshes = [];
  const defaultWeaponMeshes = [];
  for (const part of source.children) {
    if (!part.isMesh) continue;
    const geometry = part.geometry.clone();
    addSkinAttributes(geometry, jointPositions, design, indexByBone);
    const weaponGeometry = splitWeaponTriangles(geometry);
    const mesh = new THREE.SkinnedMesh(geometry, part.material);
    mesh.name = part.name;
    mesh.userData = { ...part.userData, articulated: true };
    // Dynamic bounds are expensive for detailed figures; the surrounding
    // scene already chooses when foreground figures should be visible.
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    mesh.bind(skeleton);
    meshes.push(mesh);
    if (weaponGeometry) {
      const weapon = new THREE.SkinnedMesh(weaponGeometry, part.material);
      weapon.name = `${part.name}-carried-weapon`;
      weapon.userData = { ...part.userData, articulated: true, authoredWeapon: true };
      weapon.frustumCulled = false;
      weapon.castShadow = true;
      group.add(weapon);
      weapon.bind(skeleton);
      meshes.push(weapon);
      defaultWeaponMeshes.push(weapon);
    }
  }
  // Noncached hero sources are temporary; the rig owns independent attributes.
  if (source.userData.ownedGeometry) source.children.forEach(part => part.geometry?.dispose());

  const weaponGrip = new THREE.Object3D();
  weaponGrip.name = 'right-weapon-grip';
  weaponGrip.position.set(0, -0.1, 0.08);
  bones.rightHand.add(weaponGrip);
  const leftWeaponGrip = new THREE.Object3D();
  leftWeaponGrip.name = 'left-weapon-grip';
  leftWeaponGrip.position.set(0, -0.1, 0.08);
  bones.leftHand.add(leftWeaponGrip);
  const targetQuaternion = new THREE.Quaternion();
  const targetEuler = new THREE.Euler();
  const targetPosition = new THREE.Vector3();
  const rig = {
    bones,
    joints: bones,
    skeleton,
    rest,
    bindPositions: jointPositions,
    meshes,
    defaultWeaponMeshes,
    weaponGrip,
    leftWeaponGrip,
    carryingHand: design.kind === 'angel' ? 'rightHand' : 'leftHand',
    reset() {
      for (const [name, bone] of Object.entries(bones)) {
        bone.position.copy(rest[name].position);
        bone.quaternion.copy(rest[name].quaternion);
        bone.scale.set(1, 1, 1);
      }
      group.updateMatrixWorld(true);
      skeleton.update();
      return group;
    },
    pose(poseMap = {}, blend = 1) {
      const alpha = clamp(blend, 0, 1);
      for (const [name, value] of Object.entries(poseMap)) {
        const bone = bones[name];
        if (!bone || value == null) continue;
        const rotation = Array.isArray(value) || ArrayBuffer.isView(value) ? value : value.rotation;
        if (rotation) {
          targetEuler.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0, 'XYZ');
          targetQuaternion.setFromEuler(targetEuler).premultiply(rest[name].quaternion);
          bone.quaternion.slerp(targetQuaternion, alpha);
        }
        if (!Array.isArray(value) && value.position) {
          targetPosition.fromArray(value.position).add(rest[name].position);
          bone.position.lerp(targetPosition, alpha);
        }
      }
      group.updateMatrixWorld(true);
      skeleton.update();
      return group;
    },
    setDefaultWeaponVisible(visible) {
      defaultWeaponMeshes.forEach(mesh => { mesh.visible = Boolean(visible); });
    },
    dispose() {
      meshes.forEach(mesh => mesh.geometry.dispose());
      skeleton.dispose();
    },
  };
  group.rig = rig;
  group.userData = {
    ...source.userData,
    ownedGeometry: true,
    articulated: true,
    boneCount: boneList.length,
    drawCalls: meshes.length,
    skinning: 'four-weight skeletal deformation',
  };
  rig.reset();
  return group;
}
