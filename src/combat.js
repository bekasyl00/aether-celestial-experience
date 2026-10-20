import * as THREE from 'three';
import { createFighterPhysics, resolveFighterContact } from './physics.js';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const SIDES = ['angel', 'demon'];
const OTHER = { angel: 'demon', demon: 'angel' };
const COLORS = { angel: new THREE.Color('#ffda88'), demon: new THREE.Color('#ff5538') };
const MOVES = ['lunge', 'skyfall', 'sweep', 'spiral', 'feint', 'crosscut'];
const MOVE_LABELS = {
  angel: ['Солнечный выпад', 'Небесный удар', 'Золотой полумесяц', 'Спираль серафима', 'Шаг миража', 'Рассечение рассвета'],
  demon: ['Выпад бездны', 'Падение пепла', 'Багровый полумесяц', 'Адская спираль', 'Шаг тени', 'Рассечение разлома'],
};

function hashSeed(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

function seededRandom(seed) {
  let state = hashSeed(String(seed));
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function freshSeed() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    return Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('-');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

const ease = value => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

const RIG_BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'leftUpperArm', 'leftForearm', 'leftHand', 'rightUpperArm', 'rightForearm', 'rightHand',
  'leftThigh', 'leftShin', 'leftFoot', 'rightThigh', 'rightShin', 'rightFoot',
  'leftWingRoot', 'leftWingTip', 'rightWingRoot', 'rightWingTip',
];
const GUARD_POSE = {
  hips: [0, -.05, 0], spine: [.025, .04, 0], chest: [-.035, -.07, 0],
  neck: [0, .03, 0], head: [0, .04, 0],
  rightUpperArm: [-.55, -.1, .16], rightForearm: [-.72, .05, .08], rightHand: [.2, 0, -.1],
  leftUpperArm: [-.5, .16, -.32], leftForearm: [-.88, -.16, -.1], leftHand: [.15, 0, .14],
  rightThigh: [-.15, .05, .04], rightShin: [.22, 0, 0], rightFoot: [-.07, 0, 0],
  leftThigh: [.09, -.04, -.04], leftShin: [.17, 0, 0], leftFoot: [-.26, 0, 0],
  leftWingRoot: [.04, -.13, -.09], leftWingTip: [0, -.12, -.06],
  rightWingRoot: [.04, .13, .09], rightWingTip: [0, .12, .06],
};

function copyPose(source = GUARD_POSE) {
  return Object.fromEntries(RIG_BONES.map(key => [key, [...(source[key] || [0, 0, 0])]]));
}

function variantPose(overrides) {
  return { ...copyPose(), ...Object.fromEntries(Object.entries(overrides).map(([key, value]) => [key, [...value]])) };
}

// A sword swing is authored at the shoulder, elbow and wrist. Hips initiate it;
// chest follows, and the other arm balances the momentum. Each pose is an offset
// from the rig's bind pose, not a rotation of the entire statue.
const MOVE_POSES = Object.fromEntries(MOVES.map(move => {
  const overhead = move === 'skyfall';
  const thrust = move === 'lunge' || move === 'feint';
  const low = move === 'sweep';
  const turn = move === 'spiral' ? 1.22 : 1;
  const anticipation = variantPose({
    hips: [.04, -.21 * turn, -.025], spine: [-.045, -.13 * turn, -.025],
    chest: [overhead ? -.14 : -.04, -.27 * turn, -.035],
    neck: [.04, .14, 0], head: [.035, .15, .02],
    rightUpperArm: [overhead ? -2.08 : thrust ? -.78 : -1.32, -.24, overhead ? .23 : .56],
    rightForearm: [overhead ? -.55 : -1.1, -.08, .12],
    rightHand: [overhead ? .24 : .12, -.12, -.05],
    leftUpperArm: [-.25, .18, -.55], leftForearm: [-.7, -.2, -.12],
    rightThigh: [-.31, .04, .035], rightShin: [.48, 0, 0], rightFoot: [-.17, 0, 0],
    leftThigh: [.23, -.07, -.03], leftShin: [.21, 0, 0], leftFoot: [-.44, 0, 0],
    leftWingRoot: [-.08, -.33, -.2], leftWingTip: [.08, -.2, -.1],
    rightWingRoot: [-.08, .33, .2], rightWingTip: [.08, .2, .1],
  });
  const contact = variantPose({
    hips: [-.025, .16 * turn, .02], spine: [.09, .15 * turn, .015],
    chest: [overhead ? .2 : .055, thrust ? .06 : .37 * turn, low ? .1 : .03],
    neck: [-.03, -.18, 0], head: [-.025, -.15, -.02],
    rightUpperArm: [thrust ? -1.25 : low ? -.64 : -1.04, thrust ? -.05 : .2, thrust ? -.06 : -.54],
    rightForearm: [thrust ? -.08 : -.19, .12, thrust ? 0 : -.14],
    rightHand: [thrust ? 1.2 : overhead ? 1.48 : .96, .04, -.18],
    leftUpperArm: [.25, -.16, -.62], leftForearm: [-.48, .12, -.25],
    rightThigh: [-.48, .06, .03], rightShin: [.58, 0, 0], rightFoot: [-.1, 0, 0],
    leftThigh: [.36, -.07, -.025], leftShin: [.12, 0, 0], leftFoot: [-.48, 0, 0],
    leftWingRoot: [.1, -.12, -.03], leftWingTip: [-.1, -.07, -.02],
    rightWingRoot: [.1, .12, .03], rightWingTip: [-.1, .07, .02],
  });
  const follow = variantPose({
    hips: [.015, .1 * turn, .01], spine: [.045, .11, .015],
    chest: [.08, thrust ? .03 : .25 * turn, .04],
    rightUpperArm: [low ? -.42 : -.85, .18, -.36],
    rightForearm: [-.38, .08, -.11], rightHand: [.76, -.02, -.12],
    leftUpperArm: [.1, -.07, -.48], leftForearm: [-.62, -.04, -.13],
    rightThigh: [-.27, .04, .04], rightShin: [.42, 0, 0], rightFoot: [-.15, 0, 0],
    leftThigh: [.19, -.03, -.035], leftShin: [.15, 0, 0], leftFoot: [-.34, 0, 0],
  });
  return [move, [GUARD_POSE, anticipation, contact, follow, GUARD_POSE]];
}));
const POSE_TIMES = [0, .3, .55, .74, 1];

function sampleAttackPose(move, t, target) {
  const frames = MOVE_POSES[move] || MOVE_POSES.lunge;
  let segment = 0;
  while (segment < 3 && t > POSE_TIMES[segment + 1]) segment++;
  const alpha = ease((t - POSE_TIMES[segment]) / (POSE_TIMES[segment + 1] - POSE_TIMES[segment]));
  for (const key of RIG_BONES) {
    const a = frames[segment][key] || [0, 0, 0];
    const b = frames[segment + 1][key] || [0, 0, 0];
    for (let axis = 0; axis < 3; axis++) target[key][axis] = lerp(a[axis], b[axis], alpha);
  }
}

/**
 * Reproducible battle simulation. Geometry, callbacks and frame rate never affect
 * its result. A fresh seed produces new fighter stats, tactics and damage rolls;
 * either side can win. A seed can deliberately be replayed.
 */
export function generateBattle(seed = 'aether', options = {}) {
  seed = String(seed);
  const random = seededRandom(seed);
  const choose = array => array[Math.floor(random() * array.length)];
  const integer = (low, high) => low + Math.floor(random() * (high - low + 1));
  const maxRounds = clamp(Math.floor(Number(options.rounds) || 10), 8, 12);
  const stats = {};
  for (const side of SIDES) {
    stats[side] = {
      power: integer(82, 118),
      guard: integer(72, 115),
      agility: integer(75, 120),
      resolve: integer(80, 120),
    };
  }
  const hp = { angel: 100, demon: 100 };
  const rounds = [];
  const introDuration = 2.1;
  const outroDuration = 2.6;
  let elapsed = introDuration;
  let attacker = random() < .5 ? 'angel' : 'demon';
  let previousAttacker = null;
  let streak = 0;
  let winner = null;
  const appendRound = event => {
    event.index = rounds.length + 1;
    event.start = elapsed;
    event.duration = Number((1.04 + random() * .23).toFixed(3));
    event.impact = .55;
    event.flourish = random();
    event.hpAfter = { ...hp };
    event.text = `${event.label} · ${event.response === 'dodge' ? 'уклонение' : event.response === 'parry' ? 'парирование' : event.response === 'guard' ? 'удар в защиту' : event.critical ? 'критический удар' : 'попадание'}`;
    if (event.finisher) event.text = winner === 'angel' ? 'Приговор рассвета · победа света' : 'Приговор бездны · победа тьмы';
    rounds.push(event);
    elapsed += event.duration;
  };

  for (let index = 0; index < maxRounds - 1; index++) {
    // Short combos are possible, but three unanswered turns cannot monopolize a duel.
    if (index > 0 && (random() < .67 || streak >= 2)) attacker = OTHER[attacker];
    streak = attacker === previousAttacker ? streak + 1 : 1;
    previousAttacker = attacker;
    const defender = OTHER[attacker];
    const move = choose(MOVES);
    const roll = random();
    const dodgeChance = .09 + (stats[defender].agility - 75) / 900;
    const parryChance = .09 + (stats[defender].guard - 72) / 1000;
    let response = roll < dodgeChance ? 'dodge' : roll < dodgeChance + parryChance ? 'parry' : roll < .43 ? 'guard' : 'hit';
    const critical = response === 'hit' && random() < .24;
    let damage = Math.round(integer(10, 21) * stats[attacker].power / 100 * (critical ? 1.55 : 1));
    let counterDamage = 0;
    if (response === 'dodge') damage = 0;
    if (response === 'guard') damage = Math.max(3, Math.round(damage * .37 * 100 / stats[defender].guard));
    if (response === 'parry') {
      damage = 0;
      counterDamage = integer(4, 9);
    }
    hp[defender] = Math.max(0, hp[defender] - damage);
    hp[attacker] = Math.max(0, hp[attacker] - counterDamage);
    const finisher = hp[defender] === 0 || hp[attacker] === 0;
    if (finisher) winner = hp[defender] === 0 ? attacker : defender;
    appendRound({
      attacker, defender, move, label: MOVE_LABELS[attacker][MOVES.indexOf(move)],
      response, critical, damage, counterDamage, finisher,
    });
    if (winner) break;
  }

  if (!winner) {
    // A decisive final exchange resolves close fights. Remaining health matters,
    // but a wounded fighter can still win with resolve and a stronger final roll.
    const score = side => hp[side] * .58 + stats[side].resolve * .13 + random() * 40;
    winner = score('angel') > score('demon') ? 'angel' : 'demon';
    const loser = OTHER[winner];
    const damage = hp[loser];
    hp[loser] = 0;
    appendRound({
      attacker: winner, defender: loser, move: choose(['skyfall', 'spiral', 'crosscut']),
      label: winner === 'angel' ? 'Приговор рассвета' : 'Приговор бездны',
      response: 'hit', critical: true, damage, counterDamage: 0, finisher: true,
    });
  }

  return {
    id: `DUEL-${hashSeed(seed).toString(16).padStart(8, '0').toUpperCase()}`,
    seed,
    stats,
    rounds,
    winner,
    loser: OTHER[winner],
    outcome: winner === 'angel' ? 'dawn' : 'abyss',
    finalHP: { ...hp },
    introDuration,
    outroDuration: Math.max(outroDuration, 14 - elapsed),
    combatEnd: elapsed,
    duration: Math.max(14, elapsed + outroDuration),
    signature: rounds.map(r => `${r.attacker[0]}:${r.move}:${r.response}:${r.damage}:${r.counterDamage}`).join('|'),
  };
}

/**
 * Original articulated combat: local skeletal poses, hand-bound weapons,
 * continuous root physics and pooled volumetric effects. Caller owns framing.
 * `start({ angel, demon, seed })` permits a new pair of generated fighters.
 */
export function createCombat({
  scene,
  angel: defaultAngel,
  demon: defaultDemon,
  reducedMotion = false,
  onUpdate = () => {},
  onComplete = () => {},
} = {}) {
  if (!scene?.add) throw new Error('Combat requires a Three.js scene.');
  const effects = new THREE.Group();
  effects.name = 'aether-duel-effects';
  effects.visible = false;
  scene.add(effects);
  const geometries = new Set();
  const materials = new Set();
  const geometry = value => { geometries.add(value); return value; };
  const material = value => { materials.add(value); return value; };
  const glowMaterial = (color, opacity = 1) => material(new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  let disposed = false;
  let battle = null;
  let actors = null;
  let originals = null;
  let bodies = null;
  let poseState = null;
  let poseTargets = null;
  let rigInfo = null;
  let lastDelta = 1 / 60;
  let elapsed = 0;
  let status = 'idle';
  let lastImpact = -1;
  let lastPublished = -1;
  let visualRandom = seededRandom('effects');
  let names = { angel: 'Ангел', demon: 'Демон' };
  const history = [];
  let state = idleState();
  const target = new THREE.Vector3();
  const aimOrigin = new THREE.Vector3();
  const aimTarget = new THREE.Vector3();
  const aimDirection = new THREE.Vector3();
  const forwardAxis = new THREE.Vector3(0, 0, 1);
  const aimWorldQuaternion = new THREE.Quaternion();
  const aimParentQuaternion = new THREE.Quaternion();

  function idleState() {
    return {
      status: 'idle', id: null, seed: null, elapsed: 0, progress: 0,
      angelHP: 100, demonHP: 100, hp: { angel: 100, demon: 100 },
      round: 0, totalRounds: 0, eventText: 'Поединок ожидает.', winner: null, history: [...history],
    };
  }

  function makeSword(side) {
    const group = new THREE.Group();
    group.name = `${side}-astral-blade`;
    const gold = side === 'angel';
    const blade = new THREE.Shape();
    blade.moveTo(-.095, 0);
    if (gold) {
      blade.lineTo(-.1, 1.65);
      blade.lineTo(0, 2.15);
      blade.lineTo(.1, 1.65);
    } else {
      blade.lineTo(-.17, .42);
      blade.lineTo(-.09, .56);
      blade.lineTo(-.19, .98);
      blade.lineTo(-.07, 1.08);
      blade.lineTo(-.11, 1.62);
      blade.lineTo(0, 2.15);
      blade.lineTo(.16, 1.5);
      blade.lineTo(.11, .38);
    }
    blade.lineTo(.095, 0);
    blade.closePath();
    const bladeGeometry = geometry(new THREE.ExtrudeGeometry(blade, {
      depth: .075, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .025, bevelThickness: .025,
    }));
    bladeGeometry.translate(0, 0, -.0375);
    const steel = material(new THREE.MeshStandardMaterial({
      color: gold ? '#fff0ce' : '#261718', metalness: .8, roughness: .22,
      emissive: COLORS[side], emissiveIntensity: gold ? .18 : .3,
    }));
    group.add(new THREE.Mesh(bladeGeometry, steel));
    const filament = new THREE.Mesh(geometry(new THREE.CylinderGeometry(.016, .016, 1.98, 6)), glowMaterial(COLORS[side], .85));
    filament.position.set(0, 1.04, .08);
    group.add(filament);
    const cross = new THREE.Mesh(geometry(new THREE.BoxGeometry(.85, .1, .15)), steel);
    cross.position.y = -.04;
    group.add(cross);
    const handle = new THREE.Mesh(geometry(new THREE.CylinderGeometry(.065, .055, .45, 10)), steel);
    handle.position.y = -.27;
    group.add(handle);
    const jewel = new THREE.Mesh(geometry(new THREE.OctahedronGeometry(.13, 0)), glowMaterial(COLORS[side], .8));
    jewel.position.y = -.54;
    group.add(jewel);
    effects.add(group);
    return group;
  }
  const swords = { angel: makeSword('angel'), demon: makeSword('demon') };

  // Every trail geometry is built once. Impact events reuse a fixed mesh pool.
  const arcPoints = [];
  for (let i = 0; i <= 36; i++) {
    const a = -.95 + i / 36 * 2.45;
    arcPoints.push(new THREE.Vector3(Math.cos(a) * 1.35, Math.sin(a) * 1.35, Math.sin(i / 36 * Math.PI) * .17));
  }
  const arcGeometry = geometry(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPoints), 36, .025, 5, false));
  const arcs = Array.from({ length: 8 }, () => {
    const mesh = new THREE.Mesh(arcGeometry, glowMaterial('#ffffff', 0));
    mesh.visible = false;
    effects.add(mesh);
    return { mesh, age: 100, life: .6, baseScale: 1 };
  });
  let nextArc = 0;
  const waveGeometry = geometry(new THREE.TorusGeometry(1, .018, 5, 64));
  const waves = Array.from({ length: 6 }, () => {
    const mesh = new THREE.Mesh(waveGeometry, glowMaterial('#ffffff', 0));
    mesh.visible = false;
    effects.add(mesh);
    return { mesh, age: 100, life: .9, radius: 1 };
  });
  let nextWave = 0;
  const shields = {};
  for (const side of SIDES) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(geometry(new THREE.TorusGeometry(.8, .03, 6, 48)), glowMaterial(COLORS[side], .65));
    const inner = new THREE.Mesh(geometry(new THREE.TorusGeometry(.55, .014, 4, 32)), glowMaterial(COLORS[side], .45));
    const glass = new THREE.Mesh(geometry(new THREE.CircleGeometry(.79, 40)), material(new THREE.MeshBasicMaterial({
      color: COLORS[side], transparent: true, opacity: .07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    })));
    group.add(ring, inner, glass);
    group.visible = false;
    effects.add(group);
    shields[side] = group;
  }

  const particleCount = reducedMotion ? 128 : 320;
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const alphas = new Float32Array(particleCount);
  const sizes = new Float32Array(particleCount);
  const velocities = new Float32Array(particleCount * 3);
  const lives = new Float32Array(particleCount);
  const ages = new Float32Array(particleCount).fill(100);
  const particleGeometry = geometry(new THREE.BufferGeometry());
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  particleGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  particleGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
  const particleMaterial = material(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, vertexColors: true, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `
      attribute float aAlpha;
      attribute float aSize;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * 130.0 / max(1.0, -mv.z), 1.0, 12.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - .5) * 2.0;
        float glow = pow(max(0.0, 1.0 - r), 2.0);
        gl_FragColor = vec4(vColor, glow * vAlpha);
      }
    `,
  }));
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.frustumCulled = false;
  effects.add(particles);
  let nextParticle = 0;
  const floorRing = new THREE.Mesh(geometry(new THREE.TorusGeometry(3.7, .013, 5, 128)), glowMaterial('#dec8a0', .2));
  floorRing.rotation.x = Math.PI / 2;
  floorRing.position.y = .04;
  effects.add(floorRing);
  const lights = {};
  for (const side of SIDES) {
    const light = new THREE.PointLight(COLORS[side], 0, 8, 2);
    effects.add(light);
    lights[side] = light;
  }

  function capture(actor) {
    return {
      position: actor.position.clone(), quaternion: actor.quaternion.clone(), scale: actor.scale.clone(), visible: actor.visible,
      weapons: actor.rig?.defaultWeaponMeshes.map(mesh => ({ mesh, visible: mesh.visible })) || [],
      bones: actor.rig ? Object.values(actor.rig.bones).map(bone => ({
        bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(),
      })) : [],
    };
  }
  function restoreActors() {
    if (!actors || !originals) return;
    for (const side of SIDES) {
      effects.add(swords[side]);
      swords[side].visible = false;
      actors[side].position.copy(originals[side].position);
      actors[side].quaternion.copy(originals[side].quaternion);
      actors[side].scale.copy(originals[side].scale);
      actors[side].visible = originals[side].visible;
      for (const { mesh, visible } of originals[side].weapons) mesh.visible = visible;
      for (const { bone, position, quaternion } of originals[side].bones) {
        bone.position.copy(position);
        bone.quaternion.copy(quaternion);
      }
      actors[side].updateMatrixWorld(true);
      actors[side].rig?.skeleton.update();
      bodies?.[side]?.dispose();
    }
  }
  function clearEffects() {
    for (const arc of arcs) { arc.mesh.visible = false; arc.age = 100; }
    for (const wave of waves) { wave.mesh.visible = false; wave.age = 100; }
    for (const side of SIDES) { shields[side].visible = false; lights[side].intensity = 0; }
    ages.fill(100);
    alphas.fill(0);
    particleGeometry.attributes.aAlpha.needsUpdate = true;
  }
  function emitArc(side, point, angle, intensity = 1) {
    const arc = arcs[nextArc++ % arcs.length];
    arc.mesh.position.copy(point);
    arc.mesh.rotation.set(.13 * (visualRandom() - .5), .2 * (visualRandom() - .5), angle);
    arc.mesh.material.color.copy(COLORS[side]);
    arc.baseScale = intensity;
    arc.mesh.scale.setScalar(intensity);
    arc.mesh.visible = true;
    arc.life = reducedMotion ? .7 : .45 + visualRandom() * .15;
    arc.age = 0;
  }
  function emitWave(side, point, radius = 1) {
    const wave = waves[nextWave++ % waves.length];
    wave.mesh.position.copy(point);
    wave.mesh.rotation.set(.2, side === 'angel' ? -.45 : .45, 0);
    wave.mesh.material.color.copy(COLORS[side]);
    wave.mesh.visible = true;
    wave.mesh.scale.setScalar(.2);
    wave.age = 0;
    wave.life = reducedMotion ? 1.2 : .85;
    wave.radius = radius;
  }
  function burst(side, point, count, energy = 1) {
    for (let i = 0; i < count; i++) {
      const n = nextParticle++ % particleCount;
      const p = n * 3;
      const angle = visualRandom() * TAU;
      const speed = (.6 + visualRandom() * 2.7) * energy * (reducedMotion ? .4 : 1);
      positions[p] = point.x;
      positions[p + 1] = point.y;
      positions[p + 2] = point.z;
      velocities[p] = Math.cos(angle) * speed;
      velocities[p + 1] = Math.sin(angle) * speed + .8;
      velocities[p + 2] = (visualRandom() - .5) * speed;
      COLORS[side].toArray(colors, p);
      sizes[n] = .23 + visualRandom() * .38;
      lives[n] = .65 + visualRandom() * .75;
      ages[n] = 0;
      alphas[n] = .8;
    }
    particleGeometry.attributes.color.needsUpdate = true;
    particleGeometry.attributes.aSize.needsUpdate = true;
  }

  function impact(event) {
    const defender = actors[event.defender];
    const direction = event.attacker === 'angel' ? 1 : -1;
    if (rigInfo[event.attacker].boundWeapon) {
      swords[event.attacker].updateWorldMatrix(true, false);
      target.set(0, 1.72, 0);
      swords[event.attacker].localToWorld(target);
    } else {
      target.set(defender.position.x - direction * 1.1, defender.position.y + 3.05, defender.position.z + .4);
    }
    emitArc(event.attacker, target, (event.flourish - .5) * 2.4 + (direction < 0 ? Math.PI : 0), event.finisher ? 1.5 : 1);
    if (event.move === 'crosscut' || event.finisher) emitArc(event.attacker, target, Math.PI / 2 + event.flourish, event.finisher ? 1.25 : .85);
    if (event.response === 'dodge') {
      burst(event.attacker, target, reducedMotion ? 4 : 8, .55);
    } else {
      const colorSide = event.response === 'parry' ? event.defender : event.attacker;
      burst(colorSide, target, reducedMotion ? 15 : event.finisher ? 64 : event.critical ? 42 : 24, event.finisher ? 1.35 : 1);
      emitWave(colorSide, target, event.finisher ? 2.2 : event.response === 'guard' ? .9 : 1.3);
      lights[colorSide].intensity = reducedMotion ? 2 : event.finisher ? 9 : 5;
      lights[colorSide].position.copy(target);
      const struck = event.response === 'parry' ? event.attacker : event.defender;
      const force = event.response === 'guard' ? .65 : event.critical ? 2.1 : 1.35;
      bodies[struck].impulse(new THREE.Vector3(
        direction * force * (event.response === 'parry' ? -1 : 1),
        event.finisher ? .45 : .02,
        (event.flourish - .5) * .3,
      ));
    }
    if (event.response === 'parry') {
      target.x = actors[event.attacker].position.x + direction;
      emitArc(event.defender, target, -direction * .7, .8);
    }
  }

  function animateEffects(dt) {
    for (const arc of arcs) {
      if (!arc.mesh.visible) continue;
      arc.age += dt;
      const t = arc.age / arc.life;
      arc.mesh.visible = t < 1;
      arc.mesh.material.opacity = .72 * Math.pow(Math.max(0, 1 - t), 1.5);
      arc.mesh.scale.setScalar(arc.baseScale * (1 + t * .12));
      arc.mesh.rotation.z += dt * (reducedMotion ? .08 : .28);
    }
    for (const wave of waves) {
      if (!wave.mesh.visible) continue;
      wave.age += dt;
      const t = wave.age / wave.life;
      wave.mesh.visible = t < 1;
      wave.mesh.scale.setScalar(.2 + ease(t) * wave.radius);
      wave.mesh.material.opacity = .65 * Math.pow(Math.max(0, 1 - t), 1.5);
    }
    for (let n = 0; n < particleCount; n++) {
      ages[n] += dt;
      if (ages[n] >= lives[n]) { alphas[n] = 0; continue; }
      const p = n * 3;
      positions[p] += velocities[p] * dt;
      positions[p + 1] += velocities[p + 1] * dt;
      positions[p + 2] += velocities[p + 2] * dt;
      velocities[p + 1] -= dt * .9;
      alphas[n] = .8 * Math.pow(1 - ages[n] / lives[n], 1.4);
    }
    particleGeometry.attributes.position.needsUpdate = true;
    particleGeometry.attributes.aAlpha.needsUpdate = true;
    for (const side of SIDES) lights[side].intensity *= Math.exp(-dt * 5);
  }

  function stageActors(event, localProgress, dt = lastDelta) {
    const approach = ease(elapsed / battle.introDuration);
    const motion = reducedMotion ? .5 : 1;
    const t = clamp(localProgress, 0, 1);
    const pulse = event ? Math.sin(clamp((t - .08) / .85, 0, 1) * Math.PI) : 0;
    const recovery = event ? Math.sin(clamp((t - .52) / .48, 0, 1) * Math.PI) : 0;
    const outro = elapsed >= battle.combatEnd;
    const ending = outro ? ease((elapsed - battle.combatEnd) / battle.outroDuration) : 0;
    for (const side of SIDES) {
      const actor = actors[side];
      const info = rigInfo[side];
      const pose = poseTargets[side];
      const sign = side === 'angel' ? -1 : 1;
      const direction = -sign;
      const isAttacker = event?.attacker === side;
      const isDefender = event?.defender === side;
      for (const key of RIG_BONES) {
        const base = GUARD_POSE[key] || [0, 0, 0];
        for (let axis = 0; axis < 3; axis++) pose[key][axis] = base[axis];
      }
      let hipHeight = -.055;
      let locomotion = elapsed < battle.introDuration ? Math.sin(approach * Math.PI) * .95 : .12;
      const desired = info.targetPosition;
      desired.copy(originals[side].position);
      desired.x = lerp(originals[side].position.x, sign * 1.85, approach);
      desired.z = lerp(originals[side].position.z, side === 'angel' ? .12 : -.12, approach);
      let facing = direction * 1.4;
      let airborne = false;
      if (isAttacker) {
        sampleAttackPose(event.move, t, pose);
        desired.x += direction * pulse * .62 * motion;
        desired.z += (event.move === 'feint' ? Math.sin(t * TAU) * .32 : event.move === 'spiral' ? Math.sin(t * Math.PI) * .32 : 0) * motion;
        facing += direction * (event.move === 'spiral' ? Math.sin(t * Math.PI) * .3 : pulse * .08);
        airborne = event.move === 'skyfall' && t > .22 && t < .68;
        hipHeight -= Math.sin(clamp(t / .35, 0, 1) * Math.PI) * .14;
        locomotion = pulse * .75;
      }
      if (isDefender) {
        if (event.response === 'dodge') {
          const evade = Math.sin(t * Math.PI);
          desired.z -= evade * .7 * motion;
          desired.x += direction * -.21 * evade * motion;
          pose.hips[2] += evade * .11;
          pose.spine[0] += evade * .24;
          pose.chest[0] += evade * .17;
          pose.chest[1] -= evade * .3;
          pose.head[0] -= evade * .15;
          pose.rightThigh[0] -= evade * .26;
          pose.leftThigh[0] -= evade * .26;
          pose.rightShin[0] += evade * .57;
          pose.leftShin[0] += evade * .57;
          pose.rightFoot[0] -= evade * .31;
          pose.leftFoot[0] -= evade * .31;
          hipHeight -= evade * .34;
          locomotion = .7 * evade;
        } else if (event.response === 'parry' || event.response === 'guard') {
          const catchWeight = Math.sin(clamp((t - .12) / .78, 0, 1) * Math.PI);
          pose.rightUpperArm[0] -= catchWeight * .58;
          pose.rightUpperArm[2] -= catchWeight * .42;
          pose.rightForearm[0] -= catchWeight * .24;
          pose.rightHand[0] += catchWeight * .45;
          pose.rightHand[2] -= catchWeight * .35;
          pose.leftUpperArm[0] -= catchWeight * .33;
          pose.leftForearm[0] -= catchWeight * .25;
          pose.chest[1] += catchWeight * .2;
          pose.spine[0] += catchWeight * .065;
          pose.head[1] -= catchWeight * .13;
          pose.rightShin[0] += catchWeight * .16;
          pose.leftShin[0] += catchWeight * .16;
          hipHeight -= catchWeight * .08;
          if (event.response === 'parry') {
            pose.rightUpperArm[1] += recovery * .4;
            pose.rightForearm[0] += recovery * .5;
            pose.rightHand[0] += recovery * .5;
          }
        } else {
          pose.hips[0] -= recovery * .045;
          pose.chest[0] -= recovery * (event.critical ? .26 : .16);
          pose.chest[1] -= recovery * .2;
          pose.head[0] -= recovery * .12;
          pose.rightForearm[0] += recovery * .14;
          pose.leftUpperArm[2] -= recovery * .18;
          pose.rightShin[0] += recovery * .2;
          hipHeight -= recovery * .09;
        }
      }
      // Footfalls alternate at a human-readable cadence. Knee flexion occurs on
      // the lifted leg; ankles oppose the combined thigh/knee angle.
      const walk = Math.sin(elapsed * 7.2 + (side === 'angel' ? 0 : .6));
      const stride = locomotion * .2 * motion;
      if (!outro) {
        pose.rightThigh[0] += walk * stride;
        pose.leftThigh[0] -= walk * stride;
        pose.rightShin[0] += Math.max(0, -walk) * stride * 1.6;
        pose.leftShin[0] += Math.max(0, walk) * stride * 1.6;
        pose.rightFoot[0] -= walk * stride + Math.max(0, -walk) * stride * 1.25;
        pose.leftFoot[0] += walk * stride - Math.max(0, walk) * stride * 1.25;
        pose.hips[2] += Math.sin(elapsed * 7.2) * locomotion * .024;
        pose.spine[2] -= Math.sin(elapsed * 7.2) * locomotion * .019;
      }
      if (outro) {
        locomotion = 0;
        if (side === battle.loser) {
          // One knee yields while the other foot stays in front. The root remains
          // on its physical floor; the pelvis descends inside the skeleton.
          pose.hips[0] = .09 * ending;
          pose.spine[0] = .2 * ending;
          pose.chest[0] = .35 * ending;
          pose.neck[0] = .15 * ending;
          pose.head[0] = .28 * ending;
          pose.rightThigh[0] = lerp(-.15, -1.04, ending);
          pose.rightShin[0] = lerp(.22, 1.13, ending);
          pose.rightFoot[0] = -.12;
          pose.leftThigh[0] = lerp(.09, .04, ending);
          pose.leftShin[0] = lerp(.17, 1.42, ending);
          pose.leftFoot[0] = lerp(-.26, -.52, ending);
          pose.rightUpperArm[0] = lerp(-.55, -.2, ending);
          pose.rightForearm[0] = lerp(-.72, -.18, ending);
          pose.rightHand[0] = lerp(.2, 2.05, ending);
          pose.leftUpperArm[0] = lerp(-.5, -.7, ending);
          pose.leftForearm[0] = lerp(-.88, -.1, ending);
          hipHeight = lerp(-.055, -1.0, ending);
          pose.leftWingRoot[1] = -.5 * ending;
          pose.rightWingRoot[1] = .5 * ending;
          pose.leftWingTip[2] = -.23 * ending;
          pose.rightWingTip[2] = .23 * ending;
        } else {
          pose.rightUpperArm[0] = lerp(-.55, -2.48, ending);
          pose.rightUpperArm[2] = lerp(.16, .25, ending);
          pose.rightForearm[0] = lerp(-.72, -.12, ending);
          pose.rightHand[0] = lerp(.2, 1.03, ending);
          pose.chest[0] = lerp(-.035, -.08, ending);
          pose.head[0] = -.1 * ending;
          pose.leftUpperArm[2] = lerp(-.32, -.65, ending);
          pose.leftWingRoot[1] = -.23 * ending;
          pose.rightWingRoot[1] = .23 * ending;
        }
      }
      const physical = bodies[side].step(dt, {
        targetPosition: desired, targetYaw: lerp(info.originalYaw, facing, approach),
        locomotion, airborne, jumpHeight: event?.finisher ? .72 : .54,
      });
      info.physics = physical;
      const localForwardLean = physical.leanZ * direction;
      pose.spine[0] += localForwardLean * .6;
      pose.chest[0] += localForwardLean * .4;
      pose.spine[2] += physical.leanX * .35;
      pose.head[0] -= localForwardLean * .3;
      pose.leftShin[0] += physical.compression * 1.5;
      pose.rightShin[0] += physical.compression * 1.5;
      pose.leftThigh[0] -= physical.compression * .65;
      pose.rightThigh[0] -= physical.compression * .65;
      pose.leftWingRoot[0] += physical.wingLeft * .5;
      pose.rightWingRoot[0] += physical.wingRight * .5;
      pose.leftWingTip[1] += physical.wingLeft * .8;
      pose.rightWingTip[1] += physical.wingRight * .8;
      hipHeight -= physical.compression * .6;
      const breath = Math.sin(elapsed * 2.3 + info.phase) * .012;
      pose.chest[0] += breath;
      pose.leftWingTip[2] += breath * 1.6;
      pose.rightWingTip[2] -= breath * 1.6;
      const smoothing = 1 - Math.exp(-dt * (reducedMotion ? 10 : 19));
      let activeJoints = 0;
      for (const key of RIG_BONES) {
        let movement = 0;
        for (let axis = 0; axis < 3; axis++) {
          const previous = poseState[side][key][axis];
          const authored = pose[key][axis] * (reducedMotion ? .72 : 1);
          poseState[side][key][axis] = lerp(previous, authored, smoothing);
          movement += Math.abs(poseState[side][key][axis] - previous);
        }
        info.jointTravel[key] += movement;
        if (movement > .0002) activeJoints++;
      }
      info.activeJoints = activeJoints;
      info.hipOffset = lerp(info.hipOffset, hipHeight, smoothing);
      if (actor.rig) {
        actor.rig.pose(poseState[side]);
        actor.rig.pose({ hips: { position: [0, info.hipOffset, 0] } });
      }
      swords[side].visible = true;
      // Supported non-rig callers receive a hand-height fallback, but the actual
      // experience supplies SkinnedMesh fighters and uses the bound grip.
      if (!info.boundWeapon) {
        swords[side].position.set(actor.position.x + direction * .8, actor.position.y + 3, actor.position.z + .4);
        swords[side].rotation.set(.1, 0, -direction * .3);
      }
      const shield = shields[side];
      shield.visible = isDefender && (event.response === 'guard' || event.response === 'parry') && t > .25 && t < .8;
      if (shield.visible) {
        if (actor.rig?.bones.leftHand) actor.rig.bones.leftHand.getWorldPosition(shield.position);
        else shield.position.set(actor.position.x, actor.position.y + 3.1, actor.position.z);
        shield.position.x += direction * .28;
        shield.rotation.set(0, direction * .75, elapsed * .08);
        shield.scale.setScalar(.62 + pulse * .12);
      }
    }
    resolveFighterContact(bodies.angel, bodies.demon, 1.35);
    // The hand remains physically part of the arm. During the contact window its
    // wrist aims the blade toward the opponent instead of slashing empty space.
    // Anticipation and follow-through retain their authored shoulder/elbow arcs.
    if (event && actors[event.attacker].rig?.bones.rightHand) {
      const actor = actors[event.attacker];
      const opponent = actors[event.defender];
      const hand = actor.rig.bones.rightHand;
      const contactWeight = ease((t - .31) / .18) * (1 - ease((t - .64) / .19));
      if (contactWeight > 0) {
        hand.getWorldPosition(aimOrigin);
        if (opponent.rig?.bones.chest) opponent.rig.bones.chest.getWorldPosition(aimTarget);
        else aimTarget.set(opponent.position.x, opponent.position.y + 3.8, opponent.position.z);
        aimTarget.y -= .15;
        aimDirection.subVectors(aimTarget, aimOrigin).normalize();
        aimWorldQuaternion.setFromUnitVectors(forwardAxis, aimDirection);
        hand.parent.getWorldQuaternion(aimParentQuaternion).invert();
        aimWorldQuaternion.premultiply(aimParentQuaternion);
        hand.quaternion.slerp(aimWorldQuaternion, contactWeight);
        actor.updateMatrixWorld(true);
        actor.rig.skeleton.update();
      }
    }
    if (outro) {
      floorRing.material.color.copy(COLORS[battle.winner]);
      floorRing.material.opacity = .22 + Math.sin(ending * Math.PI) * .13;
    }
  }

  function publish(force = false) {
    if (!battle || (!force && elapsed - lastPublished < .07)) return;
    lastPublished = elapsed;
    let current = null;
    let hp = { angel: 100, demon: 100 };
    for (const round of battle.rounds) {
      if (elapsed >= round.start) current = round;
      if (elapsed >= round.start + round.duration * round.impact) hp = round.hpAfter;
    }
    state = {
      status, id: battle.id, seed: battle.seed, elapsed: Number(elapsed.toFixed(3)),
      duration: battle.duration, progress: clamp(elapsed / battle.duration, 0, 1),
      angelHP: hp.angel, demonHP: hp.demon, hp: { ...hp },
      angelName: names.angel, demonName: names.demon,
      round: current?.index || 0, totalRounds: battle.rounds.length,
      eventText: elapsed < battle.introDuration ? 'Два мира сходятся в поединке.' : current?.text || 'Поединок начинается.',
      event: current ? { ...current, hpAfter: { ...current.hpAfter } } : null,
      signature: battle.signature,
      winner: status === 'finished' ? battle.winner : null,
      outcome: status === 'finished' ? battle.outcome : null,
      stats: battle.stats,
      diagnostics: Object.fromEntries(SIDES.map(side => [side, {
        articulated: Boolean(actors[side].rig),
        boneCount: actors[side].rig ? Object.keys(actors[side].rig.bones).length : 0,
        activeJoints: rigInfo[side].activeJoints,
        jointTravel: { ...rigInfo[side].jointTravel },
        weaponAttached: rigInfo[side].boundWeapon,
        physics: { ...rigInfo[side].physics },
      }])),
      history: history.map(entry => ({ ...entry })),
    };
    onUpdate(getState());
  }

  function getState() {
    return {
      ...state, hp: { ...state.hp },
      stats: state.stats ? { angel: { ...state.stats.angel }, demon: { ...state.stats.demon } } : undefined,
      event: state.event ? { ...state.event, hpAfter: { ...state.event.hpAfter } } : null,
      history: history.map(entry => ({ ...entry })),
      diagnostics: state.diagnostics ? Object.fromEntries(SIDES.map(side => [side, {
        ...state.diagnostics[side],
        jointTravel: { ...state.diagnostics[side].jointTravel },
        physics: { ...state.diagnostics[side].physics },
      }])) : undefined,
    };
  }

  function start(input = {}) {
    if (disposed || status === 'fighting') return false;
    const options = typeof input === 'string' || typeof input === 'number' ? { seed: String(input) } : (input || {});
    const nextActors = { angel: options.angel || defaultAngel, demon: options.demon || defaultDemon };
    if (!nextActors.angel?.isObject3D || !nextActors.demon?.isObject3D || nextActors.angel === nextActors.demon) {
      throw new Error('Combat needs two distinct Three.js fighter objects.');
    }
    restoreActors();
    clearEffects();
    actors = nextActors;
    originals = { angel: capture(actors.angel), demon: capture(actors.demon) };
    names = {
      angel: options.angelName || actors.angel.userData?.name || 'Ангел',
      demon: options.demonName || actors.demon.userData?.name || 'Демон',
    };
    battle = generateBattle(options.seed ?? freshSeed(), options);
    visualRandom = seededRandom(`${battle.seed}:visuals`);
    bodies = {};
    rigInfo = {};
    poseState = {};
    poseTargets = {};
    for (const side of SIDES) {
      const actor = actors[side];
      bodies[side] = createFighterPhysics(actor, { groundY: actor.position.y, mass: side === 'angel' ? 1 : 1.15, reducedMotion });
      poseState[side] = copyPose({});
      poseTargets[side] = copyPose();
      rigInfo[side] = {
        targetPosition: actor.position.clone(), originalYaw: actor.rotation.y,
        phase: visualRandom() * TAU, hipOffset: 0, activeJoints: 0,
        jointTravel: Object.fromEntries(RIG_BONES.map(key => [key, 0])),
        boundWeapon: Boolean(actor.rig?.weaponGrip), physics: bodies[side].getState(),
      };
      if (actor.rig?.weaponGrip) {
        actor.rig.setDefaultWeaponVisible(false);
        actor.rig.weaponGrip.add(swords[side]);
        swords[side].position.set(0, .1, .2);
        swords[side].rotation.set(Math.PI / 2, 0, 0);
        swords[side].scale.setScalar(1);
      }
    }
    elapsed = 0;
    lastImpact = -1;
    lastPublished = -1;
    lastDelta = 1 / 60;
    status = 'fighting';
    effects.visible = true;
    floorRing.material.color.set('#dec8a0');
    floorRing.material.opacity = .2;
    stageActors(null, 0, 0);
    publish(true);
    return getState();
  }

  function update(delta) {
    if (disposed || !battle || status === 'idle') return;
    const dt = Number.isFinite(delta) ? clamp(delta, 0, .1) : 0;
    lastDelta = dt;
    animateEffects(dt);
    if (status !== 'fighting') {
      stageActors(null, 0, dt);
      return;
    }
    elapsed = Math.min(battle.duration, elapsed + dt);
    const current = battle.rounds.find(round => elapsed >= round.start && elapsed < round.start + round.duration);
    stageActors(current, current ? (elapsed - current.start) / current.duration : 0, dt);
    for (let i = lastImpact + 1; i < battle.rounds.length; i++) {
      const round = battle.rounds[i];
      if (elapsed < round.start + round.duration * round.impact) break;
      impact(round);
      lastImpact = i;
    }
    if (elapsed >= battle.duration) {
      status = 'finished';
      const record = {
        id: battle.id, seed: battle.seed, winner: battle.winner, outcome: battle.outcome,
        rounds: battle.rounds.length, angelHP: battle.finalHP.angel, demonHP: battle.finalHP.demon,
        signature: battle.signature,
      };
      history.unshift(record);
      history.splice(10);
      publish(true);
      onComplete({
        ...getState(),
        rounds: battle.rounds.map(round => ({ ...round, hpAfter: { ...round.hpAfter } })),
        signature: battle.signature,
      });
    } else {
      publish();
    }
  }

  function cancel() {
    if (disposed) return;
    restoreActors();
    clearEffects();
    effects.visible = false;
    battle = null;
    actors = null;
    originals = null;
    bodies = null;
    rigInfo = null;
    poseState = null;
    poseTargets = null;
    elapsed = 0;
    status = 'idle';
    state = idleState();
    onUpdate(getState());
  }

  function dispose() {
    if (disposed) return;
    cancel();
    disposed = true;
    scene.remove(effects);
    for (const resource of geometries) resource.dispose();
    for (const resource of materials) resource.dispose();
  }

  return { start, update, cancel, reset: cancel, dispose, getState };
}
