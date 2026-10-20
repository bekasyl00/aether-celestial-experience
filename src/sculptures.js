import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Each figure is an original, volumetric sculpture. All ornament is geometry:
// no silhouette cards, figure textures, downloaded models, or image impostors.
const Y = new THREE.Vector3(0, 1, 0);
const cache = new Map();
const materialCache = new Map();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mix = THREE.MathUtils.lerp;
const TAU = Math.PI * 2;
export const RIG_PARTS = Object.freeze({
  body: 0, robe: 1, head: 2, neck: 3,
  leftUpperArm: 4, leftForearm: 5, leftHand: 6,
  rightUpperArm: 7, rightForearm: 8, rightHand: 9,
  leftThigh: 10, leftShin: 11, leftFoot: 12,
  rightThigh: 13, rightShin: 14, rightFoot: 15,
  leftWing: 16, rightWing: 17, halo: 18, tail: 19,
  leftWeapon: 20, rightWeapon: 21,
});
const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const ANGEL_ARCHETYPES = [
  ['Dawn Seraph', 'six-point sun crown', 'broad cathedral wings', 'sun blade'],
  ['Astral Warden', 'orbital halo', 'long falcon wings', 'astral spear'],
  ['Veiled Oracle', 'eye-covering gold mask', 'narrow swept wings', 'oracle staff'],
  ['Crown Bearer', 'tall branching crown', 'rounded layered wings', 'royal scepter'],
  ['Silent Witness', 'faceted face veil', 'asymmetric watchful wings', 'floating lantern'],
  ['Light Archivist', 'engraved arch halo', 'compact scholar wings', 'open stone folio'],
  ['Sword of Heaven', 'split radial halo', 'sharp ascending wings', 'greatsword'],
  ['Chalice Keeper', 'petal crown', 'lower flowing wings', 'ritual chalice'],
  ['Exiled Saint', 'broken crescent halo', 'uneven exile wings', 'barbed pilgrim staff'],
  ['Solar Sentinel', 'five concentric halos', 'wide sunburst wings', 'round sun shield'],
];
const DEMON_ARCHETYPES = [
  ['Ash Tyrant', 'four forward-curving horns', 'wide imperial wings', 'tyrant greatsword'],
  ['Thorn Regent', 'six thorn horns', 'serrated narrow wings', 'thorn scepter'],
  ['Rift Hunter', 'sweeping ram horns', 'long predatory wings', 'crescent glaive'],
  ['Bone Oracle', 'antler-like horn branches', 'tall skeletal wings', 'oracle skull staff'],
  ['Abyss Sentinel', 'low wide bull horns', 'heavy shield wings', 'abyss shield'],
  ['Chain Warden', 'twisted spiral horns', 'asymmetric hooked wings', 'chain flail'],
  ['Blood Herald', 'six outward horns', 'high sanguine wings', 'ritual chalice'],
  ['Iron Reaper', 'blade-shaped horns', 'long angular wings', 'reaper scythe'],
  ['Void Exile', 'one shattered horn', 'uneven void wings', 'broken spear'],
  ['Ember Monarch', 'eight crown horns', 'rounded infernal wings', 'crowned ember orb'],
];
const ANGEL_NAMES = ['Aurel', 'Elior', 'Seren', 'Vaelis', 'Liora', 'Caelis', 'Ithiel', 'Oriel', 'Saphir', 'Zeriel'];
const DEMON_NAMES = ['Vexar', 'Mordren', 'Azrath', 'Nyxor', 'Malvek', 'Sevrath', 'Korven', 'Draziel', 'Vharos', 'Zyrak'];

