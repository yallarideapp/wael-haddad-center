import { resolve } from 'node:path';
import { createSuite, navigate, newContext, waitForSteadyLights } from './helpers.mjs';

const suite = createSuite('hood');

await suite.run(async (browser) => {
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
          window.hoodSamples.push({ phase: car.dataset.phase, open: Number(car.dataset.hoodOpen || 0), lights: getComputedStyle(car.querySelector('.lamp')).opacity });
          if (car.dataset.phase !== 'complete') requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'open');
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.hero-specialism')).opacity) > .99);
      await page.screenshot({ path: resolve(suite.output, `${device}-hood-open.png`) });
      suite.check(`${device} raised hood stays inside its car frame`, await page.locator('.hood-panel').evaluate((panel) => {
        const bounds = panel.querySelector('.hood-underside').getBoundingClientRect(), frame = panel.closest('.hero-car').getBoundingClientRect();
        return bounds.left >= frame.left - 1 && bounds.right <= frame.right + 1 && bounds.top >= frame.top - 1;
      }));
      await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'closing' && Number(document.querySelector('#hero-car').dataset.hoodOpen) < .55);
      await page.screenshot({ path: resolve(suite.output, `${device}-hood-closing.png`) });
      await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'closing' && Number(document.querySelector('#hero-car').dataset.hoodOpen) < .2);
      await page.screenshot({ path: resolve(suite.output, `${device}-hood-settling.png`) });
      await waitForSteadyLights(page);
      await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'complete');
      await page.screenshot({ path: resolve(suite.output, `${device}-lights-on.png`) });
      const samples = await page.evaluate(() => window.hoodSamples);
      const phases = [...new Set(samples.map((s) => s.phase).filter(Boolean))];
      suite.check(`${device} starts open, closes, then illuminates`, ['open', 'closing', 'lights', 'complete'].every((p, i, order) => phases.includes(p) && (!i || phases.indexOf(p) > phases.indexOf(order[i - 1]))), phases);
      suite.check(`${device} hood moves through intermediate positions`, samples.find((s) => s.phase === 'open')?.open === 1 && samples.some((s) => s.phase === 'closing' && s.open > .2 && s.open < .8));
      suite.check(`${device} starts fully open and never reopens`, samples.filter((s) => s.phase === 'open' || s.phase === 'closing').every((s, i, sequence) => !i || s.open <= sequence[i - 1].open));
      suite.check(`${device} lamps stay off until the hood closes`, samples.filter((s) => ['open', 'closing'].includes(s.phase)).every((s) => Number(s.lights) === 0));
      suite.check(`${device} final state removes the moving layers`, await page.locator('.car-hood').evaluate((el) => getComputedStyle(el).display === 'none' && !el.querySelector('.hood-panel').hasAttribute('style')));
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
    suite.check('first visible pose is already open after the textures decode', await page.locator('#hero-car').evaluate((car) => car.dataset.phase === 'open' && car.dataset.hoodOpen === '1.000' && getComputedStyle(car.querySelector('.hood-underside')).display !== 'none'));
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
});
