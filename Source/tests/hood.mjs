import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createSuite, navigate, newContext, waitForSteadyLights } from './helpers.mjs';

const suite = createSuite('hood');

// Inspect the production geometry in an isolated VM. The extra export exists
// only in this test's source string; no diagnostic API ships with the site.
function checkHingeGeometry() {
  const source = readFileSync(new URL('../hood-motion.js', import.meta.url), 'utf8');
  const anchor = 'window.WHHood = { create };';
  if (!source.includes(anchor)) throw new Error('Bonnet geometry test could not find the module boundary');
  const scope = { window: {} };
  runInNewContext(source.replace(anchor,
    'window.WHHood = { lift, rotate, surface, photoPoint, REAR, OPENING };'), scope);
  const { lift, rotate, surface, photoPoint, REAR, OPENING } = scope.window.WHHood;
  const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
  // The projection and four seam landmarks are independently fixed to the
  // current photograph, so moving the hinge or clipping the grille fails here.
  const project = ([x, y, z]) => [2000*x/z + 836, 2000*y/z + 300];
  const corners = [[0, 0, [490, 307]], [1, 0, [1006, 319]], [0, 1, [129, 411]], [1, 1, [579, 437]]];
  const cornerError = Math.max(...corners.map(([u, v, expected]) => distance(project(surface(u, v)), expected)));
  suite.check('closed bonnet corners retain the original photo seam', cornerError < 1e-8, { maximumPixelError: cornerError });
  const angles = [-OPENING, -OPENING*.75, -OPENING*.5, -OPENING*.25, 0, .4*Math.PI/180];
  const hinges = [REAR[0], REAR[3]];
  const hingeError = Math.max(...angles.flatMap((angle) => hinges.map((pixel) => distance(project(rotate(lift(pixel), angle)), pixel))));
  suite.check('both windshield hinges remain fixed through every angle and latch settle', hingeError < 1e-8, { maximumPixelError: hingeError });
  const points = [0, .25, .5, .75, 1].flatMap((u) => [0, .33, .67, 1].map((v) => surface(u, v)));
  let rigidError = 0;
  for (const angle of angles) {
    const turned = points.map((point) => rotate(point, angle));
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      rigidError = Math.max(rigidError, Math.abs(distance(turned[i], turned[j]) - distance(points[i], points[j])));
    }
  }
  suite.check('bonnet keeps its shape without bending or stretching throughout closure', rigidError < 1e-10, { maximumDistanceError: rigidError });
  let boundaryError = 0;
  for (let i = 0; i <= 40; i++) {
    const t = i/40;
    for (const [u, v] of [[t, 0], [t, 1], [0, t], [1, t]]) {
      boundaryError = Math.max(boundaryError, distance(project(rotate(surface(u, v), 0)), photoPoint(u, v)));
    }
  }
  suite.check('closed bonnet boundary reprojects flush onto the original photo', boundaryError < 1e-8, { maximumPixelError: boundaryError });
}

// Read the rendered hood once, immediately after the animation's frame. Element
// bounds alone cannot catch a transparent, clipped, or incorrectly placed mesh.
async function paintedHoodBounds(page) {
  return page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => {
      const canvas = document.querySelector('.hood-mesh');
      const gl = canvas?.getContext('webgl');
      if (!gl) { resolve(null); return; }
      const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let left = width, top = height, right = -1, bottom = -1, painted = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (pixels[(y * width + x) * 4 + 3] < 32) continue;
        const imageY = height - y - 1;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, imageY); bottom = Math.max(bottom, imageY);
        painted++;
      }
      resolve({
        left, right,
        top, bottom,
        painted, width, height
      });
    });
  }));
}