function randomFor(seed, salt) {
  let n = Math.imul(seed ^ Math.imul(salt + 1, 374761393), 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Every realm has ten structural archetypes and fifty individual designs each. */
export function getCharacterDesign(kind = 'angel', seed = 1) {
  const normalizedKind = kind === 'demon' ? 'demon' : 'angel';
  const n = ((Math.floor(Math.abs(seed)) - 1) % 500 + 500) % 500 + 1;
  const archetypeIndex = Math.floor((n - 1) / 50);
  const individual = (n - 1) % 50;
  const variant = individual % 10;
  const angel = normalizedKind === 'angel';
  const archetype = (angel ? ANGEL_ARCHETYPES : DEMON_ARCHETYPES)[archetypeIndex];
  const key = n + (angel ? 0 : 1000);
  const rnd = salt => randomFor(key, salt);
  const tint = new THREE.Color().setHSL(
    angel ? 0.075 + rnd(20) * 0.09 : 0.96 + rnd(20) * 0.1,
    angel ? 0.12 + rnd(21) * 0.2 : 0.08 + rnd(21) * 0.22,
    angel ? 0.72 + rnd(22) * 0.17 : 0.65 + rnd(22) * 0.2,
  );
  return {
    kind: normalizedKind,
    seed: n,
    archetype: archetype[0],
    archetypeIndex,
    individual,
    variant,
    name: `${(angel ? ANGEL_NAMES : DEMON_NAMES)[variant]} ${(angel ? ['Solis', 'Auriel', 'Velaris', 'Lucent', 'Caelum'] : ['Mordis', 'Vesper', 'Umbra', 'Noxis', 'Cindris'])[Math.floor(individual / 10)]} ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][archetypeIndex]}`,
    signature: `${normalizedKind}-${archetypeIndex + 1}-${individual + 1}-${Math.floor(rnd(30) * 0xffffff).toString(16).padStart(6, '0')}`,
    traits: [...archetype.slice(1), ['ivory', 'silver', 'antique gold', 'rose gold', 'moonstone'][individual % 5] + (angel ? ' finish' : ' ember inlays')],
    palette: { tint: `#${tint.getHexString()}`, accent: angel ? '#d7b977' : '#df6742' },
    tint,
    wingSpan: [1.08, 0.96, 0.86, 1.02, 0.95, 0.84, 1.08, 0.98, 0.9, 1.13][archetypeIndex] * (0.92 + rnd(1) * 0.15),
    wingLift: [1.02, 1.15, 1.18, 0.95, 1.05, 0.9, 1.17, 0.87, 1.0, 1.02][archetypeIndex] * (0.94 + rnd(2) * 0.12),
    asymmetry: (rnd(3) - 0.5) * (archetypeIndex === 8 ? 0.34 : 0.16),
    bodyWidth: 0.83 + rnd(4) * 0.32,
    bodyHeight: 0.93 + rnd(5) * 0.13,
    headWidth: 0.86 + rnd(6) * 0.25,
    headHeight: 0.88 + rnd(7) * 0.24,
    faceDepth: 0.88 + rnd(8) * 0.23,
    noseLength: 0.78 + rnd(9) * 0.5,
    jawWidth: 0.82 + rnd(10) * 0.32,
    robeWidth: 0.86 + rnd(11) * 0.27,
    hornSpread: 0.75 + rnd(12) * 0.55,
    hornSweep: (rnd(13) - 0.5) * 0.5,
    haloTilt: (rnd(14) - 0.5) * 0.28,
    ornamentPhase: rnd(15) * TAU,
    rnd,
  };
}

function palette(kind) {
  if (materialCache.has(kind)) return materialCache.get(kind);
  const angel = kind === 'angel';
  const materials = {
    stone: new THREE.MeshStandardMaterial({
      color: angel ? 0xe7decb : 0x292c32,
      roughness: angel ? 0.43 : 0.37,
      metalness: angel ? 0.13 : 0.62,
      side: THREE.DoubleSide,
    }),
    pale: new THREE.MeshStandardMaterial({
      color: angel ? 0xfff4de : 0x46414a,
      roughness: angel ? 0.37 : 0.45,
      metalness: angel ? 0.12 : 0.42,
      side: THREE.DoubleSide,
    }),
    shadow: new THREE.MeshStandardMaterial({
      color: angel ? 0xb3a590 : 0x100f16,
      roughness: 0.6,
      metalness: angel ? 0.26 : 0.55,
      side: THREE.DoubleSide,
    }),
    gold: new THREE.MeshStandardMaterial({
      color: angel ? 0xc8a557 : 0x975841,
      roughness: 0.28,
      metalness: 0.88,
      side: THREE.DoubleSide,
    }),
    membrane: new THREE.MeshStandardMaterial({
      color: angel ? 0xd6ccbb : 0x501c27,
      roughness: 0.63,
      metalness: angel ? 0.08 : 0.26,
      side: THREE.DoubleSide,
    }),
    light: new THREE.MeshStandardMaterial({
      color: angel ? 0xffe6a7 : 0xff582b,
      emissive: angel ? 0xffc46c : 0xff2610,
      emissiveIntensity: angel ? 1.7 : 2.9,
      metalness: 0.4,
      roughness: 0.3,
      side: THREE.DoubleSide,
    }),
  };
  for (const [name, material] of Object.entries(materials)) {
    material.name = `${kind}-${name}`;
    material.vertexColors = true;
  }
  materialCache.set(kind, materials);
  return materials;
}

function indexedGeometry(vertices, indices) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// A tapered, optionally ridged anatomical tube, with genuinely curved volume.
function tube(points, radius = 0.05, segments = 18, sides = 7, taper = () => 1, twist = 0) {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(segments, false);
  const vertices = [];
  const indices = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const point = curve.getPointAt(t);
    const r = radius * taper(t);
    for (let j = 0; j <= sides; j += 1) {
      const a = (j / sides) * TAU + t * twist;
      const ring = Math.sin(t * Math.PI * 40) * 0.035 + 1;
      const p = point.clone()
        .addScaledVector(frames.normals[i], Math.cos(a) * r * ring)
        .addScaledVector(frames.binormals[i], Math.sin(a) * r * ring);
      vertices.push(p.x, p.y, p.z);
      if (i < segments && j < sides) {
        const a0 = i * (sides + 1) + j;
        const b = a0 + sides + 1;
        indices.push(a0, a0 + 1, b, b, a0 + 1, b + 1);
      }
    }
  }
  // Caps matter when the sculpture is inspected from above and below.
  const start = vertices.length / 3;
  vertices.push(...points[0].toArray(), ...points.at(-1).toArray());
  for (let j = 0; j < sides; j += 1) {
    indices.push(start, j + 1, j);
    const end = segments * (sides + 1);
    indices.push(start + 1, end + j, end + j + 1);
  }
  return indexedGeometry(vertices, indices);
}

function surface(rows, columns, callback, close = false) {
  const vertices = [];
  const indices = [];
  for (let i = 0; i <= rows; i += 1) {
    for (let j = 0; j <= columns; j += 1) {
      vertices.push(...callback(i / rows, j / columns));
      if (i < rows && j < columns) {
        const a = i * (columns + 1) + j;
        const b = a + columns + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = indexedGeometry(vertices, indices);
  if (close) geometry.computeBoundingSphere();
  return geometry;
}

function featherSurface(rows = 16, columns = 5) {
  return surface(rows, columns, (t, s) => {
    const u = s * 2 - 1;
    const width = Math.pow(Math.sin(Math.PI * t), 0.68) * (1 - t * 0.16);
    const x = u * width * (u < 0 ? 0.44 : 0.56) + 0.12 * t * t;
    const z = Math.sin(Math.PI * t) * 0.09
      - u * u * 0.075 * width
      + (1 - Math.abs(u)) * 0.03
      + Math.sin((t * 32 - Math.abs(u) * 3) * Math.PI) * 0.007 * Math.abs(u) * width;
    return [x, t, z + t * t * 0.055];
  });
}

function robeGeometry(angel, low = false) {
  return surface(low ? 9 : 66, low ? 14 : 96, (t, s) => {
    const a = s * TAU;
    const y = 0.18 + t * 3.18;
    const flare = Math.pow(1 - t, 1.65);
    const pleat = Math.cos(a * (angel ? 20 : 14) + t * 3.5)
      * (0.034 + 0.095 * flare)
      + Math.sin(a * 39 - t * 10) * 0.014 * (1 - t);
    const radius = 0.35 + flare * (angel ? 0.69 : 0.48) + pleat;
    const swirl = a + 0.1 * Math.sin(t * Math.PI) + (1 - t) * 0.1;
    const hem = Math.pow(1 - t, 12) * (0.06 + Math.sin(a * 5) * 0.085);
    return [
      Math.cos(swirl) * radius + Math.sin(t * 4) * 0.055,
      y + hem,
      Math.sin(swirl) * radius * 0.67 + 0.05,
    ];
  }, true);
}

function torsoGeometry(angel, low = false) {
  return surface(low ? 7 : 32, low ? 12 : 54, (t, s) => {
    const a = s * TAU;
    const y = 2.75 + t * 1.51;
    const waist = 0.35 + Math.sin(t * Math.PI * 0.65) * (angel ? 0.34 : 0.43);
    const breast = Math.exp(-Math.pow((t - 0.72) * 7, 2)) * 0.09;
    const radius = waist + Math.cos(a * 6) * 0.014;
    return [
      Math.cos(a) * radius,
      y + Math.cos(a) ** 2 * Math.max(0, t - 0.85) * -0.6,
      Math.sin(a) * (0.26 + breast) + 0.02,
    ];
  }, true);
}

class Sculptor {
  constructor(kind, detail, seed = 1) {
    this.kind = kind;
    this.detail = detail;
    this.design = getCharacterDesign(kind, seed);
    this.part = 'body';
    this.parts = new Map();
    this.detailCount = 0;
    this.materials = palette(kind);
    this.temp = new THREE.Matrix4();
  }

  add(g, material = 'stone', matrix = null, details = 1) {
    // Standardize attributes before merging the large number of ornaments.
    const geometry = g.clone();
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
    }
    if (!geometry.index) {
      geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
    }
    if (matrix) geometry.applyMatrix4(matrix);
    geometry.setAttribute('partTag', new THREE.Float32BufferAttribute(
      new Float32Array(geometry.attributes.position.count).fill(RIG_PARTS[this.part] ?? RIG_PARTS.body), 1,
    ));
    if (!this.parts.has(material)) this.parts.set(material, []);
    this.parts.get(material).push(geometry);
    this.detailCount += details;
  }

  ellipsoid(position, scale, material = 'stone', resolution = 14, rotation = 0) {
    const g = new THREE.SphereGeometry(1, resolution, Math.max(6, resolution - 4));
    this.add(g, material, new THREE.Matrix4().compose(position,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rotation)), scale));
    g.dispose();
  }

  path(points, radius = 0.025, material = 'gold', segments = 16, sides = 6, taper, twist = 0) {
    const g = tube(points, radius, segments, sides, taper, twist);
    this.add(g, material);
    g.dispose();
  }

  ring(position, radius, thickness, material = 'gold', rotation = new THREE.Euler(), arc = TAU, segments = 56) {
    const g = new THREE.TorusGeometry(radius, thickness, 5, segments, arc);
    this.add(g, material, new THREE.Matrix4().compose(
      position, new THREE.Quaternion().setFromEuler(rotation), V(1, 1, 1),
    ));
    g.dispose();
  }

  finish() {
    const group = new THREE.Group();
    let triangles = 0;
    for (const [name, geometries] of this.parts) {
      const merged = mergeGeometries(geometries, false);
      applyDesignGeometry(merged, this.design, name);
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      triangles += merged.index.count / 3;
      const mesh = new THREE.Mesh(merged, this.materials[name]);
      mesh.name = `${this.kind}-${name}`;
      mesh.userData.materialKey = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      geometries.forEach((geometry) => geometry.dispose());
    }
    group.name = `${this.kind}-${this.detail}-sculpture`;
    group.userData = {
      kind: this.kind,
      detail: this.detail,
      detailCount: this.detailCount,
      triangleCount: triangles,
      drawCalls: group.children.length,
      procedural: true,
      seed: this.design.seed,
      signature: this.design.signature,
      characterName: this.design.name,
      archetype: this.design.archetype,
      traits: this.design.traits,
    };
    return group;
  }
}

export function transformSculpturePoint(point, design, target = new THREE.Vector3()) {
  let x = point.x;
  let y = point.y;
  let z = point.z;
  const ax = Math.abs(x);
  const side = x < 0 ? -1 : 1;
  const wing = smooth(0.95, 1.65, ax) * smooth(2.3, 3.4, y) * (1 - smooth(0.1, 0.45, z));
  x *= mix(1, design.wingSpan * (1 + side * design.asymmetry), wing);
  y += (y - 4.0) * (design.wingLift - 1) * wing;
  z += Math.sin((ax - 0.8) * 1.2) * (design.rnd(17) - 0.5) * 0.32 * wing;
  const body = (1 - smooth(0.65, 1.5, ax)) * (1 - smooth(4.2, 4.45, y));
  x *= mix(1, design.bodyWidth, body);
  z *= mix(1, 0.92 + design.bodyWidth * 0.09, body);
  const skirt = 1 - smooth(2.5, 3.25, y);
  x *= mix(1, design.robeWidth, skirt);
  z *= mix(1, design.robeWidth, skirt);
  // The cranial morph also affects ears, curls, eyes, nose and crown mounts.
  const head = smooth(4.35, 4.55, y) * (1 - smooth(0.48, 0.72, ax))
    * (1 - smooth(5.26, 5.42, y));
  x *= mix(1, design.headWidth, head);
  const jaw = head * (1 - smooth(4.63, 4.82, y));
  x *= mix(1, design.jawWidth, jaw);
  y += (y - 4.84) * (design.headHeight - 1) * head;
  z *= mix(1, design.faceDepth, head);
  if (z > 0.35 && ax < 0.075 && y > 4.72 && y < 4.96) {
    z = 0.35 + (z - 0.35) * design.noseLength;
  }
  // Independent armor rib and robe pleat dimensions give each figure its own
  // silhouette even without its crown, wings or signature carried object.
  if (y < 3.1) {
    const a = Math.atan2(z, x);
    const ripple = 1 + Math.sin(a * (9 + design.variant) + design.ornamentPhase + y * 2.2)
      * 0.014 * (1 - smooth(2.5, 3.1, y));
    x *= ripple; z *= ripple;
  }
  y *= design.bodyHeight;
  return target.set(x, y, z);
}

// Identical anatomical transformations are applied to the gallery and inspection
// meshes. Every seed changes actual vertices, never just the object transform.
function applyDesignGeometry(geometry, design, materialKey) {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const tint = design.tint.clone();
  const transformed = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    transformed.set(position.getX(i), position.getY(i), position.getZ(i));
    transformSculpturePoint(transformed, design, transformed);
    const { x, y, z } = transformed;
    position.setXYZ(i, x, y, z);
    const regionTint = materialKey === 'light' ? 1 : 0.93 + 0.07 * Math.sin(y * 1.1 + design.ornamentPhase);
    colors[i * 3] = tint.r * regionTint;
    colors[i * 3 + 1] = tint.g * regionTint;
    colors[i * 3 + 2] = tint.b * regionTint;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
}

function buildFace(b, angel) {
  b.part = 'head';
  // Cranial volume, cheek planes, jaw and brow form an actual sculptural face.
  const head = surface(32, 42, (t, s) => {
    const phi = t * Math.PI;
    const theta = s * TAU;
    const sy = Math.cos(phi);
    const radial = Math.sin(phi);
    const jaw = sy < -0.25 ? 1 - (-sy - 0.25) * 0.23 : 1;
    const x = Math.cos(theta) * radial * 0.32 * jaw;
    let z = Math.sin(theta) * radial * 0.29;
    if (z > 0) {
      const brow = Math.exp(-((sy - 0.14) ** 2) * 180) * 0.038;
      const cheek = Math.exp(-((sy + 0.12) ** 2) * 45) * Math.abs(x) * 0.11;
      z += brow + cheek;
    }
    return [x, 4.84 + sy * 0.44, z + 0.075];
  });
  b.add(head, 'pale'); head.dispose();
  b.part = 'neck';
  b.path([V(0, 4.23, 0), V(0, 4.4, 0.035), V(0, 4.52, 0.04)], 0.17, 'pale', 12, 12,
    t => 1 - Math.sin(Math.PI * t) * 0.08);
  b.part = 'head';
  for (const s of [-1, 1]) {
    b.ellipsoid(V(s * 0.317, 4.83, 0.06), V(0.06, 0.115, 0.075), 'pale', 12);
    b.path([V(s * 0.326, 4.87, 0.105), V(s * 0.35, 4.83, 0.09), V(s * 0.33, 4.77, 0.11)],
      0.014, 'shadow', 10, 5);
    b.ellipsoid(V(s * 0.128, 4.88, 0.338), V(0.083, 0.032, 0.022), 'shadow', 12, -s * 0.1);
    b.ellipsoid(V(s * 0.128, 4.885, 0.358), V(0.052, 0.014, 0.012), angel ? 'gold' : 'light', 10);
    b.path([V(s * 0.055, 4.96, 0.344), V(s * 0.13, 4.976, 0.345), V(s * 0.21, 4.95, 0.304)],
      0.023, 'pale', 12, 5);
    b.path([V(s * 0.063, 4.856, 0.35), V(s * 0.135, 4.844, 0.354), V(s * 0.202, 4.861, 0.32)],
      0.011, 'gold', 10, 4);
    b.ellipsoid(V(s * 0.18, 4.76, 0.287), V(0.1, 0.09, 0.049), 'pale', 12, s * 0.2);
  }
  const nose = indexedGeometry([
    -0.04, 4.94, 0.34, 0.04, 4.94, 0.34, 0, 4.77, 0.455,
    -0.064, 4.756, 0.358, 0.064, 4.756, 0.358, 0, 4.74, 0.389,
  ], [0, 2, 1, 0, 3, 2, 1, 2, 4, 3, 5, 2, 2, 5, 4, 3, 4, 5]);
  b.add(nose, 'pale'); nose.dispose();
  b.path([V(-0.091, 4.664, 0.315), V(-0.028, 4.679, 0.349), V(0, 4.669, 0.355),
    V(0.029, 4.68, 0.347), V(0.09, 4.664, 0.315)], 0.014, 'shadow', 16, 5);
  b.path([V(-0.074, 4.646, 0.324), V(0, 4.63, 0.35), V(0.074, 4.646, 0.324)],
    0.021, 'pale', 14, 6);
  b.ellipsoid(V(0, 4.55, 0.265), V(0.12, 0.06, 0.054), 'pale', 14);

  // Individual swept curls wrap the back and sides; the face remains clear.
  const curls = angel ? 72 : 34;
  for (let i = 0; i < curls; i += 1) {
    const a = (i / curls) * TAU;
    const row = i % 4;
    const front = Math.sin(a) > 0.63;
    const startY = 5.1 + row * 0.035;
    const endY = front ? 5.02 + row * 0.012 : 4.5 + (i % 7) * 0.055;
    const x = Math.cos(a) * 0.29;
    const z = Math.sin(a) * 0.27 + 0.075;
    const curl = Array.from({ length: 9 }, (_, k) => {
      const t = k / 8;
      const r = 0.028 + t * 0.027;
      return V(
        x * (1 + t * 0.15) + Math.cos(t * TAU * 1.3 + i) * r,
        mix(startY, endY, t),
        z + Math.sin(t * TAU * 1.3 + i) * r + (front ? 0.02 : -t * 0.015),
      );
    });
    b.path(curl, angel ? 0.035 : 0.043, angel ? 'gold' : 'shadow', 18, 5,
      t => 0.85 - t * 0.48);
  }
}

function addBody(b, angel) {
  const torso = torsoGeometry(angel);
  const robe = robeGeometry(angel);
  b.part = 'body';
  b.add(torso);
  b.part = 'robe';
  b.add(robe, angel ? 'stone' : 'shadow');
  torso.dispose(); robe.dispose();

  // Raised long folds following the spiralling, flared fabric.
  for (let i = 0; i < (angel ? 32 : 20); i += 1) {
    const a = (i / (angel ? 32 : 20)) * TAU;
    const points = Array.from({ length: 12 }, (_, j) => {
      const t = j / 11;
      const flare = Math.pow(1 - t, 1.65);
      const r = 0.38 + flare * (angel ? 0.73 : 0.49);
      return V(Math.cos(a + (1 - t) * 0.13) * r,
        0.27 + t * 2.98, Math.sin(a + (1 - t) * 0.13) * r * 0.67 + 0.05);
    });
    b.path(points, angel ? 0.012 : 0.019, angel ? 'pale' : 'gold', 22, 4,
      t => 0.7 + Math.sin(t * Math.PI) * 0.5);
  }
  // The embroidered lower hem is an actual continuous toroidal weave.
  for (let band = 0; band < 3; band += 1) {
    const points = Array.from({ length: 65 }, (_, i) => {
      const a = (i / 64) * TAU;
      const r = (angel ? 1.0 : 0.8) - band * 0.045;
      return V(Math.cos(a) * r, 0.26 + band * 0.12 + Math.sin(a * 5) * 0.045,
        Math.sin(a) * r * 0.67 + 0.05);
    });
    b.path(points, 0.013, 'gold', 96, 5);
  }

  // Layered breastplate follows the ribs and shoulder girdle.
  b.part = 'body';
  for (let side of [-1, 1]) {
    for (let layer = 0; layer < 7; layer += 1) {
      const points = Array.from({ length: 9 }, (_, i) => {
        const t = i / 8;
        return V(side * (0.035 + t * (0.54 - layer * 0.018)),
          4.0 - layer * 0.085 - Math.sin(t * Math.PI) * 0.045,
          0.35 + Math.sin(t * Math.PI) * 0.045 - t * t * 0.07);
      });
      b.path(points, 0.037 - layer * 0.0018, layer % 3 === 0 ? 'gold' : 'pale', 18, 6);
    }
    b.ellipsoid(V(side * 0.29, 3.99, 0.20), V(0.35, 0.25, 0.19), 'stone', 20, side * 0.1);
    // Collarbone wreath with little carved leaves.
    b.path([V(0, 4.14, 0.3), V(side * 0.26, 4.21, 0.3), V(side * 0.55, 4.13, 0.16)],
      0.026, 'gold', 16, 6);
    for (let i = 0; i < 18; i += 1) {
      const t = i / 17;
      b.ellipsoid(V(side * (0.06 + t * 0.5), 4.15 + Math.sin(t * Math.PI) * 0.065,
        0.325 - t * 0.13), V(0.025, 0.066, 0.014), i % 3 ? 'gold' : 'pale', 8, side * 0.55);
    }
  }

  // Sash: an asymmetrical folded strip across the metal chest.
  if (angel) {
    const sash = surface(36, 10, (t, s) => {
      const x = mix(-0.55, 0.35, t) + (s - 0.5) * 0.3;
      return [x, mix(4.1, 3.0, t) - (s - 0.5) * 0.18,
        0.38 + Math.sin(t * Math.PI) * 0.07 + Math.sin(s * Math.PI * 7 + t * 3) * 0.016];
    });
    b.add(sash, 'pale'); sash.dispose();
  }

  // Belt, medallion, hanging chains and tear-shaped gems.
  for (let band = 0; band < 3; band += 1) {
    const points = Array.from({ length: 49 }, (_, i) => {
      const a = i / 48 * TAU;
      return V(Math.cos(a) * 0.405, 3.01 + band * 0.065, Math.sin(a) * 0.295 + 0.025);
    });
    b.path(points, 0.025, 'gold', 56, 6);
  }
  b.ring(V(0, 3.08, 0.36), 0.15, 0.025, 'gold');
  b.ellipsoid(V(0, 3.08, 0.365), V(0.065, 0.096, 0.034), 'light', 12);
  for (let side of [-1, 1]) {
    for (let chain = 0; chain < 3; chain += 1) {
      for (let i = 0; i < 25; i += 1) {
        const t = i / 24;
        b.ring(V(side * (0.03 + t * (0.34 + chain * 0.035)),
          2.96 - Math.sin(t * Math.PI) * (0.22 + chain * 0.09),
          0.32 - t * 0.08), 0.017, 0.006, 'gold',
        new THREE.Euler(i % 2 ? Math.PI / 3 : 0, 0, 0), TAU, 7);
      }
    }
  }
}

function addArms(b, angel) {
  for (let s of [-1, 1]) {
    const side = s < 0 ? 'left' : 'right';
    const shoulder = V(s * 0.65, 4.08, 0.035);
    const elbow = V(s * 1.02, 3.55, 0.09);
    const wrist = V(s * (angel ? 1.11 : 1.04), angel ? 3.14 : 2.98, 0.36);
    const knuckle = V(s * (angel ? 1.15 : 1.08), angel ? 2.94 : 2.76, 0.4);
    b.part = `${side}UpperArm`;
    b.path([shoulder, V(s * 0.83, 3.88, 0.035), elbow], 0.21, 'pale', 24, 12,
      t => 1 - t * 0.24 + Math.sin(t * Math.PI) * 0.07);
    b.part = `${side}Forearm`;
    b.path([elbow, V(s * 1.065, 3.35, 0.22), wrist], 0.16, 'stone', 24, 10,
      t => 1.04 - t * 0.47);
    b.part = `${side}Hand`;
    b.path([wrist, knuckle], 0.12, 'pale', 10, 9, t => 1 - t * 0.16);
    // Articulated fingers, with three phalanges and individual nails/claws.
    for (let finger = 0; finger < 5; finger += 1) {
      const thumb = finger === 4;
      const spread = (finger - 1.5) * 0.048;
      const length = thumb ? 0.18 : [0.24, 0.29, 0.275, 0.22][finger];
      const start = knuckle.clone().add(V(thumb ? -s * 0.1 : spread, thumb ? 0.08 : -0.02, 0.015));
      const end = start.clone().add(V(thumb ? -s * 0.09 : s * 0.025, -length, thumb ? 0.1 : 0.075));
      const middle = start.clone().lerp(end, 0.56).add(V(0, 0, 0.03));
      b.path([start, middle, end], thumb ? 0.032 : 0.026, 'pale', 12, 6,
        t => 1 - t * 0.3);
      b.ellipsoid(middle, V(0.03, 0.035, 0.03), 'stone', 8);
      if (!angel) {
        b.path([end, end.clone().add(V(0, -0.07, 0.045)), end.clone().add(V(0, -0.12, 0.02))],
          0.028, 'gold', 9, 5, t => 1 - t * 0.97);
      } else {
        b.ellipsoid(end.clone().add(V(0, 0.016, 0.025)), V(0.017, 0.028, 0.007), 'gold', 8);
      }
    }
    // Large layered pauldrons with overlapping scales.
    b.part = `${side}UpperArm`;
    for (let layer = 0; layer < 5; layer += 1) {
      const center = V(s * (0.67 + layer * 0.048), 4.14 - layer * 0.075, 0.025);
      b.ellipsoid(center, V(0.3 - layer * 0.017, 0.17, 0.3 - layer * 0.025),
        layer % 2 ? 'gold' : 'stone', 16, s * 0.3);
      for (let stud = 0; stud < 9; stud += 1) {
        const a = stud / 8 * Math.PI;
        b.ellipsoid(V(center.x + Math.cos(a) * (0.24 - layer * 0.012),
          center.y + Math.sin(a) * 0.08, center.z + 0.24 - layer * 0.022),
        V(0.023, 0.023, 0.019), 'gold', 7);
      }
    }
    // Etched armlets and braided wrist cuffs.
    b.part = `${side}Forearm`;
    for (let band = 0; band < 9; band += 1) {
      const t = 0.15 + band / 12 * 0.7;
      const center = elbow.clone().lerp(wrist, t);
      const radius = mix(0.165, 0.105, t);
      b.ring(center, radius, band % 3 ? 0.012 : 0.025, band % 3 ? 'gold' : 'stone',
        new THREE.Euler(Math.PI / 2 - 0.4, 0, s * 0.1), TAU, 22);
    }
    if (!angel) {
      b.part = `${side}UpperArm`;
      for (let i = 0; i < 7; i += 1) {
        const p = V(s * (0.75 + i * 0.07), 4.25 - i * 0.09, -0.02);
        b.path([p, p.clone().add(V(s * 0.13, 0.18, -0.04)),
          p.clone().add(V(s * 0.22, 0.32 - i * 0.015, -0.12))],
        0.082 - i * 0.005, 'gold', 12, 7, t => Math.pow(1 - t, 0.8) + 0.015);
      }
    }
  }
}

function addAngelWings(b) {
  const feather = featherSurface();
  const shaft = tube([V(0, 0.03, 0.038), V(0.025, 0.5, 0.13), V(0.12, 0.97, 0.065)],
    0.009, 12, 4, t => 1 - t * 0.7);
  // Feather micro-ribs have real relief, visible at oblique inspection angles.
  const barbs = [];
  for (let i = 0; i < 8; i += 1) {
    const t = 0.18 + i * 0.078;
    const w = Math.pow(Math.sin(Math.PI * t), 0.68) * (1 - t * 0.16);
    for (let s of [-1, 1]) {
      barbs.push(tube([
        V(0.12 * t * t, t, Math.sin(Math.PI * t) * 0.09 + 0.034),
        V(s * w * 0.23 + 0.12 * t * t, t + 0.045, Math.sin(Math.PI * t) * 0.08 + 0.02),
        V(s * w * 0.46 + 0.12 * t * t, t + 0.08, Math.sin(Math.PI * t) * 0.05),
      ], 0.0035, 3, 3, x => 1 - x * 0.75));
    }
  }
  for (const side of [-1, 1]) {
    b.part = side < 0 ? 'leftWing' : 'rightWing';
    b.path([V(side * 0.48, 4.0, -0.21), V(side * 1.08, 4.52, -0.37),
      V(side * 2.1, 5.39, -0.42), V(side * 3.22, 6.08, -0.6)],
    0.16, 'stone', 36, 10, t => 1 - t * 0.84);
    for (let tier = 0; tier < 5; tier += 1) {
      const count = [28, 27, 25, 23, 21][tier];
      for (let i = 0; i < count; i += 1) {
        const t = i / (count - 1);
        const root = V(side * (0.55 + t * 2.54 + tier * 0.014),
          3.99 + 1.94 * Math.pow(t, 1.16) + tier * 0.038,
          -0.4 + tier * 0.086 - Math.sin(t * Math.PI) * 0.11);
        const outerTip = V(side * (0.66 + Math.pow(t, 0.92) * 3.46),
          1.42 + 5.17 * Math.pow(t, 1.07),
          -0.19 - Math.sin(t * Math.PI) * 0.23);
        const tip = root.clone().lerp(outerTip, [1, 0.82, 0.64, 0.47, 0.31][tier]);
        const direction = tip.clone().sub(root);
        const length = direction.length();
        const q = new THREE.Quaternion().setFromUnitVectors(Y, direction.normalize());
        q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, side * 0.13 + Math.sin(t * Math.PI) * 0.1));
        const width = (0.22 + Math.sin(t * Math.PI) * 0.12) * (1 - tier * 0.085);
        const matrix = new THREE.Matrix4().compose(root, q, V(width, length, 0.5));
        b.add(feather, (i + tier) % 4 ? 'pale' : 'stone', matrix);
        b.add(shaft, 'gold', matrix);
        // Inner covert feathers have fewer ribs; primary feathers have sixteen.
        for (let k = 0; k < barbs.length; k += tier > 2 ? 2 : 1) {
          b.add(barbs[k], 'membrane', matrix);
        }
      }
    }
    // A laurel branch follows the wing's structural shoulder.
    for (let i = 0; i < 26; i += 1) {
      const t = i / 25;
      b.ellipsoid(V(side * (0.55 + t * 2.38), 4.12 + t * 1.82, -0.05),
        V(0.057, 0.145, 0.028), i % 2 ? 'gold' : 'pale', 9, -side * 0.62);
    }
  }
  feather.dispose(); shaft.dispose(); barbs.forEach(g => g.dispose());
}

