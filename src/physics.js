import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * A fixed-step, force-driven controller for a procedural humanoid.
 * Choreography supplies a destination; springs, momentum, gravity and floor
 * impulses determine the rendered root. Secondary springs drive balance,
 * landing compression and wing follow-through.
 */
export function createFighterPhysics(group, {
  groundY = group.position.y,
  mass = 1,
  reducedMotion = false,
} = {}) {
  const position = group.position.clone();
  const velocity = new THREE.Vector3();
  const desired = position.clone();
  const previousDesired = desired.clone();
  const desiredVelocity = new THREE.Vector3();
  const previousDesiredVelocity = new THREE.Vector3();
  const acceleration = new THREE.Vector3();
  const secondary = {
    leanX: { x: 0, v: 0 }, leanZ: { x: 0, v: 0 },
    compression: { x: 0, v: 0 },
    wingLeft: { x: 0, v: 0 }, wingRight: { x: 0, v: 0 },
  };
  const motion = reducedMotion ? .35 : 1;
  const bodyMass = clamp(mass, .6, 2);
  const gravity = 23;
  let yaw = group.rotation.y;
  let angularVelocity = 0;
  let ground = groundY;
  let grounded = true;
  let wasAirborne = false;
  let contacts = 0;
  let impulseCount = 0;
  let elapsed = 0;
  let disposed = false;

  function spring(s, target, stiffness, damping, dt, min, max) {
    s.v += ((target - s.x) * stiffness - s.v * damping) * dt;
    s.x = clamp(s.x + s.v * dt, min, max);
  }

  function step(delta, {
    targetPosition = group.position,
    targetYaw = group.rotation.y,
    locomotion = 0,
    airborne = false,
    jumpHeight = .6,
  } = {}) {
    if (disposed) return getState();
    const dt = Number.isFinite(delta) ? clamp(delta, 0, .1) : 0;
    if (dt <= 0) return getState();
    desired.copy(targetPosition);
    if (![desired.x, desired.y, desired.z, targetYaw].every(Number.isFinite)) return getState();
    desiredVelocity.copy(desired).sub(previousDesired).divideScalar(dt).clampLength(0, 10);
    acceleration.copy(desiredVelocity).sub(previousDesiredVelocity).divideScalar(dt).clampLength(0, 28);
    previousDesired.copy(desired);
    previousDesiredVelocity.copy(desiredVelocity);
    if (airborne && !wasAirborne && grounded) {
      velocity.y = Math.sqrt(2 * gravity * clamp(jumpHeight, .08, 1.5) * motion);
      grounded = false;
    }
    wasAirborne = airborne;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      elapsed += h;
      // Critically damped horizontal tracking retains physical hit impulses.
      velocity.x += ((desired.x - position.x) * 115 / bodyMass - velocity.x * 20 / bodyMass) * h;
      velocity.z += ((desired.z - position.z) * 115 / bodyMass - velocity.z * 20 / bodyMass) * h;
      position.x += velocity.x * h;
      position.z += velocity.z * h;
      if (!grounded || velocity.y > 0) {
        velocity.y -= gravity * h;
        position.y += velocity.y * h;
        if (position.y <= ground) {
          const impactSpeed = Math.max(0, -velocity.y);
          position.y = ground;
          velocity.y = 0;
          grounded = true;
          contacts++;
          secondary.compression.v += Math.min(2.2, impactSpeed * .22) * motion;
          secondary.wingLeft.v -= impactSpeed * .09 * motion;
          secondary.wingRight.v += impactSpeed * .09 * motion;
        }
      } else {
        position.y = ground;
        velocity.y = 0;
      }
      const yawError = wrap(targetYaw - yaw);
      angularVelocity += (yawError * 95 - angularVelocity * 19) * h;
      yaw += angularVelocity * h;
      const gait = Math.sin(elapsed * 8) * clamp(locomotion, 0, 1);
      const leanForward = clamp(-acceleration.z * .005 - velocity.z * .012, -.18, .18) * motion;
      const leanSide = clamp(acceleration.x * .006 + velocity.x * .014, -.2, .2) * motion;
      spring(secondary.leanX, leanForward, 70, 12, h, -.26, .26);
      spring(secondary.leanZ, leanSide, 65, 11, h, -.26, .26);
      spring(secondary.compression, grounded ? Math.abs(gait) * .025 : 0, 110, 14, h, 0, .3);
      const wingForce = (velocity.y * -.024 + acceleration.z * .009) * motion;
      spring(secondary.wingLeft, wingForce - angularVelocity * .045, 35, 6.8, h, -.45, .45);
      spring(secondary.wingRight, -wingForce - angularVelocity * .045, 37, 7.2, h, -.45, .45);
    }
    group.position.copy(position);
    group.rotation.y = yaw;
    return getState();
  }

  function impulse(vector) {
    if (disposed) return;
    const force = vector.clone().clampLength(0, 7).multiplyScalar(motion / bodyMass);
    velocity.add(force);
    if (force.y > .05) grounded = false;
    secondary.leanZ.v += clamp(force.x * .19, -1.1, 1.1);
    secondary.leanX.v -= clamp(force.z * .17, -1.1, 1.1);
    secondary.wingLeft.v += force.x * .1;
    secondary.wingRight.v += force.x * .1;
    impulseCount++;
  }

  function reset(nextPosition = group.position, nextYaw = group.rotation.y) {
    position.copy(nextPosition);
    ground = nextPosition.y;
    desired.copy(position);
    previousDesired.copy(position);
    velocity.set(0, 0, 0);
    desiredVelocity.set(0, 0, 0);
    previousDesiredVelocity.set(0, 0, 0);
    acceleration.set(0, 0, 0);
    yaw = nextYaw;
    angularVelocity = 0;
    grounded = true;
    wasAirborne = false;
    contacts = 0;
    impulseCount = 0;
    elapsed = 0;
    for (const s of Object.values(secondary)) { s.x = 0; s.v = 0; }
  }

  function getState() {
    return {
      leanX: secondary.leanX.x, leanZ: secondary.leanZ.x,
      compression: secondary.compression.x,
      wingLeft: secondary.wingLeft.x, wingRight: secondary.wingRight.x,
      grounded, contacts, impulseCount,
      position: position.toArray(), velocity: velocity.toArray(),
      verticalVelocity: velocity.y, angularVelocity,
      kineticEnergy: .5 * bodyMass * velocity.lengthSq(),
      groundY: ground, gravity,
    };
  }

  // This method is used only by the paired contact solver below.
  function separate(normal, distance) {
    position.addScaledVector(normal, distance);
    const inwardSpeed = velocity.dot(normal);
    if (inwardSpeed < 0) velocity.addScaledVector(normal, -inwardSpeed * .9);
    group.position.copy(position);
    contacts++;
  }

  return { step, impulse, reset, getState, separate, group, dispose() { disposed = true; } };
}

/** Resolve horizontal capsule overlap while allowing swords and wings to cross. */
export function resolveFighterContact(a, b, minDistance = 1.15) {
  const normal = new THREE.Vector3().subVectors(a.group.position, b.group.position);
  normal.y = 0;
  const distance = normal.length();
  if (distance >= minDistance) return false;
  if (distance < .0001) normal.set(1, 0, 0);
  else normal.divideScalar(distance);
  const penetration = (minDistance - distance) * .5;
  a.separate(normal, penetration);
  b.separate(normal.negate(), penetration);
  return true;
}