await suite.run(async (browser) => {
  checkHingeGeometry();
  for (const [device, width, height] of [['phone', 390, 664], ['desktop', 1366, 768]]) {
    const context = await newContext(browser, { viewport: { width, height } });
    try {
      const page = await context.newPage(); suite.watch(page, device);
      await navigate(page, suite.url());
      await page.evaluate(() => {
        window.hoodSamples = [];
        const car = document.querySelector('#hero-car');
        const sample = () => {
          if (!car.isConnected) return;
          const photo = car.querySelector('img').getBoundingClientRect();
          window.hoodSamples.push({ time: performance.now(), phase: car.dataset.phase, open: Number(car.dataset.hoodOpen || 0), lights: getComputedStyle(car.querySelector('.lamp')).opacity, body: [photo.x, photo.y, photo.width, photo.height] });
          if (car.dataset.phase !== 'complete') requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'open');
      const painted = await paintedHoodBounds(page);
      // These pixels contain the wheels and lower body, outside the bonnet and LEDs.
      const fixedBodyClip = await page.locator('#hero-car > img').evaluate((photo) => {
        const box = photo.getBoundingClientRect();
        return { x: box.x, y: box.y + box.height*.58, width: box.width, height: box.height*.31 };
      });
      const bodyBefore = await page.screenshot({ clip: fixedBodyClip });
      await page.screenshot({ path: resolve(suite.output, `${device}-hood-open.png`) });
      suite.check(`${device} rendered open hood rises above its closed windshield seam`, painted && painted.painted > 10000 && painted.top < 330, painted);
      suite.check(`${device} rendered open hood has clear space inside every frame edge`, painted && painted.left > 2 && painted.right < painted.width - 2 && painted.top > 2 && painted.bottom < painted.height - 2, painted);
      await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'closing' && Number(document.querySelector('#hero-car').dataset.hoodOpen) < .55);
      await page.screenshot({ path: resolve(suite.output, `${device}-hood-closing.png`) });
      const bodyDuring = await page.screenshot({ clip: fixedBodyClip });
      await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'closing' && Number(document.querySelector('#hero-car').dataset.hoodOpen) < .2);
      await page.screenshot({ path: resolve(suite.output, `${device}-hood-settling.png`) });
      await waitForSteadyLights(page);
      await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'complete');
      await page.screenshot({ path: resolve(suite.output, `${device}-lights-on.png`) });
      const samples = await page.evaluate(() => window.hoodSamples);
      const phases = [...new Set(samples.map((s) => s.phase).filter(Boolean))];
      suite.check(`${device} starts open, closes, then illuminates`, ['open', 'closing', 'lights', 'complete'].every((p, i, order) => phases.includes(p) && (!i || phases.indexOf(p) > phases.indexOf(order[i - 1]))), phases);
      suite.check(`${device} hood moves through intermediate positions`, samples.find((s) => s.phase === 'open')?.open === 1 && samples.some((s) => s.phase === 'closing' && s.open > .2 && s.open < .8));
      const moving = samples.filter((s) => s.phase === 'open' || s.phase === 'closing');
      const contact = moving.findIndex((s) => s.open <= 0);
      const lowering = contact < 0 ? moving : moving.slice(0, contact + 1);
      suite.check(`${device} lowers without reopening and settles by less than half a degree`, moving[0]?.open === 1 && contact >= 0 && lowering.every((s, i) => !i || s.open <= lowering[i - 1].open) && moving.every((s) => s.open >= -.013 && s.open <= 1) && moving.at(-1)?.open === 0);
      suite.check(`${device} lamps stay off until the hood closes`, samples.filter((s) => ['open', 'closing'].includes(s.phase)).every((s) => Number(s.lights) === 0));
      const bodyFrames = samples.filter((s) => ['open', 'closing', 'lights', 'complete'].includes(s.phase));
      const shiftedBody = bodyFrames.find((s) => s.body.some((value, i) => Math.abs(value-bodyFrames[0].body[i]) >= .1));
      suite.check(`${device} car position and scale remain fixed throughout closure`, !shiftedBody, { initial: bodyFrames[0], shifted: shiftedBody });
      suite.check(`${device} wheel and body pixels are unchanged while the bonnet moves`, bodyBefore.equals(bodyDuring));
      const opened = samples.find((s) => s.phase === 'open'), closing = samples.find((s) => s.phase === 'closing');
      // Ignore a rounded zero while crossing the latch; seating is the final
      // uninterrupted run of zero angle before illumination.
      const closingFrames = samples.filter((s) => s.phase === 'closing');
      const seated = closingFrames.find((s, i) => s.open === 0 && closingFrames.slice(i).every((frame) => frame.open === 0));
      const lights = samples.find((s) => s.phase === 'lights');
      const timing = opened && closing && seated && lights ? { hold: closing.time-opened.time, descent: seated.time-closing.time, seated: lights.time-seated.time } : null;
      suite.check(`${device} calibrated pace holds briefly, lowers in 1.2 seconds, then seats before lights`, timing && timing.hold >= 200 && timing.hold <= 650 && timing.descent >= 1000 && timing.descent <= 1800 && timing.seated >= 60 && timing.seated <= 400, timing);
      suite.check(`${device} final state hides the moving hood and engine layers`, await page.locator('.car-hood').evaluate((el) => getComputedStyle(el).display === 'none' && Boolean(el.querySelector('.hood-mesh'))));
    } finally { await context.close(); }
  }

  const loading = await newContext(browser);
  try {
    const page = await loading.newPage(); suite.watch(page, 'loading');
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route('**/assets/hood-underside.webp*', async (route) => { await gate; await route.continue(); });
    await navigate(page, suite.url());
    await page.waitForFunction(() => document.querySelector('#hero-car > img').complete);
    suite.check('slow hood image never flashes a closed car first', await page.locator('#hero-car').evaluate((car) => car.classList.contains('hood-loading') && getComputedStyle(car).opacity === '0'));
    release();
    await page.waitForFunction(() => !document.querySelector('#hero-car').classList.contains('hood-loading'));
    const painted = await paintedHoodBounds(page);
    suite.check('first visible pose is already painted open after the textures decode', await page.locator('#hero-car').evaluate((car) => car.dataset.phase === 'open' && car.dataset.hoodOpen === '1.000' && getComputedStyle(car).opacity === '1') && painted && painted.painted > 10000 && painted.top < 330, painted);
  } finally { await loading.close(); }

  const interrupted = await newContext(browser);
  try {
    const page = await interrupted.newPage(); suite.watch(page, 'interruption');
    await navigate(page, suite.url());
    await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'closing');
    await page.click('[data-act="lang"]');
    suite.check('language change during closing settles without replay or a detached animation', await page.locator('#hero-car').evaluate((car) => car.dataset.phase === 'complete' && car.classList.contains('lights-on')));
  } finally { await interrupted.close(); }

  const reduced = await newContext(browser, { reducedMotion: 'reduce' });
  try {
    const page = await reduced.newPage(); suite.watch(page, 'reduced motion');
    await navigate(page, suite.url());
    suite.check('reduced motion skips the hood and shows steady lamps', await page.locator('#hero-car').evaluate((car) => car.dataset.phase === 'complete' && car.classList.contains('lights-on') && getComputedStyle(car.querySelector('.car-hood')).display === 'none'));
  } finally { await reduced.close(); }

  const changedPreference = await newContext(browser);
  try {
    const page = await changedPreference.newPage(); suite.watch(page, 'motion preference change');
    await navigate(page, suite.url());
    await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'closing');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'complete');
    suite.check('enabling reduced motion during closing immediately settles the car', await page.locator('#hero-car').evaluate((car) => car.dataset.hoodOpen === '0' && car.classList.contains('lights-on')));
  } finally { await changedPreference.close(); }

  // A failed inset must never leave a black cutout or prevent the existing lights.
  const fallback = await newContext(browser);
  try {
    const page = await fallback.newPage();
    await page.route('**/assets/engine-bay.webp*', (route) => route.fulfill({ status: 200, contentType: 'image/webp', body: Buffer.from('invalid image') }));
    await navigate(page, suite.url());
    await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'complete');
    suite.check('an unavailable engine texture falls back to the closed car and lights', await page.locator('#hero-car').evaluate((car) => car.classList.contains('lights-on') && getComputedStyle(car.querySelector('.car-hood')).display === 'none'));
  } finally { await fallback.close(); }

  const noWebGL = await newContext(browser);
  try {
    await noWebGL.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...options) {
        return kind === 'webgl' ? null : original.call(this, kind, ...options);
      };
    });
    const page = await noWebGL.newPage(); suite.watch(page, 'WebGL unavailable');
    await navigate(page, suite.url());
    await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'complete');
    suite.check('WebGL unavailable falls back to the visible closed car and steady lights', await page.locator('#hero-car').evaluate((car) => car.classList.contains('lights-on') && !car.classList.contains('hood-loading') && getComputedStyle(car).opacity === '1' && car.querySelector('img').naturalWidth > 0 && getComputedStyle(car.querySelector('.car-hood')).display === 'none'));
  } finally { await noWebGL.close(); }

  const lostWebGL = await newContext(browser);
  try {
    const page = await lostWebGL.newPage(); suite.watch(page, 'WebGL context loss');
    await navigate(page, suite.url());
    await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'open');
    await page.locator('.hood-mesh').evaluate((canvas) => canvas.getContext('webgl').getExtension('WEBGL_lose_context').loseContext());
    await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'complete');
    suite.check('losing the drawing context immediately restores the complete closed car', await page.locator('#hero-car').evaluate((car) => car.classList.contains('lights-on') && getComputedStyle(car.querySelector('.car-hood')).display === 'none'));
  } finally { await lostWebGL.close(); }
});