function addHalo(b, low = false) {
  b.part = 'halo';
  const d = b.design;
  const archetype = d.archetypeIndex;
  const center = V(0, 5.04, -0.16);
  const rings = [
    [0.76, 0.026, 'gold'], [0.81, 0.012, 'light'], [0.88, 0.02, 'gold'],
    [1.0, 0.011, 'gold'],
  ];
  if (archetype === 9) rings.push([1.12, 0.018, 'gold']);
  const arc = archetype === 8 ? TAU * 0.67 : archetype === 6 ? TAU * 0.83 : TAU;
  const baseRadius = 0.9 + d.variant * 0.017;
  for (let i = 0; i < rings.length; i += low ? 2 : 1) {
    const [r, thickness, mat] = rings[i];
    const pointCount = low ? 22 : 97;
    const points = Array.from({ length: pointCount }, (_, j) => {
      const a = j / (pointCount - 1) * arc + d.haloTilt + (archetype === 8 ? Math.PI * 0.13 : 0);
      const petals = archetype === 7 ? Math.cos(a * 8) * 0.075 : archetype === 0 ? Math.cos(a * 6) * 0.025 : 0;
      const radius = (r + petals) * baseRadius;
      const z = -0.16 + (archetype === 1 ? Math.cos(a) * (i % 2 ? 0.42 : -0.42) : 0);
      return V(Math.cos(a) * radius, 5.04 + Math.sin(a) * radius * (archetype === 5 ? 1.17 : 1),
        z + Math.sin(a) * d.haloTilt);
    });
    b.path(points, thickness, mat, low ? 21 : 96, low ? 3 : 5);
  }
  const rayCount = 64 + d.variant * 4;
  for (let i = 0; i < rayCount; i += low ? 8 : 1) {
    const a = i / rayCount * arc + d.haloTilt;
    const ray = i % 8 === 0 ? 0.3 : i % 4 === 0 ? 0.17 : 0.075;
    const p = V(Math.cos(a) * 0.89 * baseRadius, 5.04 + Math.sin(a) * 0.89 * baseRadius, -0.16);
    b.path([p, V(Math.cos(a) * (0.9 + ray) * baseRadius, 5.04 + Math.sin(a) * (0.9 + ray) * baseRadius, -0.16)],
      i % 4 ? 0.007 : 0.013, i % 4 ? 'gold' : 'light', 2, 4, t => 1 - t * 0.72);
    if (!low && i % 3 === 0) b.ellipsoid(p, V(0.024, 0.024, 0.022), 'pale', 7);
  }
  // An openwork crown sits on the forehead, separate from the floating halo.
  b.ring(V(0, 5.08, 0.06), 0.317, 0.026, 'gold', new THREE.Euler(Math.PI / 2, 0, 0), TAU, low ? 16 : 64);
  const crownCount = [12, 8, 7, 17, 6, 9, 11, 16, 5, 24][archetype] + d.individual % 3;
  for (let i = 0; i < crownCount; i += 1) {
    const a = i / crownCount * TAU;
    const r = 0.322;
    const crownHeight = (archetype === 3 ? 0.33 : 0.16) + Math.sin(a * 3 + d.ornamentPhase) * 0.055;
    b.path([V(Math.cos(a) * r, 5.08, Math.sin(a) * r + 0.06),
      V(Math.cos(a) * r * 1.05, 5.19, Math.sin(a) * r * 1.05 + 0.06),
      V(Math.cos(a) * r * 0.85, 5.08 + crownHeight, Math.sin(a) * r * 0.85 + 0.06)],
    0.018, 'gold', low ? 3 : 8, low ? 3 : 5, t => 1 - t * 0.7);
  }
  b.ellipsoid(V(0, 5.13, 0.395), V(0.045, 0.075, 0.022), 'light', 10);
}

