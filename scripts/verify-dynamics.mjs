import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFighterPhysics, resolveFighterContact } from '../src/physics.js';
import { generateBattle } from '../src/combat.js';

const simulate = fps => {
  const actor = new THREE.Group();
  const physics = createFighterPhysics(actor);
  const target = new THREE.Vector3();
  let maximumHeight = 0;
  let hitDisplacement = 0;
  let secondaryMotion = 0;
  let impactApplied = false;
  for (let frame = 0; frame < fps * 6; frame++) {
    const t = frame / fps;
    if (t >= 1 && !impactApplied) {
      physics.impulse(new THREE.Vector3(3, .4, .5));
      impactApplied = true;
    }
    const state = physics.step(1 / fps, {
      targetPosition: target,
      targetYaw: .4,
      airborne: t >= .2 && t < .4,
      jumpHeight: .8,
    });
    assert.ok(actor.position.y >= -1e-9, 'feet may never penetrate the floor');
    assert.ok(state.position.every(Number.isFinite), 'physical state must remain finite');
    maximumHeight = Math.max(maximumHeight, actor.position.y);
    hitDisplacement = Math.max(hitDisplacement, Math.abs(actor.position.x));
    secondaryMotion = Math.max(secondaryMotion, Math.abs(state.wingLeft), state.compression);
  }
  const state = physics.getState();
  assert.ok(maximumHeight > .65 && maximumHeight < .9, 'jump follows bounded ballistic arc');
  assert.ok(hitDisplacement > .07, 'impact changes rendered physical position');
  assert.ok(secondaryMotion > .02, 'secondary springs visibly respond');
  assert.ok(actor.position.length() < .001, 'body settles to its target after recoil');
  assert.ok(state.grounded && state.contacts >= 1, 'landing registers a real ground contact');
  assert.ok(state.kineticEnergy < .001, 'damping dissipates energy');
  return { fps, maximumHeight, hitDisplacement, secondaryMotion, contacts: state.contacts };
};
const simulations = [30, 60, 120].map(simulate);
assert.ok(Math.max(...simulations.map(s => s.maximumHeight)) - Math.min(...simulations.map(s => s.maximumHeight)) < .04,
  'fixed integration remains consistent across frame rates');

const a = createFighterPhysics(new THREE.Group());
const b = createFighterPhysics(new THREE.Group());
assert.equal(resolveFighterContact(a, b), true);
assert.ok(a.group.position.distanceTo(b.group.position) >= 1.1499, 'capsules separate without NaNs at identical positions');

const results = new Set();
const winners = new Set();
for (let i = 0; i < 1000; i++) {
  const plan = generateBattle(`regression-${i}`);
  assert.equal(plan.signature, generateBattle(`regression-${i}`).signature, 'seed reproduces simulation');
  results.add(plan.signature);
  winners.add(plan.winner);
  assert.equal(plan.finalHP[plan.loser], 0);
  assert.ok(plan.rounds.every(round => Object.values(round.hpAfter).every(hp => hp >= 0 && hp <= 100)));
}
assert.equal(results.size, 1000, 'sampled battles have different action/damage sequences');
assert.equal(winners.size, 2, 'both factions can win');
console.log(JSON.stringify({ physics: simulations, distinctBattleSequences: results.size, winners: [...winners] }, null, 2));
