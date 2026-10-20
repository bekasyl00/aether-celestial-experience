import { test as base, expect } from '@playwright/test';

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await use(page);
    expect(errors, 'No uncaught browser errors').toEqual([]);
  },
});
const snapshot = page => page.evaluate(() => window.__AETHER__.getSnapshot());
const distance = ({ camera, target }) => Math.hypot(...camera.map((value, i) => value - target[i]));
const displacement = (before, after) => Math.hypot(...after.map((value, i) => value - before[i]));
async function visit(page) {
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-renderer', 'webgl', { timeout: 25_000 });
  await expect(page.locator('#loading-screen')).toBeHidden();
  await page.evaluate(() => document.fonts.ready);
}
async function expectNoOverflow(page) {
  const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(size.width, 'The interface must fit horizontally').toBeLessThanOrEqual(size.viewport + 1);
}
async function openCollection(page) {
  await page.locator('#collection-open').click();
  await expect(page.locator('#collection-dialog')).toBeVisible();
}

test('renders real WebGL, 1000 unique geometries, 20 archetypes, and two portals', async ({ page }) => {
  await visit(page);
  const state = await snapshot(page);
  const entities = await page.evaluate(() => window.__AETHER__.getEntities());
  expect(state.entityCount).toBe(1000);
  expect(state.uniqueDesignCount).toBe(1000);
  expect(state.collectionArchetypeCount).toBe(20);
  expect(state.portalCount).toBe(2);
  expect(entities).toHaveLength(1000);
  expect(entities.filter(entity => entity.kind === 'angel')).toHaveLength(500);
  expect(entities.filter(entity => entity.kind === 'demon')).toHaveLength(500);
  expect(new Set(entities.map(entity => entity.id)).size).toBe(1000);
  expect(entities.every(entity => entity.geometrySignature && entity.traits.length >= 3)).toBe(true);
  expect(new Set(entities.map(entity => entity.geometrySignature)).size).toBe(1000);
  expect(new Set(entities.map(entity => entity.archetype)).size).toBe(20);
  expect(state.drawCalls).toBeGreaterThan(0);
  expect(state.triangles).toBeGreaterThan(10_000);
  const gl = await page.locator('#realm-canvas').evaluate(canvas => {
    const context = canvas.getContext('webgl2');
    return { real: context instanceof WebGL2RenderingContext, lost: context.isContextLost(), width: context.drawingBufferWidth, height: context.drawingBufferHeight };
  });
  expect(gl.real).toBe(true);
  expect(gl.lost).toBe(false);
  expect(gl.width).toBeGreaterThan(0);
  expect(gl.height).toBeGreaterThan(0);
  await expectNoOverflow(page);
});

test('dragging, zoom, and keyboard controls actually move the camera', async ({ page }) => {
  await visit(page);
  const before = await snapshot(page);
  const viewport = page.viewportSize();
  const x = viewport.width * .52;
  const y = viewport.height * .43;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + Math.min(140, viewport.width * .22), y + 25, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => displacement(before.camera, (await snapshot(page)).camera)).toBeGreaterThan(.3);
  const beforeZoom = distance(await snapshot(page));
  await page.getByRole('button', { name: 'Приблизить', exact: true }).click();
  await expect.poll(async () => distance(await snapshot(page))).toBeLessThan(beforeZoom * .85);
  const closer = distance(await snapshot(page));
  await page.getByRole('button', { name: 'Отдалить', exact: true }).click();
  await expect.poll(async () => distance(await snapshot(page))).toBeGreaterThan(closer * 1.12);
  const beforeKey = (await snapshot(page)).camera;
  await page.locator('#realm-canvas').focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => displacement(beforeKey, (await snapshot(page)).camera)).toBeGreaterThan(.3);
  await expectNoOverflow(page);
});