function hornDesign(design) {
  const a = design.archetypeIndex;
  const count = [4, 6, 2, 4, 2, 2, 6, 2, 1, 8][a];
  const horns = [];
  for (let i = 0; i < count; i += 1) {
    const side = i % 2 ? 1 : -1;
    const tier = Math.floor(i / 2);
    const scale = tier === 0 ? 1 : 0.66 - tier * 0.12;
    const spread = design.hornSpread * scale;
    const sweep = design.hornSweep;
    let points;
    if (a === 2) {
      points = [
        V(side * 0.24, 5.1, -0.04), V(side * 0.63 * spread, 5.45, -0.1),
        V(side * 0.85 * spread, 5.12, 0.04), V(side * 0.65 * spread, 4.91, 0.29),
        V(side * 0.43 * spread, 5.17, 0.4),
      ];
    } else if (a === 4) {
      points = [
        V(side * 0.25, 5.11, 0), V(side * 0.64 * spread, 5.12, -0.05),
        V(side * 0.94 * spread, 5.31, 0), V(side * 1.03 * spread, 5.58, 0.13),
      ];
    } else if (a === 5) {
      points = Array.from({ length: 10 }, (_, j) => {
        const t = j / 9;
        return V(side * (0.24 + t * 0.22 * spread + Math.sin(t * TAU * 1.3) * 0.13),
          5.1 + t * (1.1 + design.variant * 0.019),
          Math.cos(t * TAU * 1.3) * 0.13 - 0.07 + sweep * t);
      });
    } else {
      const rootX = side * (0.23 - tier * 0.06);
      const rootZ = 0.03 - tier * 0.13;
      const lean = a === 7 ? -0.24 : a === 0 ? 0.2 : 0;
      points = [
        V(rootX, 5.12, rootZ), V(rootX + side * 0.26 * spread, 5.12 + 0.31 * scale, rootZ - 0.05),
        V(rootX + side * 0.37 * spread, 5.12 + 0.71 * scale, rootZ - 0.15 + sweep),
        V(rootX + side * (0.25 + lean) * spread, 5.12 + 1.03 * scale, rootZ - 0.05 + sweep),
        V(rootX + side * (0.06 + lean) * spread, 5.12 + 1.23 * scale, rootZ + 0.12 + sweep),
      ];
    }
    horns.push({ points, radius: 0.185 * scale });
    if (a === 3) {
      const p = points[2];
      horns.push({ points: [p, p.clone().add(V(side * 0.21, 0.16, -0.08)),
        p.clone().add(V(side * 0.26, 0.48, -0.06))], radius: 0.07 });
    }
  }
  return horns;
}

