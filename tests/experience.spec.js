import { test as base, expect } from '@playwright/test';

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await use(page);
    expect(errors, 'The experience should not throw uncaught browser errors').toEqual([]);
  },
});

async function visit(page) {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-renderer', /^(webgl|fallback)$/);
}

async function expectNoHorizontalOverflow(page) {
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(width.content, 'Content should fit the viewport horizontally').toBeLessThanOrEqual(width.viewport + 1);
}

async function pauseMotion(page) {
  const control = page.getByRole('button', { name: 'Pause ambient animation' });
  await control.click();
  await expect(page.getByRole('button', { name: 'Resume ambient animation' })).toHaveAttribute('aria-pressed', 'true');
}

test('initializes a real WebGL scene and submits geometry', async ({ page }) => {
  await page.addInitScript(() => {
    window.__webglDrawCalls = 0;
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        window.__webglDrawCalls += 1;
        return original.apply(this, args);
      };
    }
  });
  await visit(page);
  await expect(page.locator('body')).toHaveAttribute('data-renderer', 'webgl');
  await expect.poll(() => page.evaluate(() => window.__webglDrawCalls)).toBeGreaterThan(0);
  const context = await page.locator('#celestial-canvas').evaluate((canvas) => {
    const gl = canvas.getContext('webgl2');
    return {
      realContext: gl instanceof WebGL2RenderingContext,
      lost: gl.isContextLost(),
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
    };
  });
  expect(context.realContext).toBe(true);
  expect(context.lost).toBe(false);
  expect(context.width).toBeGreaterThan(0);
  expect(context.height).toBeGreaterThan(0);
  await expectNoHorizontalOverflow(page);
});

test('chapter links expose their content and update the active chapter', async ({ page }) => {
  await visit(page);
  await pauseMotion(page);
  const chapters = [
    ['Chapter 2: The ascent', '#ascent-title', '#journey'],
    ['Chapter 3: The infinite', '#infinite-title', '#paradise'],
    ['Chapter 1: The awakening', '#hero-title', '#home'],
  ];
  for (const [name, heading, hash] of chapters) {
    const link = page.getByRole('link', { name, exact: true });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${hash}$`));
    await expect(page.locator(heading)).toBeInViewport({ ratio: 0.7 });
    await expect(link).toHaveAttribute('aria-current', 'location');
    await expectNoHorizontalOverflow(page);
  }
});

test('motion can be paused and resumed', async ({ page }) => {
  await visit(page);
  await pauseMotion(page);
  await expect(page.locator('body')).toHaveClass(/is-reduced-motion/);
  await expect(page.locator('.scroll-line')).toHaveCSS('animation-name', 'none');
  await page.getByRole('button', { name: 'Resume ambient animation' }).click();
  await expect(page.getByRole('button', { name: 'Pause ambient animation' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('body')).not.toHaveClass(/is-reduced-motion/);
});

test('sound starts only after a gesture and can be turned off', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    window.__audioContexts = [];
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) {
        super(...args);
        window.__audioContexts.push(this);
      }
    };
  });
  await visit(page);
  expect(await page.evaluate(() => window.__audioContexts.length)).toBe(0);
  await page.getByRole('button', { name: 'Turn ambient sound on' }).click();
  await expect(page.getByRole('button', { name: 'Turn ambient sound off' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status')).toHaveText('Ambient sound on.');
  expect(await page.evaluate(() => window.__audioContexts[0].state)).toBe('running');
  await page.getByRole('button', { name: 'Turn ambient sound off' }).click();
  await expect(page.getByRole('button', { name: 'Turn ambient sound on' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('status')).toHaveText('Ambient sound off.');
});

test('the complete journey can be replayed from the beginning', async ({ page }) => {
  await visit(page);
  await pauseMotion(page);
  await page.getByRole('link', { name: 'Chapter 3: The infinite' }).click();
  await page.getByRole('link', { name: 'Step into the light' }).click();
  await expect(page.locator('#afterglow-title')).toBeInViewport({ ratio: 0.7 });
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Experience it again' }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(2);
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.locator('.brand')).toBeFocused();
  await expect(page.locator('#hero-title')).toBeInViewport({ ratio: 0.7 });
});

test('respects the operating system reduced-motion preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await visit(page);
  await expect(page.getByRole('button', { name: 'Resume ambient animation' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('body')).toHaveClass(/is-reduced-motion/);
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
  await expect(page.locator('.scroll-line')).toHaveCSS('animation-name', 'none');
  await page.getByRole('link', { name: 'Chapter 2: The ascent' }).click();
  await expect(page.locator('#ascent-title')).toBeInViewport({ ratio: 0.7 });
});

test('keeps content and navigation usable when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (['webgl', 'webgl2', 'experimental-webgl'].includes(kind)) return null;
      return original.call(this, kind, ...args);
    };
  });
  await visit(page);
  await expect(page.locator('body')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.locator('#celestial-canvas')).toBeHidden();
  await pauseMotion(page);
  await page.getByRole('link', { name: 'Chapter 2: The ascent' }).click();
  await expect(page.locator('#ascent-title')).toBeInViewport({ ratio: 0.7 });
  await page.getByRole('link', { name: 'Chapter 3: The infinite' }).click();
  await expect(page.locator('#infinite-title')).toBeInViewport({ ratio: 0.7 });
  await expectNoHorizontalOverflow(page);
});
