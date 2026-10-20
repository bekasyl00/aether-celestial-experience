import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSculpture, getCharacterDesign } from './sculptures.js';
import { createCombat } from './combat.js';
import { createArticulatedSculpture, getRigJointPositions } from './rig.js';

const TAU = Math.PI * 2;
const PER_REALM = 500;
const ENTITY_COUNT = PER_REALM * 2;
const ANGEL_NAMES = ['Seraphiel', 'Oriphiel', 'Cassiel', 'Aurelion', 'Luminara', 'Elyon', 'Iophiel', 'Celestine', 'Solarius', 'Asterion'];
const DEMON_NAMES = ['Azrael', 'Vesper', 'Mordrath', 'Nyx', 'Obsidian', 'Malachor', 'Erebus', 'Vulcan', 'Noctis', 'Ravenn'];
const PORTAL_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const PORTAL_FRAGMENT = `
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uCore;
  uniform float uDirection;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x),
               mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = .5;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p = mat2(1.6, 1.2, -1.2, 1.6) * p;
      amplitude *= .5;
    }
    return value;
  }
  void main() {
    vec2 p = (vUv - .5) * 2.;
    float r = length(p);
    float a = atan(p.y, p.x);
    float t = uTime * uDirection;
    float flow = fbm(vec2(a * 2.7 + t * .14, r * 9. - t * .28));
    float flame = fbm(p * 6. + vec2(t * .05, -t * .12));
    float edge = .76 + (flow - .5) * .045;
    float ring = exp(-abs(r - edge) * 100.);
    float corona = exp(-abs(r - edge) * 22.) * (.3 + flow);
    float threads = pow(max(0., sin(a * 73. + flow * 15. + t)), 13.);
    float rim = threads * exp(-abs(r - edge - .018) * 40.);
    float tendril = pow(max(0., sin(r * 43. + flow * 9. - t * .6)), 12.);
    float interior = (1. - smoothstep(.20, .76, r)) * (.13 + flame * .34);
    float filaments = tendril * (1. - smoothstep(.32, .77, r)) * .10;
    float aperture = 1. - smoothstep(.69, .79, r);
    vec3 color = uCore * interior + uColor * (ring * 3.5 + corona * .65 + rim * 1.6 + filaments);
    float opacity = max(aperture * .9, min(1., ring + corona * .6 + rim));
    opacity *= 1. - smoothstep(.90, 1., r);
    gl_FragColor = vec4(color, opacity);
  }
`;
const ARMY_JOINT_SHADER = `
  attribute float partTag;
  attribute float armyIndex;
  uniform sampler2D uArmyRig;
  uniform float uArmyTime;
  uniform float uArmyBlend;
  vec4 armyData(float slot) {
    return texture2D(uArmyRig, vec2((slot + .5) / 32., (armyIndex + .5) / 1000.));
  }
  mat3 armyRX(float a) {
    float c = cos(a), s = sin(a);
    return mat3(1.,0.,0., 0.,c,s, 0.,-s,c);
  }
  mat3 armyRY(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c,0.,-s, 0.,1.,0., s,0.,c);
  }
  mat3 armyRZ(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c,s,0., -s,c,0., 0.,0.,1.);
  }
  void armyJoint(inout vec3 p, inout vec3 n, vec3 pivot, mat3 turn, float weight) {
    p = mix(p, pivot + turn * (p - pivot), weight);
    n = normalize(mix(n, turn * n, weight));
  }
  void armyLeg(inout vec3 p, inout vec3 n, float side, float tag, float phase, float blend) {
    float hip = side < 0. ? 10. : 13.;
    float wave = sin(phase + (side < 0. ? 0. : 3.14159));
    vec3 knee = armyData(hip + 1.).xyz;
    float kneeWeight = tag < 2. ? 1. - smoothstep(knee.y - .3, knee.y + .3, p.y) : step(hip + .5, tag);
    armyJoint(p, n, knee, armyRX(max(0., -wave) * .85), kneeWeight * blend);
    armyJoint(p, n, armyData(hip).xyz, armyRX(wave * .44), blend);
  }
  void armyDeform(inout vec3 p, inout vec3 n) {
    if (uArmyBlend < .001) return;
    vec4 individual = armyData(31.);
    float phase = uArmyTime * individual.y + individual.x;
    float pulse = sin(phase);
    float blend = uArmyBlend;
    float tag = floor(partTag + .5);
    if (tag == 20.) tag = 6.;
    if (tag == 21.) tag = 9.;
    if (tag >= 4. && tag <= 9.) {
      float side = tag < 7. ? -1. : 1.;
      float shoulder = side < 0. ? 4. : 7.;
      float strike = sin(phase + (side < 0. ? 2.5 : 0.));
      if (tag > shoulder + .5) {
        armyJoint(p, n, armyData(shoulder + 1.).xyz,
          armyRX(-.42 - (strike * .5 + .5) * .94), blend);
      }
      armyJoint(p, n, armyData(shoulder).xyz,
        armyRZ(side * (.13 + strike * .2)) * armyRX(-.48 - strike * .82), blend);
    } else if (tag >= 10. && tag <= 15.) {
      armyLeg(p, n, tag < 13. ? -1. : 1., tag, phase, blend);
    } else if (tag == 1.) {
      vec3 leftP = p, leftN = n, rightP = p, rightN = n;
      float clothWeight = (1. - smoothstep(2.1, 2.9, p.y)) * blend;
      armyLeg(leftP, leftN, -1., tag, phase - .13, clothWeight);
      armyLeg(rightP, rightN, 1., tag, phase - .13, clothWeight);
      float sideBlend = smoothstep(-.18, .18, p.x);
      p = mix(leftP, rightP, sideBlend);
      n = normalize(mix(leftN, rightN, sideBlend));
    } else if (tag == 16. || tag == 17.) {
      float side = tag == 16. ? -1. : 1.;
      // Delayed, damped follow-through behind the torso's strike.
      float follow = sin(phase - .43) * .30 + sin(phase * 2. - .8) * .055;
      armyJoint(p, n, armyData(tag).xyz,
        armyRY(side * follow) * armyRZ(side * (.05 + sin(phase - .25) * .08)), blend);
    }
    bool upperBody = tag < 10. && tag != 1. || tag >= 16.;
    if (upperBody) {
      armyJoint(p, n, armyData(0.).xyz,
        armyRY(pulse * .19) * armyRX(sin(phase + .35) * .075), blend);
    }
    if (tag == 2. || tag == 3. || tag == 18.) {
      armyJoint(p, n, armyData(3.).xyz, armyRY(-pulse * .14), blend);
    }
  }
`;