function addDesignedHorns(b, low = false) {
  b.part = 'head';
  for (const { points, radius } of hornDesign(b.design)) {
    const curve = new THREE.CatmullRomCurve3(points);
    b.path(points, radius, 'stone', low ? 7 : 52, low ? 5 : 11,
      t => Math.pow(1 - t, 0.8) + 0.015, 2);
    if (!low) {
      for (let i = 1; i < 34; i += 1) {
        const t = i / 36;
        const p = curve.getPoint(t);
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), curve.getTangent(t).normalize());
        const g = new THREE.TorusGeometry(radius * 1.02 * (Math.pow(1 - t, 0.8) + 0.015),
          0.012 * (1 - t * 0.65), 4, 10);
        b.add(g, i % 4 ? 'gold' : 'shadow', new THREE.Matrix4().compose(p, q, V(1, 1, 1)));
        g.dispose();
      }
    }
  }
}

function addDemonWings(b) {
  for (const side of [-1, 1]) {
    b.part = side < 0 ? 'leftWing' : 'rightWing';
    const shoulder = V(side * 0.43, 4.0, -0.28);
    const knuckle = V(side * 2.03, 5.56, -0.48);
    const tips = [
      V(side * 2.6, 6.25, -0.54),
      V(side * 3.92, 5.4, -0.43),
      V(side * 3.62, 3.88, -0.45),
      V(side * 2.77, 2.3, -0.55),
      V(side * 1.4, 1.72, -0.48),
      V(side * 0.6, 3.25, -0.35),
    ];
    b.path([shoulder, V(side * 1.05, 4.44, -0.47), knuckle],
      0.16, 'stone', 28, 9, t => 1 - t * 0.42);
    b.ellipsoid(knuckle, V(0.16, 0.16, 0.13), 'gold', 16);
    const fingers = [];
    for (let i = 0; i < tips.length; i += 1) {
      const middle = knuckle.clone().lerp(tips[i], 0.48).add(V(side * (0.1 + i * 0.015), 0.13, -0.16));
      const curve = new THREE.CatmullRomCurve3([knuckle, middle, tips[i]]);
      fingers.push(curve);
      b.path([knuckle, middle, tips[i]], 0.075 - i * 0.005, i % 2 ? 'gold' : 'stone',
        26, 7, t => 1 - t * 0.87);
      // Horny ridges wrap every wing finger.
      for (let ridge = 2; ridge < 23; ridge += 1) {
        const t = ridge / 25;
        const p = curve.getPoint(t);
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), curve.getTangent(t).normalize());
        const g = new THREE.TorusGeometry((0.077 - i * 0.005) * (1 - t * 0.87), 0.009, 3, 7);
        b.add(g, 'shadow', new THREE.Matrix4().compose(p, q, V(1, 1, 1))); g.dispose();
      }
    }
    for (let panel = 0; panel < fingers.length - 1; panel += 1) {
      const a = fingers[panel];
      const c = fingers[panel + 1];
      const membrane = surface(28, 20, (t, s) => {
        // Scalloped trailing edges, webbing tension and vascular rib relief.
        const shortened = t * (1 - Math.sin(Math.PI * s) * Math.pow(t, 3) * 0.28);
        const p = a.getPoint(shortened).lerp(c.getPoint(shortened), s);
        p.z -= Math.sin(Math.PI * s) * Math.sin(Math.PI * t) * 0.23;
        p.z += Math.sin(s * Math.PI * 18 + t * 3) * 0.008 * Math.sin(Math.PI * t);
        return p.toArray();
      });
      b.add(membrane, 'membrane'); membrane.dispose();
      // Fine branching veins lie above the curved membrane.
      for (let rib = 1; rib < 18; rib += 1) {
        const s = rib / 18;
        const points = Array.from({ length: 8 }, (_, i) => {
          const t = 0.1 + i / 7 * 0.87;
          const q = t * (1 - Math.sin(Math.PI * s) * Math.pow(t, 3) * 0.28);
          const p = a.getPoint(q).lerp(c.getPoint(q), s);
          p.z -= Math.sin(Math.PI * s) * Math.sin(Math.PI * t) * 0.23 - 0.009;
          return p;
        });
        b.path(points, rib % 4 ? 0.006 : 0.012, rib % 4 ? 'shadow' : 'gold',
          14, 3, t => 1 - t * 0.5);
        for (let branch = 0; branch < 3; branch += 1) {
          const start = points[2 + branch];
          b.path([start, start.clone().add(V(side * 0.06, -0.06, 0.005)),
            start.clone().add(V(side * 0.14, -0.14, 0.005))], 0.004, 'shadow', 4, 3);
        }
      }
      const edge = Array.from({ length: 21 }, (_, i) => {
        const s = i / 20;
        const t = 1 - Math.sin(Math.PI * s) * 0.28;
        return a.getPoint(t).lerp(c.getPoint(t), s);
      });
      b.path(edge, 0.026, 'stone', 30, 5);
    }
    // Hook at each wrist.
    b.path([knuckle, knuckle.clone().add(V(side * 0.13, 0.3, -0.01)),
      knuckle.clone().add(V(side * 0.29, 0.37, 0.03)),
      knuckle.clone().add(V(side * 0.35, 0.22, 0.1))],
    0.1, 'gold', 22, 8, t => Math.pow(1 - t, 0.8) + 0.01);
  }
}

function addDemonOrnament(b) {
  addDesignedHorns(b);
  b.part = 'head';
  // Crown of nine swept spikes and its glowing central stone.
  for (let i = 0; i < 9; i += 1) {
    const a = i / 8 * Math.PI;
    const p = V(Math.cos(a) * 0.31, 5.08, Math.sin(a) * 0.28 + 0.08);
    b.path([p, p.clone().add(V(p.x * 0.25, 0.2 + Math.sin(a) * 0.09, 0.01)),
      p.clone().add(V(p.x * 0.5, 0.28 + Math.sin(a) * 0.16, -0.08))],
    0.04, 'gold', 14, 6, t => 1 - t * 0.98);
  }
  b.ellipsoid(V(0, 5.16, 0.37), V(0.065, 0.11, 0.026), 'light', 12);

  // Hundreds of individually domed overlapping armor scales.
  b.part = 'robe';
  const scaleShape = surface(4, 5, (t, s) => {
    const w = Math.pow(Math.sin(Math.PI * t), 0.45);
    return [(s - 0.5) * w, t, Math.sin(s * Math.PI) * Math.sin(t * Math.PI) * 0.17];
  });
  for (let row = 0; row < 21; row += 1) {
    const y = 1.04 + row * 0.14;
    b.part = y < 3.12 ? 'robe' : 'body';
    const radial = 0.43 + Math.pow(Math.max(0, 3.1 - y) / 3.1, 1.8) * 0.44;
    const count = row < 14 ? 26 : 22;
    for (let i = 0; i < count; i += 1) {
      const a = (i + (row % 2) * 0.5) / count * TAU;
      const p = V(Math.cos(a) * radial, y, Math.sin(a) * radial * 0.7 + 0.04);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2 - a, Math.PI));
      b.add(scaleShape, (i + row) % 7 ? 'stone' : 'gold',
        new THREE.Matrix4().compose(p, q, V(0.17, 0.22, 0.17)));
      if ((i + row) % 3 === 0) {
        b.ellipsoid(p.clone().add(V(Math.cos(a) * 0.02, -0.035, Math.sin(a) * 0.02)),
          V(0.015, 0.017, 0.014), 'gold', 6);
      }
    }
  }
  scaleShape.dispose();
  // Branching ember fissures follow the breastplate surface.
  b.part = 'body';
  for (let side of [-1, 1]) {
    for (let i = 0; i < 12; i += 1) {
      const y = 3.22 + i * 0.065;
      const x = side * (0.1 + (i % 4) * 0.065);
      b.path([V(x, y, 0.366), V(x + side * 0.045, y + 0.025, 0.38),
        V(x + side * 0.07, y + 0.09, 0.365), V(x + side * 0.13, y + 0.125, 0.35)],
      0.007, 'light', 9, 3);
    }
  }
  // A long three-dimensional tail wraps away from the ankles, with a blade.
  b.part = 'tail';
  const tail = [V(0, 2.8, -0.25), V(0.45, 1.72, -0.65), V(1.12, 0.65, -0.85),
    V(1.85, 0.48, -0.24), V(2.05, 1.01, 0.18), V(1.82, 1.45, 0.2)];
  b.path(tail, 0.11, 'stone', 60, 10, t => 1 - t * 0.68);
  const tailCurve = new THREE.CatmullRomCurve3(tail);
  for (let i = 1; i < 55; i += 1) {
    const t = i / 56;
    const p = tailCurve.getPoint(t);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), tailCurve.getTangent(t));
    const g = new THREE.TorusGeometry(0.114 * (1 - t * 0.68), 0.009, 3, 7);
    b.add(g, 'gold', new THREE.Matrix4().compose(p, q, V(1, 1, 1))); g.dispose();
  }
  b.path([tail.at(-1), V(1.72, 1.69, 0.22), V(1.86, 1.88, 0.21)],
    0.14, 'gold', 16, 6, t => Math.pow(1 - t, 0.65) + 0.01);
}