test('realm focus buttons select each side and restore the overview', async ({ page }) => {
  await visit(page);
  for (const kind of ['angel', 'demon']) {
    await page.locator(`[data-realm="${kind}"]`).click();
    await expect(page.locator(`[data-realm="${kind}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await snapshot(page)).selected.kind).toBe(kind);
    await expect.poll(async () => (await snapshot(page)).realm).toBe(kind);
  }
  await page.getByRole('button', { name: 'Показать всю сцену' }).click();
  await expect(page.locator('[data-realm="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await snapshot(page)).realm).toBe('all');
  await expect.poll(async () => Math.abs((await snapshot(page)).target[0])).toBeLessThan(.1);
  await expectNoOverflow(page);
});

test('collection filters, searches, clears, and promotes the chosen figure', async ({ page }) => {
  await visit(page);
  const entities = await page.evaluate(() => window.__AETHER__.getEntities());
  const chosen = entities.find(entity => entity.id === 617);
  await openCollection(page);
  await expect(page.locator('.character-card')).toHaveCount(1000);
  for (const kind of ['angel', 'demon']) {
    await page.locator(`[data-filter="${kind}"]`).click();
    await expect(page.locator('.character-card')).toHaveCount(500);
    await expect(page.locator(`.character-card.${kind}`)).toHaveCount(500);
  }
  await page.locator('[data-filter="all"]').click();
  await page.getByRole('searchbox', { name: 'Найти персонажа' }).fill('aether-no-such-character-xyz');
  await expect(page.locator('.character-card')).toHaveCount(0);
  await expect(page.locator('#no-results')).toBeInViewport({ ratio: .7 });
  await expect(page.locator('#collection-result-count')).toContainText('0');
  await page.getByRole('button', { name: 'Очистить поиск' }).click();
  await expect(page.getByRole('searchbox', { name: 'Найти персонажа' })).toBeFocused();
  await expect(page.locator('.character-card')).toHaveCount(1000);
  await expect(page.locator('#no-results')).toBeHidden();
  await page.getByRole('searchbox', { name: 'Найти персонажа' }).fill(chosen.name);
  const card = page.locator(`.character-card[data-entity="${chosen.id}"]`);
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.locator('#collection-dialog')).not.toBeVisible();
  await expect(page.locator('#selected-name')).toHaveText(chosen.name);
  await expect.poll(async () => (await snapshot(page)).selectedId).toBe(chosen.id);
  const selected = (await snapshot(page)).selected;
  expect(selected.geometrySignature).toBe(chosen.geometrySignature);
  expect(selected.detailCount).toBeGreaterThan(chosen.detailCount);
  expect(selected.triangles).toBeGreaterThan(chosen.triangles);
  await expect(page.locator('#realm-canvas')).toBeFocused();
  await expectNoOverflow(page);
});

test('dialogs close and restore focus to their opener', async ({ page }) => {
  await visit(page);
  await openCollection(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#collection-dialog')).not.toBeVisible();
  await expect(page.locator('#collection-open')).toBeFocused();
  await page.getByRole('button', { name: 'О проекте и управление' }).click();
  await expect(page.locator('#info-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть информацию' }).click();
  await expect(page.locator('#info-dialog')).not.toBeVisible();
  await expect(page.locator('#info-open')).toBeFocused();
});

test('auto-rotation moves the camera and pause stops it', async ({ page }) => {
  await visit(page);
  const before = (await snapshot(page)).camera;
  await page.locator('#auto-rotate').click();
  await expect(page.locator('#auto-rotate')).toHaveAttribute('aria-pressed', 'true');
  expect((await snapshot(page)).autoRotate).toBe(true);
  await expect.poll(async () => displacement(before, (await snapshot(page)).camera)).toBeGreaterThan(.02);
  await page.getByRole('button', { name: 'Приостановить анимацию' }).click();
  await expect(page.getByRole('button', { name: 'Возобновить анимацию' })).toHaveAttribute('aria-pressed', 'true');
  expect((await snapshot(page)).paused).toBe(true);
  expect((await snapshot(page)).autoRotate).toBe(false);
  await expect(page.locator('#auto-rotate')).toHaveAttribute('aria-pressed', 'false');
  // OrbitControls may briefly coast after auto-rotation stops; verify it settles.
  await expect.poll(async () => {
    const stationary = (await snapshot(page)).camera;
    await page.waitForTimeout(250);
    return displacement(stationary, (await snapshot(page)).camera);
  }).toBeLessThan(.005);
  await page.getByRole('button', { name: 'Возобновить анимацию' }).click();
  expect((await snapshot(page)).paused).toBe(false);
});

test('audio starts only on user gesture and can be muted', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    window.__testAudioContexts = [];
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) { super(...args); window.__testAudioContexts.push(this); }
    };
  });
  await visit(page);
  expect(await page.evaluate(() => window.__testAudioContexts.length)).toBe(0);
  await page.getByRole('button', { name: 'Включить атмосферный звук' }).click();
  await expect(page.getByRole('button', { name: 'Выключить атмосферный звук' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__testAudioContexts[0].state)).toBe('running');
  await page.getByRole('button', { name: 'Выключить атмосферный звук' }).click();
  await expect(page.getByRole('button', { name: 'Включить атмосферный звук' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#status')).toHaveText('Звук выключен.');
});

test('reduced motion keeps camera controls usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await visit(page);
  await expect(page.getByRole('button', { name: 'Возобновить анимацию' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('body')).toHaveClass(/is-reduced-motion/);
  expect((await snapshot(page)).paused).toBe(true);
  expect((await snapshot(page)).autoRotate).toBe(false);
  await page.locator('[data-realm="demon"]').click();
  await expect.poll(async () => (await snapshot(page)).selected.kind).toBe('demon');
  await page.locator('#auto-rotate').click();
  expect((await snapshot(page)).paused).toBe(false);
  expect((await snapshot(page)).autoRotate).toBe(true);
});

test('WebGL failure gives an explanation and a working retry control', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (['webgl', 'webgl2', 'experimental-webgl'].includes(kind)) return null;
      return original.call(this, kind, ...args);
    };
  });
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.locator('#loading-screen')).toBeHidden();
  await expect(page.locator('#fallback-panel')).toBeVisible();
  await expect(page.locator('#fallback-panel')).toContainText('Браузер не смог включить 3D');
  await expect(page.getByRole('button', { name: 'Попробовать снова' })).toBeEnabled();
  await expect(page.locator('#collection-open')).toBeDisabled();
  await expect(page.locator('#zoom-in')).toBeDisabled();
  await expectNoOverflow(page);
});

test('archive loads both real GLB scans and returns to the procedural collection', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Large GLB assets are verified once on desktop.');
  test.setTimeout(90_000);
  const modelResponses = [];
  page.on('response', response => { if (/\/models\/(angel|guardian)\.glb(?:\?|$)/.test(response.url())) modelResponses.push(response); });
  await visit(page);
  expect(modelResponses).toHaveLength(0);
  await page.getByRole('button', { name: 'О проекте и управление' }).click();
  await page.locator('#model-style-toggle').click();
  await expect.poll(async () => (await snapshot(page)).modelStyle, { timeout: 60_000 }).toBe('scanned');
  await expect(page.locator('#info-dialog')).not.toBeVisible();
  expect(modelResponses).toHaveLength(2);
  for (const response of modelResponses) {
    expect(response.ok()).toBe(true);
    const data = await response.body();
    expect(data.subarray(0, 4).toString()).toBe('glTF');
    expect(data.length).toBeGreaterThan(1_000_000);
  }
  await page.locator('[data-realm="angel"]').click();
  await expect(page.locator('#selected-name')).toHaveText('Engel');
  expect((await snapshot(page)).selected.triangles).toBeGreaterThan(200_000);
  await page.locator('[data-realm="demon"]').click();
  await expect(page.locator('#selected-name')).toHaveText('Winged guardian');
  expect((await snapshot(page)).selected.triangles).toBeGreaterThan(140_000);
  await page.getByRole('button', { name: 'О проекте и управление' }).click();
  await page.locator('#model-style-toggle').click();
  await expect.poll(async () => (await snapshot(page)).modelStyle).toBe('sculpted');
  expect((await snapshot(page)).entityCount).toBe(1000);
  expect((await snapshot(page)).uniqueDesignCount).toBe(1000);
});

test('failed archive downloads recover without losing the procedural collection', async ({ page }) => {
  await page.route('**/models/*.glb', route => route.abort('failed'));
  await visit(page);
  await page.getByRole('button', { name: 'О проекте и управление' }).click();
  await page.locator('#model-style-toggle').click();
  await expect(page.locator('#model-style-toggle')).toBeEnabled();
  await expect(page.locator('#status')).toContainText('Не удалось загрузить 3D-сканы');
  await expect(page.locator('#model-style-toggle')).toHaveAttribute('aria-pressed', 'false');
  expect((await snapshot(page)).modelLoading).toBe(false);
  expect((await snapshot(page)).modelStyle).toBe('sculpted');
  await page.getByRole('button', { name: 'Закрыть информацию' }).click();
  await openCollection(page);
  await expect(page.locator('.character-card')).toHaveCount(1000);
  await page.keyboard.press('Escape');
  await page.locator('[data-realm="demon"]').click();
  await expect.poll(async () => (await snapshot(page)).selected.kind).toBe('demon');
});

test('portal meshes enter both worlds and the accessible world controls return', async ({ page }) => {
  await visit(page);
  for (const kind of ['angel', 'demon']) {
    await expect.poll(async () => Math.abs((await snapshot(page)).target[0])).toBeLessThan(.1);
    // Wait for the overview camera transition to finish before using projected mesh coordinates.
    await page.waitForTimeout(1400);
    const target = (await snapshot(page)).interactionTargets.find(item => item.type === 'portal' && item.id === kind);
    expect(target.visible).toBe(true);
    await page.mouse.click(target.x, target.y);
    await expect.poll(async () => (await snapshot(page)).world).toBe(kind);
    await expect(page.locator('#world-back')).toBeVisible();
    await page.locator('#world-back').click();
    await expect.poll(async () => (await snapshot(page)).world).toBe('all');
  }
  await page.locator('[data-enter-world="angel"]').click();
  await expect.poll(async () => (await snapshot(page)).world).toBe('angel');
  await page.locator('#world-back').click();
  await expect.poll(async () => (await snapshot(page)).world).toBe('all');
});

test('flip control rotates the selected 3D model', async ({ page }) => {
  await visit(page);
  const before = (await snapshot(page)).selectedQuaternion;
  await page.getByRole('button', { name: 'Перевернуть выбранную модель' }).click();
  await expect.poll(async () => displacement(before, (await snapshot(page)).selectedQuaternion)).toBeGreaterThan(.25);
  await expect.poll(async () => (await snapshot(page)).flipping).toBe(false);
});

test('the real sword starts articulated physical combat and replay creates a new sequence', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await visit(page);
  const sword = (await snapshot(page)).interactionTargets.find(item => item.type === 'sword');
  expect(sword.visible).toBe(true);
  await page.mouse.click(sword.x, sword.y);
  await expect.poll(async () => (await snapshot(page)).battle.status).toBe('fighting');
  await expect(page.locator('#battle-hud')).toBeVisible();
  await expect(page.locator('#collection-open')).toBeDisabled();
  const start = await snapshot(page);
  expect(start.battle.poseSamples).toHaveLength(2);
  await expect.poll(async () => (await snapshot(page)).armyBattle.participants).toBe(1000);
  expect(start.armyBattle.gpuJointActors).toBeGreaterThan(990);
  expect(start.armyBattle.skinnedActors).toBeGreaterThanOrEqual(2);
  expect(start.armyBattle.jointRegions).toBeGreaterThanOrEqual(18);
  const observedJointMotion = new Set();
  const limbMoved = (id, limb) => [...observedJointMotion].some(name => name.startsWith(`${id}:`) && name.includes(limb));
  await expect.poll(async () => {
    const current = await snapshot(page);
    for (const actor of current.battle.poseSamples) {
      const previous = start.battle.poseSamples.find(item => item.id === actor.id);
      for (const [name, quaternion] of Object.entries(actor.bones)) {
        if (displacement(previous.bones[name], quaternion) > .01) observedJointMotion.add(`${actor.id}:${name}`);
      }
    }
    // Independent limbs move at different phases, rather than all at once.
    return observedJointMotion.size >= 18 && current.battle.poseSamples.every(actor =>
      ['Forearm', 'Shin', 'WingRoot'].every(limb => limbMoved(actor.id, limb)));
  }, { timeout: 15_000 }).toBe(true);
  const inMotion = await snapshot(page);
  expect(inMotion.armyBattle.shaderTime).toBeGreaterThan(start.armyBattle.shaderTime);
  expect(inMotion.armyBattle.blend).toBeGreaterThan(0);
  expect(inMotion.armyBattle.minRootY).toBeGreaterThanOrEqual(.029);
  expect(inMotion.armyBattle.matrixSamples.length).toBeGreaterThanOrEqual(3);
  const movingInstances = inMotion.armyBattle.matrixSamples.filter(current => {
    const previous = start.armyBattle.matrixSamples.find(item => item.id === current.id);
    return previous && displacement(previous.position, current.position) > .02;
  });
  expect(movingInstances.length).toBeGreaterThanOrEqual(3);
  for (const side of ['angel', 'demon']) {
    const diagnostic = inMotion.battle.diagnostics[side];
    expect(diagnostic.articulated).toBe(true);
    expect(diagnostic.boneCount).toBe(24);
    expect(diagnostic.weaponAttached).toBe(true);
    const actualActor = inMotion.battle.poseSamples.find(actor => actor.id === inMotion.battle[`${side}Id`]);
    for (const limb of ['Forearm', 'Shin', 'WingRoot']) {
      expect(limbMoved(actualActor.id, limb), `${side} ${limb} should move independently`).toBe(true);
    }
    expect(diagnostic.physics.position[1]).toBeGreaterThanOrEqual(diagnostic.physics.groundY - .001);
    expect(diagnostic.physics.kineticEnergy).toBeGreaterThanOrEqual(0);
  }
  await expect.poll(async () => (await snapshot(page)).battle.status, { timeout: 60_000 }).toBe('finished');
  const first = (await snapshot(page)).battle;
  expect(first.id).toMatch(/^DUEL-/);
  expect(['angel', 'demon']).toContain(first.winner);
  expect(Math.min(first.angelHP, first.demonHP)).toBe(0);
  expect(first.round).toBeGreaterThan(1);
  const physicalImpulses = first.diagnostics.angel.physics.impulseCount + first.diagnostics.demon.physics.impulseCount;
  expect(physicalImpulses).toBeGreaterThan(0);
  for (const side of ['angel', 'demon']) {
    // The finished victory pose settles; measure travel over the fight rather
    // than demanding that every joint still move on its final frame.
    expect(Object.values(first.diagnostics[side].jointTravel).filter(travel => travel > .1).length).toBeGreaterThanOrEqual(18);
    expect(first.diagnostics[side].jointTravel.rightForearm).toBeGreaterThan(.1);
    expect(first.diagnostics[side].jointTravel.rightShin).toBeGreaterThan(.1);
    expect(first.diagnostics[side].physics.position[1]).toBeGreaterThanOrEqual(first.diagnostics[side].physics.groundY - .001);
  }
  await testInfo.attach('articulated-combat-evidence', {
    contentType: 'application/json',
    body: JSON.stringify({
      fight: first.id,
      actualChangedBones: [...observedJointMotion],
      movingInstanceIds: movingInstances.map(item => item.id),
      army: inMotion.armyBattle,
      diagnostics: first.diagnostics,
    }, null, 2),
  });
  await expect(page.locator('#battle-result')).toBeVisible();
  await expect(page.locator('#battle-replay')).toBeFocused();
  await expectNoOverflow(page);
  await page.locator('#battle-replay').click();
  await expect.poll(async () => (await snapshot(page)).battle.status).toBe('fighting');
  await expect.poll(async () => (await snapshot(page)).battle.status, { timeout: 60_000 }).toBe('finished');
  const second = (await snapshot(page)).battle;
  expect(second.id).not.toBe(first.id);
  expect(second.signature).not.toBe(first.signature);
  expect(['angel', 'demon']).toContain(second.winner);
  if (testInfo.project.name.includes('mobile')) {
    await page.locator('#battle-close').click();
  } else {
    // Changing worlds from a finished duel must also dismiss the result panel.
    await page.locator('[data-realm="demon"]').click();
    await expect.poll(async () => (await snapshot(page)).world).toBe('demon');
  }
  await expect.poll(async () => (await snapshot(page)).battle.status).toBe('idle');
  await expect(page.locator('#battle-result')).toBeHidden();
  await expect(page.locator('#collection-open')).toBeEnabled();
});