/** A fully navigable sculpture universe: 1,000 unique entities and two portals. */
export function createRealm({
  canvas,
  onReady = () => {},
  onSelect = () => {},
  onStats = () => {},
  onWorldChange = () => {},
  onBattleRequest = () => {},
  onBattleUpdate = () => {},
  onBattleComplete = () => {},
  reducedMotion = false,
} = {}) {
  if (!canvas) throw new Error('The 3D stage requires a canvas.');

  const mobile = matchMedia('(max-width: 760px)').matches;
  let quality = mobile ? 'balanced' : 'high';
  let paused = reducedMotion;
  let disposed = false;
  let selectedId = 0;
  let realm = 'all';
  let elapsed = 0;
  let frameCount = 0;
  let fps = 60;
  let statsAt = performance.now();
  let lastTime = performance.now();
  let raf = 0;
  let cameraTransition = null;
  let promotedEntity = null;
  let ready = false;
  let pointerDown = null;
  let pointerMoved = false;
  let modelStyle = 'sculpted';
  let requestedModelStyle = 'sculpted';
  let modelLoading = false;
  let scannedPromise = null;
  let worldTransition = null;
  let flipTransition = null;
  let combat = null;
  let battleState = { status: 'idle' };
  let battleActors = [];
  const battleAudience = new Map();
  let battleClock = 0;
  let armyClock = 0;
  let armyBlend = 0;
  let armyMatrixTimer = 0;
  let armyCameraAllowed = false;
  let armyCameraWide = false;
  let slowFrameWindows = 0;
  let fastFrameWindows = 0;
  const ownedGeometries = new Set();
  const ownedMaterials = new Set();
  const ownedTextures = new Set();
  const ownedSkeletons = new Set();
  const geometry = (value) => { ownedGeometries.add(value); return value; };
  const material = (value) => { ownedMaterials.add(value); return value; };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#07090d');
  scene.fog = new THREE.FogExp2('#0b0d11', .018);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .96;
  renderer.info.autoReset = false;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1 : 1.5));
  const camera = new THREE.PerspectiveCamera(mobile ? 48 : 40, 1, .035, 180);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = .065;
  controls.rotateSpeed = .62;
  controls.zoomSpeed = .8;
  controls.panSpeed = .65;
  controls.minDistance = 1;
  controls.maxDistance = 75;
  controls.minPolarAngle = .07;
  controls.maxPolarAngle = Math.PI * .495;
  controls.autoRotate = false;
  controls.autoRotateSpeed = .24;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.target.set(0, 3.0, -1.5);
  canvas.style.touchAction = 'none';

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environmentTarget = pmrem.fromScene(room, .035);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = .48;
  room.dispose();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xe8edf7, 0x17141c, .95));
  const key = new THREE.DirectionalLight(0xffedd2, 2.65);
  key.position.set(-4, 12, 13);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb9d8f5, 1.05);
  fill.position.set(9, 4, 10);
  scene.add(fill);
  const leftRim = new THREE.PointLight(0xb8e9ef, 110, 25, 2);
  leftRim.position.set(-5, 5, -2);
  scene.add(leftRim);
  const rightRim = new THREE.PointLight(0xff391d, 165, 25, 2);
  rightRim.position.set(5, 5, -2);
  scene.add(rightRim);
  const demonKey = new THREE.SpotLight(0xffa26d, 95, 28, .8, .8, 1.5);
  demonKey.position.set(8, 9, 8);
  demonKey.target.position.set(4.5, 3, 0);
  scene.add(demonKey, demonKey.target);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), .35, .3, 2.1);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  bloom.enabled = quality === 'high';

  const graphite = material(new THREE.MeshStandardMaterial({
    color: 0x11141a, roughness: .78, metalness: .3,
  }));
  const darkStone = material(new THREE.MeshStandardMaterial({
    color: 0x181b21, roughness: .42, metalness: .72,
  }));
  const gold = material(new THREE.MeshStandardMaterial({
    color: 0xb69a66, roughness: .28, metalness: .85,
    emissive: 0x594322, emissiveIntensity: .16,
  }));
  const copper = material(new THREE.MeshStandardMaterial({
    color: 0x6d3529, roughness: .34, metalness: .85,
    emissive: 0x68180c, emissiveIntensity: .28,
  }));
  const lineGold = material(new THREE.MeshBasicMaterial({
    color: 0xc7ae78, transparent: true, opacity: .24,
  }));
  const floor = new THREE.Mesh(geometry(new THREE.CylinderGeometry(72, 72, .22, 128)), graphite);
  floor.position.y = -.15;
  scene.add(floor);

  function horizontalRing(radius, tube, mat, x = 0, z = 0, y = .005) {
    const object = new THREE.Mesh(geometry(new THREE.TorusGeometry(radius, tube, 5, 128)), mat);
    object.rotation.x = Math.PI / 2;
    object.position.set(x, y, z);
    scene.add(object);
    return object;
  }
  for (const radius of [8.6, 9.0, 12.8, 17.2, 21.7, 26.2, 31.5, 36.4, 41.2, 46, 51.2, 56.5]) {
    horizontalRing(radius, .009, lineGold, 0, -2);
  }
  const centerLine = new THREE.Mesh(geometry(new THREE.PlaneGeometry(.012, 68)), lineGold);
  centerLine.rotation.x = -Math.PI / 2;
  centerLine.position.set(0, .012, -7);
  scene.add(centerLine);

  function makeGlowTexture() {
    const surface = document.createElement('canvas');
    surface.width = surface.height = 128;
    const ctx = surface.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(.26, 'rgba(255,255,255,0.22)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(surface);
    ownedTextures.add(texture);
    return texture;
  }
  const glowTexture = makeGlowTexture();

  function pedestal(kind, x) {
    const accent = kind === 'angel' ? gold : copper;
    const group = new THREE.Group();
    group.position.x = x;
    const base = new THREE.Mesh(geometry(new THREE.CylinderGeometry(2.25, 2.43, .26, 80)), darkStone);
    base.position.y = .06;
    group.add(base);
    const cap = new THREE.Mesh(geometry(new THREE.CylinderGeometry(2.2, 2.25, .06, 80)), graphite);
    cap.position.y = .22;
    group.add(cap);
    const trim = new THREE.Mesh(geometry(new THREE.TorusGeometry(2.27, .018, 6, 100)), accent);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = .17;
    group.add(trim);
    const engraving = new THREE.Mesh(geometry(new THREE.RingGeometry(1.96, 1.973, 100)), accent);
    engraving.rotation.x = -Math.PI / 2;
    engraving.position.y = .253;
    group.add(engraving);
    scene.add(group);
    const glow = new THREE.Mesh(geometry(new THREE.PlaneGeometry(13, 13)), material(new THREE.MeshBasicMaterial({
      map: glowTexture,
      color: kind === 'angel' ? 0x95a8a0 : 0xac3525,
      transparent: true,
      opacity: .13,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(x, .009, -2);
    scene.add(glow);
  }
  pedestal('angel', -4.55);
  pedestal('demon', 4.55);

  const portals = [];
  const worldClickTargets = [];
  const portalGeometry = geometry(new THREE.PlaneGeometry(10, 10));
  const portalRuneGeometry = geometry(new THREE.OctahedronGeometry(.055, 0));
  const runeMatrix = new THREE.Matrix4();
  const runeTransform = new THREE.Object3D();
  function makePortal(kind, x) {
    const group = new THREE.Group();
    group.position.set(x, 4.14, -3.9);
    group.rotation.y = kind === 'angel' ? .09 : -.09;
    const isAngel = kind === 'angel';
    const portalMaterial = material(new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(isAngel ? '#b7e5e5' : '#ff4c21') },
        uCore: { value: new THREE.Color(isAngel ? '#425c67' : '#4c100a') },
        uDirection: { value: isAngel ? 1 : -1 },
      },
      vertexShader: PORTAL_VERTEX,
      fragmentShader: PORTAL_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    const aperture = new THREE.Mesh(portalGeometry, portalMaterial);
    aperture.renderOrder = 1;
    group.add(aperture);
    const hitRing = new THREE.Mesh(
      geometry(new THREE.RingGeometry(3.35, 4.45, 64)),
      material(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })),
    );
    hitRing.position.z = .08;
    hitRing.userData.portalKind = kind;
    group.add(hitRing);
    worldClickTargets.push(hitRing);
    const metal = isAngel ? gold : copper;
    for (const [radius, thickness] of [[3.92, .055], [4.02, .017], [4.21, .009]]) {
      const rim = new THREE.Mesh(geometry(new THREE.TorusGeometry(radius, thickness, 8, 160)), metal);
      rim.position.z = .045;
      group.add(rim);
    }
    const runes = new THREE.InstancedMesh(portalRuneGeometry, metal, 96);
    for (let index = 0; index < 96; index += 1) {
      const a = index / 96 * TAU;
      runeTransform.position.set(Math.cos(a) * 4.1, Math.sin(a) * 4.1, .04);
      runeTransform.rotation.set(0, 0, a);
      runeTransform.scale.set(index % 8 === 0 ? 1.8 : .7, index % 8 === 0 ? 3.6 : 1.4, .45);
      runeTransform.updateMatrix();
      runeMatrix.copy(runeTransform.matrix);
      runes.setMatrixAt(index, runeMatrix);
    }
    group.add(runes);
    scene.add(group);
    portals.push({ group, portalMaterial, runes, isAngel, kind });
    return group;
  }
  makePortal('angel', -5.3);
  makePortal('demon', 5.3);

  const entities = [];
  const selectable = [];
  const population = { angel: [], demon: [] };
  const batchedMeshes = [];
  const heroes = {};
  const promotions = {};
  const scannedHeroes = {};
  const transform = new THREE.Object3D();
  const armyRigData = new Float32Array(32 * ENTITY_COUNT * 4);
  const armyRigTexture = new THREE.DataTexture(armyRigData, 32, ENTITY_COUNT, THREE.RGBAFormat, THREE.FloatType);
  armyRigTexture.needsUpdate = true;
  ownedTextures.add(armyRigTexture);
  const armyUniforms = {
    uArmyRig: { value: armyRigTexture },
    uArmyTime: { value: 0 },
    uArmyBlend: { value: 0 },
  };
  const armyJointRegions = new Set();
  const armyPivotNames = [
    'spine', 'hips', 'head', 'neck',
    'leftUpperArm', 'leftForearm', 'leftHand', 'rightUpperArm', 'rightForearm', 'rightHand',
    'leftThigh', 'leftShin', 'leftFoot', 'rightThigh', 'rightShin', 'rightFoot',
    'leftWingRoot', 'rightWingRoot', 'head', 'hips', 'leftHand', 'rightHand',
  ];
  function recordArmyJoints(entity, design) {
    const joints = getRigJointPositions(entity.kind, entity.seed);
    armyPivotNames.forEach((name, index) => {
      const pivot = joints[name];
      const values = pivot?.toArray ? pivot.toArray() : Array.isArray(pivot) ? pivot : [pivot?.x || 0, pivot?.y || 0, pivot?.z || 0];
      armyRigData.set([...values.slice(0, 3), 1], (entity.id * 32 + index) * 4);
    });
    armyRigData.set([design.ornamentPhase, 3.4 + (entity.seed % 13) * .07, 1, entity.kind === 'angel' ? -1 : 1], (entity.id * 32 + 31) * 4);
  }
  function armyMaterial(base) {
    const result = material(base.clone());
    result.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, armyUniforms);
      shader.vertexShader = ARMY_JOINT_SHADER + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
        vec3 armyPosition = position;
        vec3 armyNormal = normal;
        armyDeform(armyPosition, armyNormal);
        #include <beginnormal_vertex>
        objectNormal = armyNormal;
      `).replace('#include <begin_vertex>', `
        #include <begin_vertex>
        transformed = armyPosition;
      `);
    };
    result.customProgramCacheKey = () => 'aether-army-joints-v1';
    return result;
  }

  function rememberResources(group) {
    if (group.rig?.skeleton) ownedSkeletons.add(group.rig.skeleton);
    group.traverse((child) => {
      if (!child.isMesh) return;
      ownedGeometries.add(child.geometry);
      for (const mat of Array.isArray(child.material) ? child.material : [child.material]) {
        ownedMaterials.add(mat);
        Object.values(mat).forEach((value) => {
          if (value?.isTexture) ownedTextures.add(value);
        });
      }
    });
  }
  function geometryFingerprint(group) {
    let hash = 2166136261;
    group.traverse((child) => {
      if (!child.isMesh) return;
      const positions = child.geometry.attributes.position.array;
      for (let index = 0; index < positions.length; index += 1) {
        hash = Math.imul(hash ^ Math.round(positions[index] * 100000), 16777619);
      }
    });
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
  function activeHeroes() { return modelStyle === 'scanned' ? scannedHeroes : heroes; }
  function describe(entity) {
    const model = entity.hero
      ? activeHeroes()[entity.kind]
      : promotedEntity?.id === entity.id ? promotions[entity.kind] : null;
    return {
      id: entity.id,
      index: entity.id,
      name: entity.name,
      kind: entity.kind,
      role: entity.hero ? 'Archon' : 'Legion',
      detailCount: model?.userData.detailCount ?? entity.detailCount ?? 0,
      triangles: model?.userData.triangleCount ?? entity.triangleCount ?? 0,
      modelStyle: entity.hero ? modelStyle : 'sculpted',
      sourceTitle: model?.userData.sourceTitle || null,
      seed: entity.seed,
      archetype: entity.archetype,
      traits: entity.traits,
      signature: entity.signature,
      geometrySignature: entity.geometrySignature,
      skinned: Boolean(model?.rig),
      boneCount: model?.rig?.skeleton?.bones?.length || 0,
      position: entity.position.toArray(),
    };
  }
  function makeEntities(kind) {
    const isAngel = kind === 'angel';
    const offset = isAngel ? 0 : PER_REALM;
    const x = isAngel ? -4.55 : 4.55;
    const names = isAngel ? ANGEL_NAMES : DEMON_NAMES;
    const heroDesign = getCharacterDesign(kind, 1);
    const sculpture = createArticulatedSculpture(kind, 1, 'hero');
    rememberResources(sculpture);
    sculpture.position.set(x, .25, 0);
    sculpture.rotation.y = isAngel ? .12 : -.12;
    sculpture.traverse((child) => { child.userData.entityId = offset; });
    heroes[kind] = sculpture;
    scene.add(sculpture);
    selectable.push(sculpture);
    entities[offset] = {
      id: offset, kind, name: heroDesign.name || (isAngel ? 'Seraphiel · The Dawnkeeper' : 'Azrael · The Fallen'),
      hero: true, position: new THREE.Vector3(x, .25, 0), scale: 1,
      angle: sculpture.rotation.y, instanceIndex: -1,
      seed: 1, archetype: heroDesign.archetype, traits: heroDesign.traits, signature: heroDesign.signature,
      geometrySignature: geometryFingerprint(sculpture),
    };
    const materialBuckets = new Map();
    let instance = 0;
    for (const [row, count] of [20, 30, 40, 50, 60, 70, 80, 90, 59].entries()) {
      const radius = 12.7 + row * 4.8;
      for (let column = 0; column < count; column += 1) {
        const a = .055 + column / (count - 1) * (Math.PI / 2 - .12);
        const px = (isAngel ? -1 : 1) * Math.cos(a) * radius;
        const pz = -Math.sin(a) * radius - 1.8;
        const scale = .105 + Math.sin((instance + 3) * 7.13) * .01;
        const angle = Math.atan2(-px, 18 - pz) + Math.sin(instance * 6.2) * .08;
        const design = getCharacterDesign(kind, instance + 2);
        const entity = {
          id: offset + instance + 1,
          kind,
          name: design.name || `${names[(instance + 1) % names.length]} ${String(instance + 2).padStart(3, '0')}`,
          hero: false,
          position: new THREE.Vector3(px, .03, pz),
          scale,
          angle,
          instanceIndex: instance,
          seed: instance + 2,
          archetype: design.archetype,
          traits: design.traits,
          signature: design.signature,
          batchParts: [],
          rank: row,
          lane: instance % 25,
        };
        entities[entity.id] = entity;
        transform.position.copy(entity.position);
        transform.rotation.set(0, angle, 0);
        transform.scale.setScalar(scale);
        transform.updateMatrix();
        entity.matrix = transform.matrix.clone();
        const template = createSculpture(kind, entity.seed, 'distant');
        rememberResources(template);
        entity.detailCount = template.userData.detailCount;
        entity.triangleCount = template.userData.triangleCount;
        entity.geometrySignature = geometryFingerprint(template);
        recordArmyJoints(entity, design);
        template.updateMatrixWorld(true);
        template.traverse((child) => {
          if (!child.isMesh) return;
          const vertexCount = child.geometry.attributes.position.count;
          child.geometry.setAttribute('armyIndex', new THREE.BufferAttribute(new Float32Array(vertexCount).fill(entity.id), 1));
          const tags = child.geometry.attributes.partTag;
          entity.jointTagged = Boolean(tags);
          if (tags) for (const tag of tags.array) armyJointRegions.add(tag);
          const key = child.userData.materialKey || child.material.name || child.name;
          if (!materialBuckets.has(key)) materialBuckets.set(key, { material: child.material, pieces: [] });
          materialBuckets.get(key).pieces.push({
            entity, geometry: child.geometry,
            matrix: new THREE.Matrix4().multiplyMatrices(entity.matrix, child.matrixWorld),
          });
        });
        instance += 1;
      }
    }
    for (const [key, bucket] of materialBuckets) {
      const vertices = bucket.pieces.reduce((sum, part) => sum + part.geometry.attributes.position.count, 0);
      const indices = bucket.pieces.reduce((sum, part) => sum + (part.geometry.index?.count || 0), 0);
      const mesh = new THREE.BatchedMesh(bucket.pieces.length, vertices, indices, armyMaterial(bucket.material));
      mesh.name = `${kind}-unique-${key}`;
      mesh.userData.entityIds = {};
      mesh.perObjectFrustumCulled = true;
      // Opaque army materials use the depth buffer; their changing ranks do
      // not need thousands of individual front-to-back sort operations.
      mesh.sortObjects = Boolean(bucket.material.transparent);
      bucket.pieces.forEach((part) => {
        const geometryId = mesh.addGeometry(part.geometry);
        const instanceId = mesh.addInstance(geometryId);
        mesh.setMatrixAt(instanceId, part.matrix);
        mesh.userData.entityIds[instanceId] = part.entity.id;
        part.entity.batchParts.push({ mesh, instanceId });
      });
      mesh.computeBoundingSphere();
      population[kind].push(mesh);
      batchedMeshes.push(mesh);
      selectable.push(mesh);
      scene.add(mesh);
    }
  }
  makeEntities('angel');
  makeEntities('demon');
  armyRigTexture.needsUpdate = true;

  async function loadScannedModels() {
    if (scannedHeroes.angel && scannedHeroes.demon) return;
    if (!scannedPromise) {
      const loader = new GLTFLoader();
      scannedPromise = Promise.all([
        loader.loadAsync(`${import.meta.env.BASE_URL}models/angel.glb`),
        loader.loadAsync(`${import.meta.env.BASE_URL}models/guardian.glb`),
      ]).then(([angel, demon]) => {
        if (disposed) return;
        for (const [kind, gltf] of [['angel', angel], ['demon', demon]]) {
          const content = gltf.scene;
          rememberResources(content);
          // The angel contains overlapping alternate LOD meshes.
          // Only the actual 220,000-triangle close mesh is displayed.
          if (kind === 'angel') {
            const obsolete = [];
            content.traverse((child) => {
              if (/LOD[12]/i.test(child.name)) obsolete.push(child);
            });
            obsolete.forEach((child) => child.removeFromParent());
          }
          content.updateMatrixWorld(true);
          const bounds = new THREE.Box3().setFromObject(content);
          const size = bounds.getSize(new THREE.Vector3());
          const center = bounds.getCenter(new THREE.Vector3());
          const scale = 6.2 / size.y;
          content.scale.multiplyScalar(scale);
          content.position.add(new THREE.Vector3(-center.x * scale, -bounds.min.y * scale, -center.z * scale));
          const group = new THREE.Group();
          group.add(content);
          let triangleCount = 0;
          content.traverse((child) => {
            if (!child.isMesh) return;
            triangleCount += child.geometry.index
              ? child.geometry.index.count / 3
              : child.geometry.attributes.position.count / 3;
            child.userData.entityId = kind === 'angel' ? 0 : PER_REALM;
            if (kind === 'angel') child.material.color.set(0xe7decb);
          });
          group.userData = {
            kind, detailCount: 0, triangleCount,
            sourceTitle: kind === 'angel' ? 'Engel · noe-3d.at' : 'Winged guardian · Smithsonian',
          };
          rememberResources(group);
          group.position.copy(entities[kind === 'angel' ? 0 : PER_REALM].position);
          group.rotation.y = kind === 'angel' ? .12 : -.12;
          group.visible = false;
          scannedHeroes[kind] = group;
          scene.add(group);
          selectable.push(group);
        }
      }).catch((error) => {
        scannedPromise = null;
        throw error;
      });
    }
    await scannedPromise;
  }

  async function setModelStyle(value) {
    endBattle(false);
    const next = value === 'scanned' ? 'scanned' : 'sculpted';
    requestedModelStyle = next;
    if (next === modelStyle && !modelLoading) return getSnapshot();
    if (next === 'scanned') {
      modelLoading = true;
      onStats(getSnapshot());
      try {
        await loadScannedModels();
      } catch (error) {
        modelLoading = false;
        onStats(getSnapshot());
        throw error;
      }
      modelLoading = false;
      if (disposed || requestedModelStyle !== next) return getSnapshot();
    }
    restorePopulation();
    const previousWasCrowd = !entities[selectedId].hero;
    if (next === 'scanned' && previousWasCrowd) {
      selectedId = entities[selectedId].kind === 'angel' ? 0 : PER_REALM;
    }
    modelStyle = next;
    for (const kind of ['angel', 'demon']) {
      heroes[kind].visible = next === 'sculpted';
      if (promotions[kind]) promotions[kind].visible = false;
      if (scannedHeroes[kind]) {
        scannedHeroes[kind].visible = next === 'scanned';
      }
    }
    // Keep the currently inspected figure in place when changing the study.
    selectEntity(selectedId, next === 'scanned' && previousWasCrowd);
    applyWorld(realm);
    onStats(getSnapshot());
    return getSnapshot();
  }

  const selectionMaterial = material(new THREE.MeshBasicMaterial({
    color: 0xeed3a3, transparent: true, opacity: .7, depthWrite: false,
  }));
  const selectionRing = new THREE.Mesh(geometry(new THREE.RingGeometry(2.51, 2.528, 100)), selectionMaterial);
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.set(-4.55, .018, 0);
  scene.add(selectionRing);

  // Each tiny ember is one vertex; all the volume is drawn in a single call.
  const particleCount = mobile ? 600 : 1400;
  const particlePositions = new Float32Array(particleCount * 3);
  const particleColors = new Float32Array(particleCount * 3);
  const particleOrigins = new Float32Array(particleCount * 3);
  const colorLeft = new THREE.Color('#d3c7a6');
  const colorRight = new THREE.Color('#c45a35');
  for (let index = 0; index < particleCount; index += 1) {
    const x = (Math.random() - .5) * 42;
    const y = Math.random() * 16;
    const z = (Math.random() - .75) * 40;
    particlePositions.set([x, y, z], index * 3);
    particleOrigins.set([x, y, z], index * 3);
    const color = x < 0 ? colorLeft : colorRight;
    const brightness = .3 + Math.random() * .7;
    particleColors.set([color.r * brightness, color.g * brightness, color.b * brightness], index * 3);
  }
  const particleGeometry = geometry(new THREE.BufferGeometry());
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
  const particleMaterial = material(new THREE.PointsMaterial({
    size: .022, vertexColors: true, map: glowTexture,
    transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false,
    sizeAttenuation: true,
  }));
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particles);

  // Architectural vanishing lines make orbiting visibly spatial.
  const pillarGeometry = geometry(new THREE.CylinderGeometry(.04, .08, 12, 5));
  const pillars = new THREE.InstancedMesh(pillarGeometry, darkStone, 30);
  for (let i = 0; i < 30; i += 1) {
    const a = i / 30 * TAU;
    transform.position.set(Math.cos(a) * 35, 5.9, Math.sin(a) * 35 - 7);
    transform.rotation.set(0, a, 0);
    transform.scale.setScalar(1);
    transform.updateMatrix();
    pillars.setMatrixAt(i, transform.matrix);
  }
  scene.add(pillars);

  const worldGroups = { angel: new THREE.Group(), demon: new THREE.Group() };
  const cloudMists = [];
  const celestialStone = material(new THREE.MeshStandardMaterial({
    color: 0x9aa9a6, metalness: .2, roughness: .52,
  }));
  const celestialGlow = material(new THREE.MeshBasicMaterial({
    color: 0xc9e3db, transparent: true, opacity: .3,
  }));
  const infernalStone = material(new THREE.MeshStandardMaterial({
    color: 0x21171a, roughness: .87, metalness: .18,
  }));
  const lavaMaterial = material(new THREE.MeshStandardMaterial({
    color: 0xf85317, emissive: 0xff2606, emissiveIntensity: 2.2, roughness: .5,
  }));
  const shaftGeometry = geometry(new THREE.CylinderGeometry(.23, .3, 12, 12));
  const capitalGeometry = geometry(new THREE.CylinderGeometry(.55, .55, .2, 12));
  const rockGeometry = geometry(new THREE.ConeGeometry(1, 1, 5));
  for (let index = 0; index < 26; index += 1) {
    const angle = index / 26 * TAU;
    const px = Math.cos(angle) * 23 - 4.55;
    const pz = Math.sin(angle) * 23 - 5;
    const shaft = new THREE.Mesh(shaftGeometry, celestialStone);
    shaft.position.set(px, 5.9, pz);
    worldGroups.angel.add(shaft);
    for (const y of [.12, 11.85]) {
      const capital = new THREE.Mesh(capitalGeometry, gold);
      capital.position.set(px, y, pz);
      worldGroups.angel.add(capital);
    }
    const tall = 2.5 + ((index * 13) % 8);
    const rock = new THREE.Mesh(rockGeometry, infernalStone);
    rock.position.set(Math.cos(angle) * 20 + 4.55, tall / 2 - .03, Math.sin(angle) * 20 - 5);
    rock.scale.set(1.1 + index % 3 * .4, tall, .9 + index % 2 * .6);
    rock.rotation.set(Math.sin(index) * .12, index * 2.7, Math.cos(index) * .08);
    worldGroups.demon.add(rock);
    const fissure = new THREE.Mesh(geometry(new THREE.CylinderGeometry(.025, .04, 8 + index % 5, 3)), lavaMaterial);
    fissure.rotation.set(Math.PI / 2, 0, angle);
    fissure.position.set(Math.cos(angle) * 13 + 4.55, -.012, Math.sin(angle) * 13 - 4);
    worldGroups.demon.add(fissure);
  }
  for (const radius of [18, 23, 28]) {
    const arch = new THREE.Mesh(geometry(new THREE.TorusGeometry(radius, .035, 5, 160)), celestialGlow);
    arch.rotation.x = Math.PI / 2;
    arch.position.set(-4.55, 11.9, -5);
    worldGroups.angel.add(arch);
    const molten = new THREE.Mesh(geometry(new THREE.TorusGeometry(radius - 2, .12, 5, 128)), lavaMaterial);
    molten.rotation.x = Math.PI / 2;
    molten.position.set(4.55, -.01, -5);
    worldGroups.demon.add(molten);
  }
  for (let index = 0; index < 18; index += 1) {
    const cloud = new THREE.Sprite(material(new THREE.SpriteMaterial({
      map: glowTexture, color: 0xc5d9e1, opacity: .09, transparent: true, depthWrite: false,
    })));
    const angle = index / 18 * TAU;
    cloud.position.set(Math.cos(angle) * 19 - 4.55, 4 + index % 4 * 2, Math.sin(angle) * 19 - 7);
    cloud.scale.set(18, 7, 1);
    cloud.userData.baseY = cloud.position.y;
    cloudMists.push(cloud);
    worldGroups.angel.add(cloud);
  }
  worldGroups.angel.visible = false;
  worldGroups.demon.visible = false;
  scene.add(worldGroups.angel, worldGroups.demon);

  // The invitation to duel is a physical, raycastable sword in the arena.
  const battleSword = new THREE.Group();
  battleSword.position.set(0, 3.5, 2.4);
  battleSword.rotation.z = -.11;
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-.13, 0);
  bladeShape.lineTo(-.18, -1.78);
  bladeShape.lineTo(0, -2.42);
  bladeShape.lineTo(.18, -1.78);
  bladeShape.lineTo(.13, 0);
  bladeShape.closePath();
  const swordMetal = material(new THREE.MeshStandardMaterial({
    color: 0xc8c8bd, metalness: .95, roughness: .16,
  }));
  const blade = new THREE.Mesh(geometry(new THREE.ExtrudeGeometry(bladeShape, {
    depth: .055, bevelEnabled: true, bevelThickness: .035, bevelSize: .035, bevelSegments: 2, steps: 1,
  })), swordMetal);
  battleSword.add(blade);
  const handle = new THREE.Mesh(geometry(new THREE.CylinderGeometry(.075, .085, .8, 12)), darkStone);
  handle.position.y = .55;
  battleSword.add(handle);
  const guard = new THREE.Mesh(geometry(new THREE.CylinderGeometry(.055, .075, 1.05, 10)), gold);
  guard.rotation.z = Math.PI / 2;
  guard.position.y = .1;
  battleSword.add(guard);
  for (let index = 0; index < 8; index += 1) {
    const winding = new THREE.Mesh(geometry(new THREE.TorusGeometry(.08, .014, 5, 16)), gold);
    winding.rotation.x = Math.PI / 2;
    winding.position.y = .22 + index * .09;
    battleSword.add(winding);
  }
  const pommel = new THREE.Mesh(geometry(new THREE.OctahedronGeometry(.16, 1)), gold);
  pommel.position.y = 1.1;
  battleSword.add(pommel);
  const swordGem = new THREE.Mesh(geometry(new THREE.OctahedronGeometry(.11, 1)), lavaMaterial);
  swordGem.position.set(0, .08, .12);
  battleSword.add(swordGem);
  battleSword.traverse((child) => {
    if (child.isMesh) {
      child.userData.battleSword = true;
      worldClickTargets.push(child);
    }
  });
  scene.add(battleSword);
  const armySparkPositions = new Float32Array(200 * 3);
  const armySparkGeometry = geometry(new THREE.BufferGeometry());
  armySparkGeometry.setAttribute('position', new THREE.BufferAttribute(armySparkPositions, 3));
  const armySparks = new THREE.Points(armySparkGeometry, material(new THREE.PointsMaterial({
    color: new THREE.Color(2.5, .8, .15), size: .042, map: glowTexture,
    transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending,
  })));
  armySparks.visible = false;
  scene.add(armySparks);

  function resetArmyBattle() {
    armyBlend = 0;
    armyUniforms.uArmyBlend.value = 0;
    armySparks.visible = false;
    entities.forEach((entity) => {
      entity.batchParts?.forEach(({ mesh, instanceId }) => mesh.setMatrixAt(instanceId, entity.matrix));
    });
  }
  function updateArmyBattle(delta) {
    const fighting = battleState.status === 'fighting';
    const targetBlend = fighting ? 1 : 0;
    armyBlend += (targetBlend - armyBlend) * (1 - Math.exp(-delta * 2.6));
    if (armyBlend < .0005 && !fighting) {
      if (armyUniforms.uArmyBlend.value !== 0) resetArmyBattle();
      return;
    }
    armyClock += delta;
    armyUniforms.uArmyTime.value = armyClock;
    armyUniforms.uArmyBlend.value = armyBlend;
    armyMatrixTimer += delta;
    if (armyMatrixTimer >= 1 / 45) {
      armyMatrixTimer = 0;
      entities.forEach((entity) => {
        if (entity.hero) return;
        const side = entity.kind === 'angel' ? -1 : 1;
        const rank = Math.floor(entity.instanceIndex / 25);
        const lane = entity.instanceIndex % 25;
        const phase = armyClock * (3.4 + (entity.seed % 13) * .07) + (entity.seed % 27) * .83;
        // Opposing lanes retain a body-width gap and a grounded foot plane.
        // Front ranks lunge toward the contact line; later ranks follow.
        const lunge = Math.max(0, Math.sin(phase)) * .17;
        const battleX = side * (.55 + rank * .65 - lunge);
        const battleZ = -4.2 - lane * 1.05 + Math.sin(phase * .5) * .055;
        transform.position.set(
          THREE.MathUtils.lerp(entity.position.x, battleX, armyBlend),
          Math.max(.03, entity.position.y + Math.max(0, Math.sin(phase * 2)) * .025 * armyBlend),
          THREE.MathUtils.lerp(entity.position.z, battleZ, armyBlend),
        );
        transform.rotation.set(0, THREE.MathUtils.lerp(entity.angle, side < 0 ? Math.PI / 2 : -Math.PI / 2, armyBlend), 0);
        transform.scale.setScalar(entity.scale);
        transform.updateMatrix();
        entity.batchParts.forEach(({ mesh, instanceId }) => mesh.setMatrixAt(instanceId, transform.matrix));
      });
    }
    // The two permanent archons remain unique members of the thousand even
    // when other individuals are chosen for the main duel.
    Object.values(heroes).forEach((group, index) => {
      if (!group.rig || battleActors.some((actor) => actor.group === group)) return;
      const joints = group.rig.bones || group.rig.joints;
      const phase = armyClock * 3.7 + index * 2;
      const rotate = (name, axis, angle) => {
        const bone = joints?.[name];
        if (bone?.rotation) bone.rotation[axis] = angle * armyBlend;
      };
      rotate('leftUpperArm', 'x', -.6 + Math.sin(phase) * .6);
      rotate('rightUpperArm', 'x', -.6 - Math.sin(phase) * .6);
      rotate('leftForearm', 'x', -.7 + Math.sin(phase + .3) * .4);
      rotate('rightForearm', 'x', -.7 - Math.sin(phase + .3) * .4);
      rotate('leftThigh', 'x', Math.sin(phase) * .3);
      rotate('rightThigh', 'x', -Math.sin(phase) * .3);
      rotate('leftShin', 'x', Math.max(0, -Math.sin(phase)) * .5);
      rotate('rightShin', 'x', Math.max(0, Math.sin(phase)) * .5);
      rotate('spine', 'y', Math.sin(phase) * .16);
      rotate('leftWingRoot', 'y', Math.sin(phase - .4) * .26);
      rotate('rightWingRoot', 'y', -Math.sin(phase - .4) * .26);
    });
    armySparks.visible = fighting && armyBlend > .3;
    if (armySparks.visible) {
      for (let index = 0; index < 200; index += 1) {
        const t = (armyClock * 1.8 + index * .117) % .65;
        armySparkPositions[index * 3] = Math.sin(index * 5.7) * t * .55;
        armySparkPositions[index * 3 + 1] = Math.max(.035, .24 + t * 1.2 - t * t * 2);
        armySparkPositions[index * 3 + 2] = -4.2 - (index % 25) * 1.05 + Math.cos(index * 2.3) * t * .3;
      }
      armySparkGeometry.attributes.position.needsUpdate = true;
    }
  }

  const atmospheres = {
    all: { background: 0x07090d, fog: 0x0b0d11, floor: 0x11141a, density: .018, key: 0xffedd2, intensity: 2.65 },
    angel: { background: 0x20333e, fog: 0x40515b, floor: 0x435258, density: .024, key: 0xe8f5ed, intensity: 3.2 },
    demon: { background: 0x190708, fog: 0x310c0c, floor: 0x191013, density: .022, key: 0xffb880, intensity: 2.4 },
  };
  function applyWorld(nextRealm) {
    const next = ['angel', 'demon'].includes(nextRealm) ? nextRealm : 'all';
    const changed = realm !== next;
    realm = next;
    const atmosphere = atmospheres[next];
    worldTransition = {
      at: performance.now(),
      fromBackground: scene.background.clone(), toBackground: new THREE.Color(atmosphere.background),
      fromFog: scene.fog.color.clone(), toFog: new THREE.Color(atmosphere.fog),
      fromFloor: graphite.color.clone(), toFloor: new THREE.Color(atmosphere.floor),
      fromKey: key.color.clone(), toKey: new THREE.Color(atmosphere.key),
      fromDensity: scene.fog.density, toDensity: atmosphere.density,
      fromIntensity: key.intensity, toIntensity: atmosphere.intensity,
    };
    for (const kind of ['angel', 'demon']) {
      const visible = next === 'all' || next === kind;
      population[kind].forEach((mesh) => { mesh.visible = visible; });
      heroes[kind].visible = visible && modelStyle === 'sculpted';
      if (scannedHeroes[kind]) scannedHeroes[kind].visible = visible && modelStyle === 'scanned';
      if (promotions[kind]) promotions[kind].visible = visible;
      worldGroups[kind].visible = next === kind;
    }
    portals.forEach((portal) => { portal.group.visible = next === 'all' || portal.kind === next; });
    battleSword.visible = next === 'all' && battleState.status === 'idle';
    leftRim.intensity = next === 'demon' ? 0 : 110;
    rightRim.intensity = next === 'angel' ? 0 : 165;
    if (changed) onWorldChange(next);
  }
  function changeRealm(nextRealm) {
    endBattle(false);
    applyWorld(nextRealm);
    if (realm === 'all') {
      if (!entities[selectedId].hero && !promotions[entities[selectedId].kind]) selectEntity(selectedId, false);
      const view = defaultView();
      transitionCamera(view.position, view.target, 1350);
    } else {
      selectEntity(realm === 'angel' ? 0 : PER_REALM, true);
    }
  }
  function releaseBattleActors() {
    battleActors.forEach(({ group, entity, borrowed }) => {
      if (!borrowed) {
        group.removeFromParent();
        if (group.userData.ownedGeometry) {
          group.traverse((child) => {
            if (!child.isMesh) return;
            child.geometry.dispose();
            ownedGeometries.delete(child.geometry);
          });
          group.rig?.skeleton?.dispose();
          ownedSkeletons.delete(group.rig?.skeleton);
        }
      }
      entity.batchParts?.forEach(({ mesh, instanceId }) => mesh.setVisibleAt(instanceId, true));
    });
    battleActors = [];
    for (const [kind, { group, original }] of battleAudience) {
      group.removeFromParent();
      group.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry.dispose();
        ownedGeometries.delete(child.geometry);
      });
      group.rig?.skeleton?.dispose();
      ownedSkeletons.delete(group.rig?.skeleton);
      heroes[kind] = original;
      original.visible = true;
    }
    battleAudience.clear();
    for (const kind of ['angel', 'demon']) {
      const entity = entities[kind === 'angel' ? 0 : PER_REALM];
      heroes[kind].position.copy(entity.position);
      heroes[kind].rotation.set(0, entity.angle, 0);
      heroes[kind].scale.setScalar(1);
      heroes[kind].rig?.reset?.();
    }
  }
  function endBattle(restoreSelection = true) {
    if (battleState.status === 'idle' && !battleActors.length) return;
    battleState = { status: 'idle' };
    combat?.cancel();
    resetArmyBattle();
    releaseBattleActors();
    battleSword.visible = true;
    applyWorld(realm);
    if (restoreSelection && !entities[selectedId].hero) selectEntity(selectedId, false);
  }
  function startBattle(seed) {
    endBattle(false);
    restorePopulation();
    flipTransition = null;
    releaseBattleActors();
    battleClock = 0;
    armyClock = 0;
    armyCameraAllowed = true;
    armyCameraWide = false;
    modelStyle = requestedModelStyle = 'sculpted';
    applyWorld('all');
    const battleSeed = seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
    const numericSeed = typeof battleSeed === 'number'
      ? battleSeed : [...String(battleSeed)].reduce((sum, char) => Math.imul(sum ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0;
    const selected = entities[selectedId];
    const angelId = selected.kind === 'angel' ? selected.id : (numericSeed >>> 0) % PER_REALM;
    const demonId = selected.kind === 'demon' ? selected.id : PER_REALM + ((numericSeed >>> 5) + 137) % PER_REALM;
    for (const id of [angelId, demonId]) {
      const entity = entities[id];
      const borrowed = entity.hero;
      const group = borrowed ? heroes[entity.kind] : createArticulatedSculpture(entity.kind, entity.seed, 'hero');
      if (!borrowed) {
        rememberResources(group);
        group.position.set(entity.kind === 'angel' ? -4.55 : 4.55, .25, 0);
        group.rotation.y = entity.kind === 'angel' ? .12 : -.12;
        scene.add(group);
        entity.batchParts.forEach(({ mesh, instanceId }) => mesh.setVisibleAt(instanceId, false));
        // A distant archon keeps its identity and real joint animation while
        // the matching full-detail sculpture is reserved for close viewing.
        const original = heroes[entity.kind];
        const audience = createArticulatedSculpture(entity.kind, 1, 'distant');
        rememberResources(audience);
        audience.rotation.y = original.rotation.y;
        audience.position.set(entity.kind === 'angel' ? -4.55 : 4.55, .03, -6.8);
        audience.scale.setScalar(.18);
        original.visible = false;
        scene.add(audience);
        heroes[entity.kind] = audience;
        battleAudience.set(entity.kind, { group: audience, original });
      }
      battleActors.push({ group, entity, borrowed });
    }
    if (!combat) {
      combat = createCombat({
        scene, reducedMotion,
        onUpdate(state) {
          battleState = {
            ...state,
            angelId: battleActors[0]?.entity.id,
            demonId: battleActors[1]?.entity.id,
            angelName: battleActors[0]?.entity.name,
            demonName: battleActors[1]?.entity.name,
          };
          onBattleUpdate(battleState);
        },
        onComplete(state) {
          battleState = { ...battleState, ...state };
          onBattleComplete(battleState);
        },
      });
    }
    battleSword.visible = false;
    const target = new THREE.Vector3(0, 3, 0);
    const horizontalTangent = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect;
    const distance = Math.max(18, 9.3 / horizontalTangent);
    transitionCamera(new THREE.Vector3(0, 5, distance), target, 900);
    combat.start({
      angel: battleActors[0].group, demon: battleActors[1].group,
      angelName: battleActors[0].entity.name, demonName: battleActors[1].entity.name, seed: battleSeed,
    });
    return { ...battleState };
  }
  function flipSelected(axis = 'x') {
    endBattle();
    const entity = entities[selectedId];
    const group = entity.hero ? activeHeroes()[entity.kind] : promotions[entity.kind];
    if (!group) return;
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(group);
    const pivot = bounds.getCenter(new THREE.Vector3());
    flipTransition = {
      group, pivot, offset: group.position.clone().sub(pivot),
      quaternion: group.quaternion.clone(),
      axis: new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0),
      at: performance.now(),
    };
  }
  function interactionTargets() {
    const rect = canvas.getBoundingClientRect();
    const targets = portals.map((portal) => ({
      type: 'portal', id: portal.kind, object: portal.group,
      point: new THREE.Vector3(0, 3.7, .1),
    }));
    targets.push({ type: 'sword', id: 'duel', object: battleSword, point: new THREE.Vector3(0, -.7, .1) });
    return targets.map(({ type, id, object, point }) => {
      object.updateWorldMatrix(true, false);
      point.applyMatrix4(object.matrixWorld).project(camera);
      return {
        type, id, visible: object.visible && point.z > -1 && point.z < 1,
        x: rect.left + (point.x + 1) / 2 * rect.width,
        y: rect.top + (1 - point.y) / 2 * rect.height,
      };
    });
  }

  function defaultView() {
    const width = canvas.clientWidth || innerWidth;
    const height = canvas.clientHeight || innerHeight;
    const aspect = width / height;
    const horizontalTangent = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * aspect;
    const distance = Math.max(21.8, 10.5 / horizontalTangent);
    return {
      position: new THREE.Vector3(0, 5.4, distance),
      target: new THREE.Vector3(0, 3.15, -1.4),
    };
  }
  const initial = defaultView();
  camera.position.copy(initial.position);
  controls.target.copy(initial.target);
  controls.update();

  function transitionCamera(position, target, duration = 1150) {
    cameraTransition = {
      startPosition: camera.position.clone(),
      startTarget: controls.target.clone(),
      endPosition: position.clone(),
      endTarget: target.clone(),
      at: performance.now(),
      duration: reducedMotion ? 0 : duration,
    };
  }
  function restorePopulation() {
    if (!promotedEntity) return;
    const previous = promotedEntity;
    previous.batchParts.forEach(({ mesh, instanceId }) => mesh.setVisibleAt(instanceId, true));
    const oldSculpture = promotions[previous.kind];
    if (oldSculpture) {
      if (flipTransition?.group === oldSculpture) flipTransition = null;
      oldSculpture.removeFromParent();
      const selectableIndex = selectable.indexOf(oldSculpture);
      if (selectableIndex !== -1) selectable.splice(selectableIndex, 1);
      oldSculpture.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry.dispose();
        ownedGeometries.delete(child.geometry);
      });
      oldSculpture.rig?.skeleton?.dispose();
      ownedSkeletons.delete(oldSculpture.rig?.skeleton);
      delete promotions[previous.kind];
    }
    promotedEntity = null;
  }
  function selectEntity(index, moveCamera = true) {
    if (battleState.status !== 'idle') endBattle();
    const id = Math.max(0, Math.min(ENTITY_COUNT - 1, Number(index)));
    const entity = entities[id];
    if (!entity) return;
    restorePopulation();
    if (modelStyle === 'scanned' && !entity.hero) {
      modelStyle = 'sculpted';
      requestedModelStyle = 'sculpted';
      for (const kind of ['angel', 'demon']) {
        heroes[kind].visible = true;
        scannedHeroes[kind].visible = false;
      }
    }
    selectedId = id;
    if (moveCamera) applyWorld(entity.kind);
    controls.minDistance = Math.max(.22, entity.scale * .8);
    if (!entity.hero) {
      const promoted = createArticulatedSculpture(entity.kind, entity.seed, 'hero');
      rememberResources(promoted);
      promotions[entity.kind] = promoted;
      promoted.position.copy(entity.position);
      promoted.rotation.set(0, entity.angle, 0);
      promoted.scale.setScalar(entity.scale);
      promoted.traverse((child) => { child.userData.entityId = entity.id; });
      promoted.visible = true;
      scene.add(promoted);
      selectable.push(promoted);
      entity.batchParts.forEach(({ mesh, instanceId }) => mesh.setVisibleAt(instanceId, false));
      promotedEntity = entity;
    }
    selectionRing.position.set(entity.position.x, entity.hero ? .018 : .02, entity.position.z);
    selectionRing.scale.setScalar(entity.hero ? 1 : entity.scale * .8);
    selectionMaterial.color.set(entity.kind === 'angel' ? 0xeed3a3 : 0xff6c48);
    if (moveCamera) {
      const target = entity.position.clone().add(new THREE.Vector3(0, 3.1 * entity.scale, 0));
      const angle = entity.angle + .14;
      const aspect = (canvas.clientWidth || innerWidth) / (canvas.clientHeight || innerHeight);
      const framedDistance = 4.8 / (Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * aspect);
      const distance = Math.max(12.3, framedDistance) * entity.scale;
      const offset = new THREE.Vector3(
        Math.sin(angle) * distance,
        1.05 * entity.scale,
        Math.cos(angle) * distance,
      );
      transitionCamera(target.clone().add(offset), target);
    }
    onSelect(describe(entity));
  }
  function getSnapshot() {
    const gpuJointActors = entities.filter((entity) => !entity.hero && entity.jointTagged).length
      - battleActors.filter((actor) => !actor.entity.hero).length - (promotedEntity ? 1 : 0);
    const displayedRigs = new Set([
      ...Object.values(heroes), ...Object.values(promotions), ...battleActors.map((actor) => actor.group),
    ].filter((group) => group.visible && group.rig?.skeleton?.bones.length));
    const armyActive = battleState.status === 'fighting' || armyBlend > .02;
    const matrix = new THREE.Matrix4();
    let minRootY = Infinity;
    const matrixSamples = [];
    const sampleIds = new Set([1, 100, PER_REALM + 1, PER_REALM + 200]);
    entities.forEach((entity) => {
      const part = entity.batchParts?.[0];
      if (!part || !part.mesh.getVisibleAt(part.instanceId)) return;
      part.mesh.getMatrixAt(part.instanceId, matrix);
      minRootY = Math.min(minRootY, matrix.elements[13]);
      if (sampleIds.has(entity.id)) matrixSamples.push({
        id: entity.id,
        position: [matrix.elements[12], matrix.elements[13], matrix.elements[14]],
        matrix: matrix.toArray(),
      });
    });
    const boneNames = ['spine', 'head', 'leftUpperArm', 'rightUpperArm', 'leftForearm', 'rightForearm', 'leftThigh', 'rightThigh', 'leftShin', 'rightShin', 'leftWingRoot', 'rightWingRoot'];
    const poseSamples = battleActors.map(({ entity, group }) => ({
      id: entity.id,
      position: group.position.toArray(),
      quaternion: group.quaternion.toArray(),
      bones: Object.fromEntries(boneNames.flatMap((name) => {
        const bone = group.rig?.bones?.[name];
        return bone ? [[name, bone.quaternion.toArray()]] : [];
      })),
    }));
    return {
      entityCount: entities.length,
      uniqueDesignCount: new Set(entities.map((entity) => entity.geometrySignature)).size,
      collectionArchetypeCount: new Set(entities.map((entity) => entity.archetype)).size,
      angelCount: PER_REALM,
      demonCount: PER_REALM,
      portalCount: portals.length,
      highDetailCount: activeHeroes().angel.userData.detailCount + activeHeroes().demon.userData.detailCount,
      modelStyle,
      modelLoading,
      selectedId,
      selected: describe(entities[selectedId]),
      realm,
      quality,
      renderPixelRatio: renderer.getPixelRatio(),
      paused,
      autoRotate: controls.autoRotate,
      fps,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      camera: camera.position.toArray(),
      target: controls.target.toArray(),
      controls: 'OrbitControls',
      renderer: 'WebGL',
      world: realm,
      flipping: Boolean(flipTransition),
      selectedQuaternion: (promotions[entities[selectedId].kind] || activeHeroes()[entities[selectedId].kind]).quaternion.toArray(),
      battle: { ...battleState, poseSamples },
      interactionTargets: interactionTargets(),
      armyBattle: {
        active: armyActive,
        participants: armyActive ? gpuJointActors + displayedRigs.size : 0,
        gpuJointActors,
        skinnedActors: displayedRigs.size,
        articulated: armyActive && gpuJointActors + displayedRigs.size === ENTITY_COUNT && armyJointRegions.size >= 18,
        jointRegions: armyJointRegions.size,
        shaderTime: armyUniforms.uArmyTime.value,
        blend: armyUniforms.uArmyBlend.value,
        matrixSamples,
        minRootY: Number.isFinite(minRootY) ? minRootY : null,
        groundClamped: Number.isFinite(minRootY) && minRootY >= .029,
        separatedLanes: 25,
      },
    };
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function getHit(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - rect.left) / rect.width * 2 - 1;
    pointer.y = -(event.clientY - rect.top) / rect.height * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const intersections = raycaster.intersectObjects([...selectable, ...worldClickTargets], true);
    return intersections.find((hit) => {
      let visible = true;
      let current = hit.object;
      while (current) { visible &&= current.visible; current = current.parent; }
      return visible && (hit.object.userData.entityId !== undefined || hit.instanceId !== undefined || hit.batchId !== undefined || hit.object.userData.portalKind || hit.object.userData.battleSword);
    });
  }
  function onPointerDown(event) {
    if (event.button !== 0) return;
    pointerDown = { x: event.clientX, y: event.clientY, at: performance.now() };
    pointerMoved = false;
  }
  function onPointerMove(event) {
    if (!pointerDown) return;
    if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 6) pointerMoved = true;
  }
  function onPointerUp(event) {
    if (!pointerDown || pointerMoved || performance.now() - pointerDown.at > 650) {
      pointerDown = null;
      return;
    }
    pointerDown = null;
    const hit = getHit(event);
    if (!hit) return;
    if (hit.object.userData.portalKind) {
      changeRealm(realm === hit.object.userData.portalKind ? 'all' : hit.object.userData.portalKind);
      return;
    }
    if (hit.object.userData.battleSword) {
      onBattleRequest();
      return;
    }
    const id = hit.object.isBatchedMesh
      ? hit.object.userData.entityIds[hit.batchId]
      : hit.object.isInstancedMesh ? hit.object.userData.entityIds[hit.instanceId]
      : hit.object.userData.entityId;
    if (id !== undefined) selectEntity(id, true);
  }
  function cancelTransition() { cameraTransition = null; armyCameraAllowed = false; }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  controls.addEventListener('start', cancelTransition);

  function resize() {
    if (disposed) return;
    const width = Math.max(1, canvas.clientWidth || innerWidth);
    const height = Math.max(1, canvas.clientHeight || innerHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  function render(now) {
    if (disposed || document.hidden) return;
    const delta = Math.min((now - lastTime) / 1000, .05);
    lastTime = now;
    if (!paused) elapsed += delta;
    if (cameraTransition) {
      const transition = cameraTransition;
      const t = transition.duration ? Math.min((now - transition.at) / transition.duration, 1) : 1;
      const eased = 1 - (1 - t) ** 3;
      camera.position.lerpVectors(transition.startPosition, transition.endPosition, eased);
      controls.target.lerpVectors(transition.startTarget, transition.endTarget, eased);
      if (t >= 1) cameraTransition = null;
    }
    if (worldTransition) {
      const t = reducedMotion ? 1 : Math.min((now - worldTransition.at) / 1200, 1);
      const eased = t * t * (3 - 2 * t);
      scene.background.lerpColors(worldTransition.fromBackground, worldTransition.toBackground, eased);
      scene.fog.color.lerpColors(worldTransition.fromFog, worldTransition.toFog, eased);
      graphite.color.lerpColors(worldTransition.fromFloor, worldTransition.toFloor, eased);
      key.color.lerpColors(worldTransition.fromKey, worldTransition.toKey, eased);
      key.intensity = THREE.MathUtils.lerp(worldTransition.fromIntensity, worldTransition.toIntensity, eased);
      scene.fog.density = THREE.MathUtils.lerp(worldTransition.fromDensity, worldTransition.toDensity, eased);
      if (t >= 1) worldTransition = null;
    }
    if (flipTransition) {
      const t = reducedMotion ? 1 : Math.min((now - flipTransition.at) / 1050, 1);
      const eased = t * t * (3 - 2 * t);
      const turn = new THREE.Quaternion().setFromAxisAngle(flipTransition.axis, Math.PI * eased);
      flipTransition.group.quaternion.copy(turn).multiply(flipTransition.quaternion);
      flipTransition.group.position.copy(flipTransition.offset).applyQuaternion(turn).add(flipTransition.pivot);
      if (t >= 1) flipTransition = null;
    }
    combat?.update(delta);
    updateArmyBattle(delta);
    if (battleState.status === 'fighting') {
      battleClock += delta;
      if (armyCameraAllowed && !armyCameraWide && battleClock > 2.4) {
        armyCameraWide = true;
        const horizontalTangent = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect;
        transitionCamera(new THREE.Vector3(0, 8, Math.max(24, 11 / horizontalTangent)), new THREE.Vector3(0, 2.4, -5.8), 1700);
      }
    }
    portals.forEach(({ portalMaterial, runes, isAngel }) => {
      portalMaterial.uniforms.uTime.value = elapsed;
      runes.rotation.z = elapsed * (isAngel ? .012 : -.018);
    });
    if (!paused) {
      for (let index = 0; index < particleCount; index += 1) {
        const base = index * 3;
        particlePositions[base] = particleOrigins[base] + Math.sin(elapsed * .11 + index * .7) * .18;
        particlePositions[base + 1] = (particleOrigins[base + 1] + elapsed * (.035 + (index % 5) * .013)) % 16;
      }
      particleGeometry.attributes.position.needsUpdate = true;
      leftRim.intensity = realm === 'demon' ? 0 : 110 + Math.sin(elapsed * .8) * 7;
      rightRim.intensity = realm === 'angel' ? 0 : 165 + Math.sin(elapsed * 1.6) * 10;
      battleSword.rotation.y = Math.sin(elapsed * .36) * .32;
      battleSword.position.y = 3.5 + Math.sin(elapsed * .8) * .12;
      cloudMists.forEach((cloud, index) => { cloud.position.y = cloud.userData.baseY + Math.sin(elapsed * .13 + index) * .55; });
    }
    controls.update(delta);
    renderer.info.reset();
    if (quality === 'high') composer.render();
    else renderer.render(scene, camera);
    if (!ready) {
      ready = true;
      onSelect(describe(entities[0]));
      onReady(getSnapshot());
    }
    frameCount += 1;
    if (now - statsAt >= 1000) {
      const measurementDuration = now - statsAt;
      fps = Math.round(frameCount * 1000 / measurementDuration);
      frameCount = 0;
      statsAt = now;
      // Keep the geometry and joint animation intact when fill rate is the
      // bottleneck. Changes are delayed so brief loading stalls do not count.
      if (measurementDuration < 1800 && ready) {
        slowFrameWindows = fps < 46 ? slowFrameWindows + 1 : 0;
        fastFrameWindows = fps > 57 ? fastFrameWindows + 1 : 0;
        const ceiling = Math.min(devicePixelRatio || 1, quality === 'high' ? (mobile ? 1 : 1.5) : (mobile ? .85 : 1));
        const current = renderer.getPixelRatio();
        const next = slowFrameWindows >= 2 ? Math.max(mobile ? .7 : .85, current - .15)
          : fastFrameWindows >= 8 ? Math.min(ceiling, current + .1) : current;
        if (Math.abs(next - current) > .01) {
          renderer.setPixelRatio(next);
          composer.setPixelRatio(next);
          slowFrameWindows = fastFrameWindows = 0;
          resize();
        }
      }
      onStats(getSnapshot());
    }
    raf = requestAnimationFrame(render);
  }
  function visibilityChange() {
    if (document.hidden) cancelAnimationFrame(raf);
    else {
      lastTime = performance.now();
      statsAt = lastTime;
      frameCount = 0;
      raf = requestAnimationFrame(render);
    }
  }
  document.addEventListener('visibilitychange', visibilityChange);
  lastTime = performance.now();
  statsAt = lastTime;
  raf = requestAnimationFrame(render);

  return {
    setRealm: changeRealm,
    focusEntity(index) { selectEntity(index, true); },
    setModelStyle,
    flipSelected,
    startBattle,
    endBattle,
    getBattleActors() { return battleActors.length ? battleActors.map((actor) => actor.group) : [heroes.angel, heroes.demon]; },
    setAutoRotate(value) { controls.autoRotate = Boolean(value) && !paused; },
    setPaused(value) {
      paused = Boolean(value);
      if (paused) controls.autoRotate = false;
    },
    setQuality(value) {
      quality = value === 'high' ? 'high' : 'balanced';
      slowFrameWindows = fastFrameWindows = 0;
      bloom.enabled = quality === 'high';
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality === 'high' ? (mobile ? 1 : 1.5) : (mobile ? .85 : 1)));
      composer.setPixelRatio(renderer.getPixelRatio());
      resize();
    },
    resetView() { changeRealm('all'); },
    zoom(direction) {
      const offset = camera.position.clone().sub(controls.target);
      const amount = direction === 'in' || Number(direction) > 0 ? .79 : 1.26;
      const length = THREE.MathUtils.clamp(offset.length() * amount, controls.minDistance, controls.maxDistance);
      offset.setLength(length);
      transitionCamera(controls.target.clone().add(offset), controls.target, 400);
    },
    rotate(direction) {
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      if (direction === 'up') spherical.phi = Math.max(.08, spherical.phi - .22);
      else if (direction === 'down') spherical.phi = Math.min(controls.maxPolarAngle, spherical.phi + .22);
      else spherical.theta += direction === 'left' || Number(direction) < 0 ? -.3 : .3;
      offset.setFromSpherical(spherical);
      transitionCamera(controls.target.clone().add(offset), controls.target, 500);
    },
    getSnapshot,
    getEntities() { return entities.map(describe); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('visibilitychange', visibilityChange);
      controls.removeEventListener('start', cancelTransition);
      controls.dispose();
      combat?.dispose();
      releaseBattleActors();
      composer.dispose();
      bloom.dispose();
      environmentTarget.dispose();
      batchedMeshes.forEach((item) => item.dispose());
      ownedGeometries.forEach((item) => item.dispose());
      ownedMaterials.forEach((item) => item.dispose());
      ownedTextures.forEach((item) => item.dispose());
      ownedSkeletons.forEach((item) => item.dispose());
      renderer.dispose();
    },
  };
}