function addRegalia(b, low = false) {
  const d = b.design;
  const angel = b.kind === 'angel';
  const a = d.archetypeIndex;
  b.part = angel ? 'rightWeapon' : 'leftWeapon';
  const position = V(angel ? 1.19 : -1.19, 2.98, 0.48);
  const resolution = low ? 7 : 16;
  const fine = low ? 4 : 8;
  const length = 0.88 + d.variant * 0.022;
  const addBox = (p, scale, material = 'gold', rotation = new THREE.Euler()) => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    b.add(g, material, new THREE.Matrix4().compose(p,
      new THREE.Quaternion().setFromEuler(rotation), scale)); g.dispose();
  };
  const staff = (height = 2.15) => {
    b.path([position.clone().add(V(0, -1.55 * length, 0)),
      position.clone().add(V(0, height * length, 0))], 0.045, 'gold', 3, fine);
    if (!low) {
      for (let i = 0; i < 22; i += 1) {
        const y = position.y - 1.4 * length + i * 0.15 * length;
        b.ring(V(position.x, y, position.z), 0.052, 0.008,
          i % 3 ? 'stone' : 'light', new THREE.Euler(Math.PI / 2, 0, 0), TAU, 9);
      }
    }
    return position.clone().add(V(0, height * length, 0));
  };
  const sword = () => {
    const top = position.clone().add(V(0, 0.43, 0));
    const bottom = position.clone().add(V(0, -1.75 * length, 0));
    const w = 0.12 + d.rnd(26) * 0.07;
    const v = [
      top.x - w, top.y, top.z, top.x, top.y, top.z + 0.055, top.x + w, top.y, top.z,
      bottom.x, bottom.y, bottom.z, top.x, top.y, top.z - 0.055,
    ];
    const g = indexedGeometry(v, [0, 1, 3, 1, 2, 3, 2, 4, 3, 4, 0, 3, 0, 4, 1, 1, 4, 2]);
    b.add(g, 'pale'); g.dispose();
    b.path([top.clone().add(V(-0.35, 0.01, 0)), top.clone().add(V(0, 0.06, 0)),
      top.clone().add(V(0.35, 0.01, 0))], 0.043, 'gold', fine, fine);
    b.path([top, top.clone().add(V(0, 0.4, 0))], 0.049, 'shadow', 3, fine);
    b.ellipsoid(top.clone().add(V(0, 0.45, 0)), V(0.085, 0.085, 0.065), 'light', resolution);
    if (!low) {
      for (let i = 0; i < 16; i += 1) {
        const p = top.clone().lerp(bottom, 0.08 + i * 0.05).add(V(0, 0, 0.058));
        b.path([p.clone().add(V(-0.025, 0.02, 0)), p, p.clone().add(V(0.025, 0.02, 0))],
          0.006, 'gold', 2, 3);
      }
    }
  };
  const shield = () => {
    const c = position.clone().add(V(0, 0.15, 0.04));
    const r = 0.55 + d.rnd(25) * 0.13;
    b.ellipsoid(c, V(r, r * (a === 4 ? 1.35 : 1), 0.09), 'stone', low ? 10 : 24);
    b.ring(c.clone().add(V(0, 0, 0.08)), r * 0.9, 0.033, 'gold', new THREE.Euler(), TAU, low ? 15 : 54);
    b.ellipsoid(c.clone().add(V(0, 0, 0.12)), V(0.13, 0.13, 0.11), 'gold', resolution);
    const rays = 8 + d.variant;
    for (let i = 0; i < rays; i += 1) {
      const angle = i / rays * TAU;
      b.path([c.clone().add(V(Math.cos(angle) * 0.15, Math.sin(angle) * 0.15, 0.12)),
        c.clone().add(V(Math.cos(angle) * r * 0.82, Math.sin(angle) * r * 0.82, 0.1))],
      0.012, 'gold', 2, 4);
    }
  };
  const chalice = () => {
    const c = position.clone().add(V(0, 0.18, 0.02));
    b.path([c.clone().add(V(0, -0.3, 0)), c], 0.05, 'gold', 3, fine);
    b.ellipsoid(c.clone().add(V(0, -0.3, 0)), V(0.19, 0.035, 0.16), 'gold', resolution);
    const bowl = surface(low ? 4 : 14, low ? 10 : 30, (t, s) => {
      const r = 0.05 + t * 0.24;
      const angle = s * TAU;
      return [c.x + Math.cos(angle) * r, c.y + t * 0.33,
        c.z + Math.sin(angle) * r];
    });
    b.add(bowl, 'gold'); bowl.dispose();
    b.ring(c.clone().add(V(0, 0.33, 0)), 0.29, 0.025, 'pale',
      new THREE.Euler(Math.PI / 2, 0, 0), TAU, low ? 12 : 40);
    b.ellipsoid(c.clone().add(V(0, 0.37, 0)), V(0.12, 0.2, 0.12), 'light', resolution);
  };
  if ((angel && (a === 0 || a === 6)) || (!angel && a === 0)) {
    sword();
  } else if ((angel && a === 9) || (!angel && a === 4)) {
    shield();
  } else if ((angel && a === 7) || (!angel && a === 6)) {
    chalice();
  } else if (angel && a === 5) {
    // Two hinged covers, thick page blocks, raised text strokes and a clasp.
    const c = position.clone().add(V(-0.12, 0.08, 0.14));
    for (const s of [-1, 1]) {
      addBox(c.clone().add(V(s * 0.22, 0, 0)), V(0.43, 0.53, 0.06), 'gold', new THREE.Euler(0, -s * 0.24, 0));
      addBox(c.clone().add(V(s * 0.22, 0, 0.045)), V(0.39, 0.48, 0.05), 'pale', new THREE.Euler(0, -s * 0.24, 0));
      if (!low) for (let line = 0; line < 12; line += 1) {
        const y = c.y - 0.2 + line * 0.035;
        b.path([V(c.x + s * 0.07, y, c.z + 0.12), V(c.x + s * 0.36, y, c.z + 0.055)],
          0.006, 'gold', 2, 3);
      }
    }
  } else if (angel && a === 4) {
    const c = position.clone().add(V(0, -0.25, 0.08));
    b.ellipsoid(c, V(0.095, 0.2, 0.095), 'light', resolution);
    for (let i = 0; i < 6; i += 1) {
      const angle = i / 6 * TAU;
      b.path([c.clone().add(V(Math.cos(angle) * 0.18, -0.25, Math.sin(angle) * 0.18)),
        c.clone().add(V(Math.cos(angle) * 0.22, 0.05, Math.sin(angle) * 0.22)),
        c.clone().add(V(0, 0.34, 0))], 0.025, 'gold', fine, 4);
    }
    b.ring(c.clone().add(V(0, -0.25, 0)), 0.18, 0.023, 'gold',
      new THREE.Euler(Math.PI / 2, 0, 0), TAU, resolution);
  } else if (!angel && a === 5) {
    const end = position.clone().add(V(-0.25, -1.1 * length, 0.08));
    const links = low ? 8 : 26;
    for (let i = 0; i < links; i += 1) {
      const t = i / (links - 1);
      const p = position.clone().lerp(end, t).add(V(Math.sin(t * Math.PI) * 0.16, 0, 0));
      b.ring(p, 0.04, 0.013, 'gold', new THREE.Euler(0, i % 2 ? Math.PI / 2 : 0, 0), TAU, low ? 5 : 10);
    }
    b.ellipsoid(end, V(0.24, 0.24, 0.24), 'stone', resolution);
    for (let i = 0; i < 12; i += 1) {
      const angle = i / 12 * TAU;
      const direction = V(Math.cos(angle), Math.sin(angle), (i % 3 - 1) * 0.6).normalize();
      b.path([end.clone().addScaledVector(direction, 0.19), end.clone().addScaledVector(direction, 0.39)],
        0.05, 'gold', 2, 4, t => 1 - t * 0.96);
    }
  } else if (!angel && a === 9) {
    const c = position.clone().add(V(0, 0.32, 0.1));
    b.ellipsoid(c, V(0.24, 0.24, 0.24), 'light', resolution);
    for (let i = 0; i < 3; i += 1) b.ring(c, 0.31 + i * 0.035, 0.018, 'gold',
      new THREE.Euler(i * 0.63, i * 0.8, 0), TAU, low ? 14 : 36);
  } else {
    const c = staff(angel && a === 3 ? 1.4 : 2.05);
    if ((!angel && (a === 2 || a === 7)) || (angel && a === 8)) {
      const points = Array.from({ length: 13 }, (_, i) => {
        const angle = i / 12 * Math.PI * 0.84;
        return c.clone().add(V(Math.cos(angle) * (a === 7 ? 1.0 : 0.43),
          Math.sin(angle) * 0.32, 0));
      });
      b.path(points, a === 7 ? 0.11 : 0.065, 'pale', low ? 12 : 30, fine,
        t => 1 - t * 0.95);
    } else if ((angel && a === 1) || (!angel && a === 8)) {
      b.path([c.clone().add(V(0, -0.1, 0)), c.clone().add(V(0, 0.44, 0))],
        0.13, 'pale', low ? 3 : 8, 4, t => 1 - t * 0.98);
    } else {
      b.ellipsoid(c, V(0.17, 0.22, 0.17), (!angel && a === 3) ? 'pale' : 'light', resolution);
      if (!angel && a === 3) {
        for (const side of [-1, 1]) {
          b.ellipsoid(c.clone().add(V(side * 0.066, 0.025, 0.153)),
            V(0.049, 0.055, 0.023), 'shadow', low ? 6 : 10);
        }
        b.ellipsoid(c.clone().add(V(0, -0.09, 0.14)),
          V(0.086, 0.036, 0.035), 'shadow', low ? 6 : 10);
        if (!low) for (let tooth = 0; tooth < 6; tooth += 1) {
          addBox(c.clone().add(V((tooth - 2.5) * 0.025, -0.09, 0.175)),
            V(0.018, 0.032, 0.018), 'pale');
        }
      }
      for (let i = 0; i < 5 + d.individual % 4; i += 1) {
        const angle = i / (5 + d.individual % 4) * TAU;
        b.path([c.clone().add(V(Math.cos(angle) * 0.2, -0.2, Math.sin(angle) * 0.2)),
          c.clone().add(V(Math.cos(angle) * 0.24, 0.15, Math.sin(angle) * 0.24)),
          c.clone().add(V(Math.cos(angle) * 0.16, 0.3, Math.sin(angle) * 0.16))],
        0.026, 'gold', low ? 4 : 12, 4);
      }
    }
  }

  // Distinct masks and open face plates are part of the archetype, including
  // the low-detail mesh, so selecting a character preserves its identity.
  b.part = 'head';
  if ((angel && (a === 2 || a === 4)) || (!angel && (a === 3 || a === 7))) {
    const mask = surface(low ? 4 : 16, low ? 6 : 24, (t, s) => {
      const x = (s - 0.5) * 0.55;
      const y = (a === 4 ? 4.58 : 4.82) + t * (a === 4 ? 0.43 : 0.18);
      return [x, y, 0.2 + Math.sqrt(Math.max(0, 0.13 - x * x)) * 0.5
        + Math.sin(s * Math.PI * (3 + d.individual % 4)) * 0.014];
    });
    b.add(mask, a === 4 ? 'pale' : 'gold'); mask.dispose();
    for (let i = 0; i < 5 + d.individual % 3; i += 1) {
      const x = (i / (4 + d.individual % 3) - 0.5) * 0.42;
      b.path([V(x, 4.84, 0.395), V(x, 4.98, 0.38)], 0.009, 'shadow', 2, 3);
    }
  }
  // A geometric crest has a different number and arrangement of petals.
  b.part = 'body';
  const crest = V(0, 3.56, 0.43);
  const petals = 5 + a;
  for (let i = 0; i < petals; i += low ? 3 : 1) {
    const angle = i / petals * TAU + d.ornamentPhase;
    b.ellipsoid(crest.clone().add(V(Math.cos(angle) * 0.11, Math.sin(angle) * 0.11, 0)),
      V(0.019, 0.065, 0.014), 'gold', low ? 6 : 9, angle - Math.PI / 2);
  }
}

function addDistantRegalia(b) {
  const d = b.design;
  const angel = b.kind === 'angel';
  const a = d.archetypeIndex;
  b.part = angel ? 'rightWeapon' : 'leftWeapon';
  const p = V(angel ? 1.19 : -1.19, 2.98, 0.48);
  const length = 0.88 + d.variant * 0.022;
  const jewel = (center, scale, material = 'light') => {
    const g = new THREE.IcosahedronGeometry(1, 0);
    b.add(g, material, new THREE.Matrix4().compose(center, new THREE.Quaternion(), scale));
    g.dispose();
  };
  if ((angel && (a === 0 || a === 6)) || (!angel && a === 0)) {
    const x = p.x;
    const z = p.z;
    const y = p.y + 0.43;
    const width = 0.12 + d.rnd(26) * 0.07;
    const blade = indexedGeometry([
      x - width, y, z, x + width, y, z, x, y, z + 0.055, x, y, z - 0.055,
      x, p.y - 1.75 * length, z,
    ], [0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 0, 3, 2, 2, 3, 1]);
    b.add(blade, 'pale'); blade.dispose();
    b.path([V(x - 0.35, y, z), V(x + 0.35, y, z)], 0.046, 'gold', 1, 3);
    b.path([V(x, y, z), V(x, y + 0.4, z)], 0.05, 'shadow', 1, 3);
  } else if ((angel && a === 9) || (!angel && a === 4)) {
    const c = p.clone().add(V(0, 0.15, 0.04));
    const g = surface(2, 8, (t, s) => {
      const a0 = s * TAU;
      const radius = Math.sin(t * Math.PI) * (0.55 + d.rnd(25) * 0.13);
      return [c.x + Math.cos(a0) * radius, c.y + Math.sin(a0) * radius * (a === 4 ? 1.35 : 1),
        c.z + Math.cos(t * Math.PI) * 0.1];
    });
    b.add(g, 'gold'); g.dispose();
  } else if ((angel && a === 7) || (!angel && a === 6)) {
    b.path([p.clone().add(V(0, -0.12, 0)), p.clone().add(V(0, 0.18, 0))],
      0.055, 'gold', 1, 3);
    const g = surface(2, 6, (t, s) => {
      const angle = s * TAU;
      const r = 0.05 + t * 0.24;
      return [p.x + Math.cos(angle) * r, p.y + 0.18 + t * 0.33, p.z + Math.sin(angle) * r];
    });
    b.add(g, 'gold'); g.dispose();
    jewel(p.clone().add(V(0, 0.55, 0)), V(0.12, 0.2, 0.12));
  } else if (angel && a === 5) {
    for (const side of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.43, 0.53, 0.08);
      b.add(g, 'pale', new THREE.Matrix4().compose(
        p.clone().add(V(-0.12 + side * 0.22, 0.08, 0.14)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -side * 0.24, 0)), V(1, 1, 1)));
      g.dispose();
    }
  } else if (angel && a === 4) {
    const c = p.clone().add(V(0, -0.25, 0.08));
    jewel(c, V(0.095, 0.2, 0.095));
    for (let i = 0; i < 4; i += 1) {
      const angle = i / 4 * TAU;
      b.path([c.clone().add(V(Math.cos(angle) * 0.18, -0.25, Math.sin(angle) * 0.18)),
        c.clone().add(V(Math.cos(angle) * 0.22, 0.05, Math.sin(angle) * 0.22)),
        c.clone().add(V(0, 0.34, 0))], 0.026, 'gold', 2, 3);
    }
  } else if (!angel && a === 5) {
    const end = p.clone().add(V(-0.25, -1.1 * length, 0.08));
    b.path([p, p.clone().lerp(end, 0.5).add(V(0.16, 0, 0)), end], 0.025, 'gold', 3, 3);
    jewel(end, V(0.27, 0.27, 0.27), 'stone');
  } else if (!angel && a === 9) {
    jewel(p.clone().add(V(0, 0.32, 0.1)), V(0.26, 0.26, 0.26));
  } else {
    const height = angel && a === 3 ? 1.4 : 2.05;
    const c = p.clone().add(V(0, height * length, 0));
    b.path([p.clone().add(V(0, -1.55 * length, 0)), c], 0.046, 'gold', 1, 3);
    if ((!angel && (a === 2 || a === 7)) || (angel && a === 8)) {
      const points = Array.from({ length: 5 }, (_, i) => {
        const angle = i / 4 * Math.PI * 0.84;
        return c.clone().add(V(Math.cos(angle) * (a === 7 ? 1 : 0.43), Math.sin(angle) * 0.32, 0));
      });
      b.path(points, a === 7 ? 0.11 : 0.065, 'pale', 4, 3, t => 1 - t * 0.95);
    } else if ((angel && a === 1) || (!angel && a === 8)) {
      b.path([c, c.clone().add(V(0, 0.44, 0))], 0.13, 'pale', 1, 4, t => 1 - t * 0.98);
    } else {
      jewel(c, V(0.18, 0.24, 0.18), !angel && a === 3 ? 'pale' : 'light');
    }
  }
}

function addLegs(b, detail = 'hero') {
  const low = detail !== 'hero';
  for (const side of [-1, 1]) {
    const prefix = side < 0 ? 'left' : 'right';
    const hip = V(side * 0.23, 2.82, 0.03);
    const knee = V(side * 0.25, 1.55, 0.06);
    const ankle = V(side * 0.26, 0.3, 0.02);
    b.part = `${prefix}Thigh`;
    b.path([hip, hip.clone().lerp(knee, 0.5).add(V(0, 0, -0.025)), knee],
      0.19, 'stone', low ? 2 : 22, low ? 3 : 9, t => 1 - t * 0.15);
    b.part = `${prefix}Shin`;
    b.path([knee, knee.clone().lerp(ankle, 0.5).add(V(0, 0, -0.025)), ankle],
      0.15, 'pale', low ? 2 : 22, low ? 3 : 9, t => 1 - t * 0.35);
    if (!low) {
      b.ellipsoid(knee.clone().add(V(0, 0, 0.09)), V(0.17, 0.18, 0.1), 'gold', 12);
      for (let i = 0; i < 6; i += 1) {
        const t = 0.18 + i * 0.11;
        const p = knee.clone().lerp(ankle, t);
        b.ring(p, 0.16 * (1 - t * 0.35), 0.012, 'gold',
          new THREE.Euler(Math.PI / 2, 0, 0), TAU, 12);
      }
    }
    b.part = `${prefix}Foot`;
    if (low) {
      const g = new THREE.IcosahedronGeometry(1, 0);
      b.add(g, 'gold', new THREE.Matrix4().compose(V(side * 0.26, 0.23, 0.35),
        new THREE.Quaternion(), V(0.15, 0.13, 0.42)));
      g.dispose();
    } else {
      b.ellipsoid(V(side * 0.26, 0.23, 0.35), V(0.15, 0.13, 0.42), 'gold', 18);
      for (let i = 0; i < 4; i += 1) {
        b.path([V(side * 0.26 - 0.11, 0.3, 0.34 + i * 0.095),
          V(side * 0.26, 0.35, 0.34 + i * 0.095),
          V(side * 0.26 + 0.11, 0.3, 0.34 + i * 0.095)],
        0.009, 'shadow', 6, 4);
      }
    }
  }
}

/** Far-field silhouettes: individual design, approximately 450–700 triangles. */
function buildDistantTemplate(kind, seed = 1) {
  const angel = kind === 'angel';
  const b = new Sculptor(kind, 'distant', seed);
  const d = b.design;
  addLegs(b, 'distant');
  b.part = 'robe';
  const robe = surface(5, 8, (t, s) => {
    const angle = s * TAU;
    const radius = 0.35 + Math.pow(1 - t, 1.65) * (angel ? 0.69 : 0.48);
    return [Math.cos(angle + (1 - t) * 0.1) * radius, 0.18 + t * 3.18,
      Math.sin(angle + (1 - t) * 0.1) * radius * 0.67 + 0.05];
  });
  b.add(robe, angel ? 'stone' : 'shadow'); robe.dispose();
  const torso = surface(3, 6, (t, s) => {
    const angle = s * TAU;
    const radius = 0.35 + Math.sin(t * Math.PI * 0.65) * (angel ? 0.34 : 0.43);
    return [Math.cos(angle) * radius, 2.75 + t * 1.51,
      Math.sin(angle) * (0.26 + Math.sin(t * Math.PI) * 0.05) + 0.02];
  });
  b.part = 'body';
  b.add(torso, 'stone'); torso.dispose();
  const head = new THREE.IcosahedronGeometry(1, 0);
  b.part = 'head';
  b.add(head, 'pale', new THREE.Matrix4().compose(V(0, 4.84, 0.075),
    new THREE.Quaternion(), V(0.32, 0.44, 0.29))); head.dispose();
  b.part = 'neck';
  b.path([V(0, 4.13, 0), V(0, 4.52, 0.04)], 0.16, 'pale', 1, 3);
  for (const side of [-1, 1]) {
    const prefix = side < 0 ? 'left' : 'right';
    b.part = `${prefix}UpperArm`;
    b.path([V(side * 0.65, 4.08, 0.035), V(side * 1.02, 3.55, 0.09)],
      0.2, 'stone', 2, 3, t => 1 - t * 0.22);
    b.part = `${prefix}Forearm`;
    b.path([V(side * 1.02, 3.55, 0.09), V(side * 1.1, 2.96, 0.4)],
      0.156, 'stone', 2, 3, t => 1 - t * 0.42);
    b.part = `${prefix}Wing`;
    if (angel) {
      const feather = featherSurface(3, 1);
      for (let i = 0; i < 9; i += 1) {
        const t = i / 8;
        const root = V(side * (0.55 + t * 2.54), 3.99 + 1.94 * Math.pow(t, 1.16), -0.4);
        const tip = V(side * (0.66 + Math.pow(t, 0.92) * 3.46), 1.42 + 5.17 * Math.pow(t, 1.07), -0.2);
        const delta = tip.clone().sub(root);
        b.add(feather, 'pale', new THREE.Matrix4().compose(root,
          new THREE.Quaternion().setFromUnitVectors(Y, delta.clone().normalize()),
          V(0.68, delta.length(), 0.5)));
      }
      feather.dispose();
      b.path([V(side * 0.48, 4.0, -0.21), V(side * 1.8, 5.12, -0.43),
        V(side * 3.22, 6.08, -0.6)], 0.11, 'gold', 3, 3, t => 1 - t * 0.8);
    } else {
      const knuckle = V(side * 2.03, 5.56, -0.48);
      const tips = [V(side * 2.6, 6.25, -0.54), V(side * 3.92, 5.4, -0.43),
        V(side * 3.62, 3.88, -0.45), V(side * 2.77, 2.3, -0.55),
        V(side * 1.4, 1.72, -0.48), V(side * 0.6, 3.25, -0.35)];
      for (let i = 0; i < tips.length - 1; i += 1) {
        const g = surface(1, 3, (t, s) => knuckle.clone().lerp(
          tips[i].clone().lerp(tips[i + 1], s), t * (1 - Math.sin(s * Math.PI) * 0.28),
        ).toArray());
        b.add(g, 'membrane'); g.dispose();
      }
      for (const i of [0, 2, 4]) {
        b.path([V(side * 0.43, 4.0, -0.28), knuckle, tips[i]], 0.085, 'gold', 3, 3, t => 1 - t * 0.85);
      }
    }
  }
  if (angel) {
    b.part = 'halo';
    const arc = d.archetypeIndex === 8 ? TAU * 0.67 : d.archetypeIndex === 6 ? TAU * 0.83 : TAU;
    const radius = (d.archetypeIndex === 9 ? 1.12 : 0.88) * (0.9 + d.variant * 0.017);
    const points = Array.from({ length: 15 }, (_, i) => {
      const angle = i / 14 * arc + d.haloTilt;
      const petal = d.archetypeIndex === 7 ? Math.cos(angle * 8) * 0.075 : 0;
      return V(Math.cos(angle) * (radius + petal),
        5.04 + Math.sin(angle) * (radius + petal) * (d.archetypeIndex === 5 ? 1.17 : 1),
        -0.16 + Math.sin(angle) * d.haloTilt);
    });
    b.path(points, 0.028, 'gold', 14, 3);
  } else {
    b.part = 'head';
    for (const { points, radius } of hornDesign(d)) {
      b.path(points, radius, 'stone', 3, 3, t => Math.pow(1 - t, 0.8) + 0.015);
    }
  }
  if ((angel && (d.archetypeIndex === 2 || d.archetypeIndex === 4))
    || (!angel && (d.archetypeIndex === 3 || d.archetypeIndex === 7))) {
    b.part = 'head';
    const mask = surface(1, 3, (t, s) => {
      const x = (s - 0.5) * 0.55;
      return [x, 4.8 + t * 0.21, 0.25 + Math.sqrt(Math.max(0, 0.13 - x * x)) * 0.5];
    });
    b.add(mask, 'gold'); mask.dispose();
  }
  addDistantRegalia(b);
  return b.finish();
}

function buildPopulationTemplate(kind, seed = 1) {
  const angel = kind === 'angel';
  const b = new Sculptor(kind, 'population', seed);
  addLegs(b, 'population');
  const robe = robeGeometry(angel, true);
  const torso = torsoGeometry(angel, true);
  b.part = 'robe';
  b.add(robe);
  b.part = 'body';
  b.add(torso); robe.dispose(); torso.dispose();
  b.part = 'head';
  b.ellipsoid(V(0, 4.8, 0), V(0.33, 0.43, 0.29), 'pale', 8);
  b.part = 'neck';
  b.path([V(0, 4.1, 0), V(0, 4.5, 0)], 0.16, 'pale', 2, 5);
  for (const side of [-1, 1]) {
    const prefix = side < 0 ? 'left' : 'right';
    b.part = `${prefix}UpperArm`;
    b.path([V(side * 0.65, 4.05, 0), V(side * 0.98, 3.5, 0)],
      0.18, 'stone', 3, 5, t => 1 - t * 0.15);
    b.part = `${prefix}Forearm`;
    b.path([V(side * 0.98, 3.5, 0), V(side * 1.06, 2.9, 0.3)],
      0.15, 'stone', 3, 5, t => 1 - t * 0.45);
    b.part = `${prefix}Wing`;
    if (angel) {
      const feather = featherSurface(5, 2);
      for (let i = 0; i < 12; i += 1) {
        const t = i / 11;
        const root = V(side * (0.55 + t * 2.54), 3.99 + t * 1.94, -0.4);
        const tip = V(side * (0.66 + t * 3.46), 1.42 + t * 5.17, -0.2);
        const dir = tip.clone().sub(root);
        b.add(feather, 'pale', new THREE.Matrix4().compose(root,
          new THREE.Quaternion().setFromUnitVectors(Y, dir.clone().normalize()), V(0.48, dir.length(), 0.5)));
      }
      feather.dispose();
    } else {
      const knuckle = V(side * 2.03, 5.56, -0.4);
      const tips = [V(side * 2.6, 6.25, -0.5), V(side * 3.9, 5.4, -0.4),
        V(side * 3.6, 3.8, -0.4), V(side * 2.7, 2.3, -0.5), V(side * 0.6, 3.2, -0.3)];
      for (let i = 0; i < tips.length - 1; i += 1) {
        const g = surface(3, 4, (t, s) => {
          const end = tips[i].clone().lerp(tips[i + 1], s);
          const p = knuckle.clone().lerp(end, t * (1 - Math.sin(s * Math.PI) * t * 0.2));
          return p.toArray();
        });
        b.add(g, 'membrane'); g.dispose();
        b.path([V(side * 0.5, 4.0, -0.2), knuckle, tips[i]], 0.08, 'gold', 4, 4,
          t => 1 - t * 0.7);
      }
    }
  }
  if (angel) addHalo(b, true);
  else addDesignedHorns(b, true);
  addRegalia(b, true);
  return b.finish();
}

function buildHero(kind, seed = 1) {
  const angel = kind === 'angel';
  const b = new Sculptor(kind, 'hero', seed);
  addLegs(b);
  addBody(b, angel);
  addArms(b, angel);
  buildFace(b, angel);
  if (angel) {
    addAngelWings(b);
    addHalo(b);
  } else {
    addDemonWings(b);
    addDemonOrnament(b);
  }
  addRegalia(b);
  return b.finish();
}

/**
 * Returns a shared-geometry, independently transformable sculpture.
 * Geometry is already baked into each child; all child transforms are identity.
 * userData.detailCount counts authored geometric pieces, not pixels or vertices.
 */
export function createSculpture(kind = 'angel', seed = 1, detail = 'hero') {
  const normalizedKind = kind === 'demon' ? 'demon' : 'angel';
  const normalizedDetail = detail === 'distant' ? 'distant' : detail === 'population' ? 'population' : 'hero';
  const design = getCharacterDesign(normalizedKind, seed);
  const key = `${normalizedKind}-${normalizedDetail}-${design.seed}`;
  // Seed 1 is displayed permanently. Other full-resolution inspection meshes
  // are owned by the caller, which can dispose their geometries after use.
  const shouldCache = normalizedDetail !== 'hero' || design.seed === 1;
  let template = cache.get(key);
  if (!template) {
    template = normalizedDetail === 'hero'
      ? buildHero(normalizedKind, design.seed)
      : normalizedDetail === 'distant'
        ? buildDistantTemplate(normalizedKind, design.seed)
        : buildPopulationTemplate(normalizedKind, design.seed);
    if (shouldCache) cache.set(key, template);
  }
  const group = template.clone();
  group.userData = { ...template.userData, seed: design.seed, ownedGeometry: !shouldCache };
  return group;
}

/**
 * Efficient optional population factory; one draw per material for every figure.
 * The engine may instead instance the static children of a population sculpture.
 */
export function createPopulation(kind, count, {
  radius = 8,
  center = new THREE.Vector3(),
  seed = 1,
  scale = 0.24,
  arc = TAU,
  detail = 'distant',
} = {}) {
  const group = new THREE.Group();
  const actualCount = Math.min(500, Math.max(0, Math.floor(count)));
  const buckets = new Map();
  const transforms = [];
  let detailCount = 0;
  let triangleCount = 0;
  for (let i = 0; i < actualCount; i += 1) {
    const n = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
    const random = n - Math.floor(n);
    const a = i / Math.max(1, actualCount) * arc - arc / 2;
    const r = radius * (0.72 + random * 0.35);
    const p = V(Math.sin(a) * r, Math.sin(i * 2.37) * 0.08,
      Math.cos(a) * r).add(center);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a + Math.PI, 0));
    const s = scale * (0.88 + random * 0.24);
    transforms.push(new THREE.Matrix4().compose(p, q, V(s, s, s)));
    const template = createSculpture(kind, seed + i, detail);
    detailCount += template.userData.detailCount;
    triangleCount += template.userData.triangleCount;
    for (const part of template.children) {
      const key = part.userData.materialKey;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ part, entity: i });
    }
  }
  for (const [key, parts] of buckets) {
    const vertices = parts.reduce((sum, { part }) => sum + part.geometry.attributes.position.count, 0);
    const indices = parts.reduce((sum, { part }) => sum + part.geometry.index.count, 0);
    const batch = new THREE.BatchedMesh(parts.length, vertices, indices, parts[0].part.material);
    batch.userData.entitiesByBatchId = {};
    for (const { part, entity } of parts) {
      const geometryId = batch.addGeometry(part.geometry);
      const instanceId = batch.addInstance(geometryId);
      batch.setMatrixAt(instanceId, transforms[entity]);
      batch.userData.entitiesByBatchId[instanceId] = entity;
    }
    batch.name = `${kind}-unique-population-${key}`;
    group.add(batch);
  }
  group.userData = {
    kind,
    count: actualCount,
    uniqueCharacters: actualCount,
    detailCount,
    triangleCount,
    batched: true,
  };
  return group;
}
