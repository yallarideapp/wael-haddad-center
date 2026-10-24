import { resolve } from 'node:path';
import { createSuite, navigate, newContext, waitForSteadyLights } from './helpers.mjs';

const suite = createSuite('hood');
const mediaPattern = '**/assets/car-hood-animation.mp4*';

// The first pose is paused, so drawing the actual decoded video into a second
// canvas provides an independent pixel comparison with the visible canvas.
async function firstFramePixels(page) {
  return page.evaluate(() => {
    const car = document.querySelector('#hero-car'), canvas = car.querySelector('#rs5HeroCanvas'), video = car.querySelector('.rs5-source');
    const actual = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    window.firstHoodPixels = new Uint8ClampedArray(actual);
    const reference = document.createElement('canvas'); reference.width = 720; reference.height = 400;
    const ctx = reference.getContext('2d'); ctx.drawImage(video, 0, 0, 720, 400);
    const expected = ctx.getImageData(0, 0, 720, 400).data;
    let error = 0, opaque = 0, min = 255, max = 0;
    for (let i = 0; i < actual.length; i += 4) {
      for (let c = 0; c < 3; c++) { error += Math.abs(actual[i + c] - expected[i + c]); min = Math.min(min, actual[i + c]); max = Math.max(max, actual[i + c]); }
      if (actual[i + 3] === 255) opaque++;
    }
    return { width: canvas.width, height: canvas.height, videoWidth: video.videoWidth, videoHeight: video.videoHeight, paused: video.paused, meanError: error / (720 * 400 * 3), opaqueFraction: opaque / (720 * 400), dynamicRange: max - min, phase: car.dataset.phase, frame: car.dataset.frame };
  });
}

async function finalFramePixels(page) {
  return page.evaluate(() => {
    const car = document.querySelector('#hero-car'), canvas = car.querySelector('#rs5HeroCanvas'), video = car.querySelector('.rs5-source'), poster = car.querySelector('.rs5-poster');
    const actual = canvas.getContext('2d').getImageData(0, 0, 720, 400).data;
    const reference = document.createElement('canvas'); reference.width = 720; reference.height = 400;
    const ctx = reference.getContext('2d'); ctx.drawImage(poster, 0, 0, 720, 400);
    const expected = ctx.getImageData(0, 0, 720, 400).data;
    let posterError = 0, changed = 0, hash = 2166136261;
    for (let i = 0; i < actual.length; i += 4) {
      let difference = 0;
      for (let c = 0; c < 3; c++) {
        posterError += Math.abs(actual[i + c] - expected[i + c]);
        difference += Math.abs(actual[i + c] - window.firstHoodPixels[i + c]);
        hash = Math.imul(hash ^ actual[i + c], 16777619) >>> 0;
      }
      if (difference > 24) changed++;
    }
    return { posterMeanError: posterError / (720 * 400 * 3), changedFraction: changed / (720 * 400), hash, videoTime: video.currentTime, duration: video.duration, paused: video.paused, phase: car.dataset.phase, frame: car.dataset.frame };
  });
}

function watchExpectedMediaFailure(page, label) {
  // A deliberately rejected/404 media request may produce a browser resource
  // error. JavaScript exceptions remain failures in these fallback scenarios.
  page.on('pageerror', (error) => suite.errors.push(`${label} page: ${error.message}`));
}

await suite.run(async (browser) => {
  for (const [device, width, height] of [['phone', 390, 664], ['desktop', 1366, 768]]) {
    const context = await newContext(browser, { viewport: { width, height } });
    let release;
    try {
      const page = await context.newPage(); suite.watch(page, device);
      const gate = new Promise((resolveGate) => { release = resolveGate; });
      await page.route(mediaPattern, async (route) => { await gate; await route.continue(); });
      await navigate(page, suite.url());
      await page.evaluate(() => {
        window.hoodSamples = [];
        const car = document.querySelector('#hero-car'), video = car.querySelector('.rs5-source');
        const sample = () => {
          if (!car.isConnected) return;
          const box = car.getBoundingClientRect();
          window.hoodSamples.push({ time: performance.now(), phase: car.dataset.phase, frame: car.dataset.frame, videoTime: video.currentTime, body: [box.x, box.y, box.width, box.height] });
          if (car.dataset.phase !== 'complete') requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      release();
      await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'open');
      const first = await firstFramePixels(page);
      suite.check(`${device} first visible pose is the real decoded video frame`, first.width === 720 && first.height === 400 && first.videoWidth === 720 && first.videoHeight === 400 && first.meanError < .5 && first.opaqueFraction > .999 && first.dynamicRange > 100 && first.frame === 'video' && first.phase === 'open', first);
      suite.check(`${device} open pose pauses briefly before mechanical closure`, first.paused, first);
      await page.screenshot({ path: resolve(suite.output, `${device}-hood-open.png`) });
      await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'closing');
      await page.screenshot({ path: resolve(suite.output, `${device}-hood-closing.png`) });
      await waitForSteadyLights(page);
      const final = await finalFramePixels(page);
      await page.screenshot({ path: resolve(suite.output, `${device}-lights-on.png`) });
      suite.check(`${device} decoded sequence contains genuinely different open and closed car pixels`, final.changedFraction > .025, final);
      suite.check(`${device} final video crop agrees with the static lit poster`, final.posterMeanError < 5, final);
      suite.check(`${device} video stops on its last decoded frame`, final.paused && Number.isFinite(final.duration) && final.duration >= 2.4 && final.duration <= 2.6 && final.videoTime >= final.duration - .15 && final.videoTime <= final.duration + .01, final);
      await page.waitForTimeout(220);
      const frozen = await finalFramePixels(page);
      suite.check(`${device} final frame remains frozen with no loop or later redraw`, frozen.hash === final.hash && frozen.videoTime === final.videoTime && frozen.paused && frozen.phase === 'complete', { final, frozen });
      const samples = await page.evaluate(() => window.hoodSamples);
      const phases = [...new Set(samples.map((s) => s.phase).filter(Boolean))];
      suite.check(`${device} sequence advances from decoded open frame through closing to complete`, ['open', 'closing', 'complete'].every((phase, index, order) => phases.includes(phase) && (!index || phases.indexOf(phase) > phases.indexOf(order[index - 1]))), phases);
      const moving = samples.filter((sample) => ['open', 'closing', 'complete'].includes(sample.phase));
      const shifted = moving.find((sample) => sample.body.some((value, index) => Math.abs(value - moving[0].body[index]) >= .1));
      suite.check(`${device} canvas stage position and dimensions remain fixed throughout playback`, moving.length > 10 && !shifted, { initial: moving[0], shifted });
      const opened = samples.find((sample) => sample.phase === 'open'), closing = samples.find((sample) => sample.phase === 'closing'), complete = samples.find((sample) => sample.phase === 'complete');
      const timing = opened && closing && complete ? { hold: closing.time - opened.time, playback: complete.time - closing.time } : null;
      suite.check(`${device} holds the initial frame for 300ms and plays the 2.5-second crop once`, timing && timing.hold >= 200 && timing.hold <= 700 && timing.playback >= 2200 && timing.playback <= 3500, timing);
      suite.check(`${device} uses raster media without the old hood mesh, engine cutout, or LED overlay`, await page.locator('#hero-car').evaluate((car) => !car.querySelector('.hood-mesh,.car-hood,.car-engine,.car-lights') && getComputedStyle(car.querySelector('#rs5HeroCanvas')).clipPath === 'none'));
    } finally { if (release) release(); await context.close(); }
  }

  const loading = await newContext(browser);
  let releaseLoading;
  try {
    const page = await loading.newPage(); suite.watch(page, 'loading');
    let requested;
    const seen = new Promise((resolveSeen) => { requested = resolveSeen; });
    const gate = new Promise((resolveGate) => { releaseLoading = resolveGate; });
    await page.route(mediaPattern, async (route) => { requested(); await gate; await route.continue(); });
    await navigate(page, suite.url());
    await Promise.race([seen, new Promise((_, reject) => setTimeout(() => reject(new Error('No video load was started')), 5000))]);
    await page.waitForFunction(() => document.querySelector('.rs5-poster').complete && document.querySelector('.rs5-poster').naturalWidth > 0);
    suite.check('slow video decoding never flashes the closed poster before the open frame', await page.locator('#hero-car').evaluate((car) => car.dataset.phase === 'loading' && car.classList.contains('hood-loading') && Number(getComputedStyle(car).opacity) === 0));
    releaseLoading();
    await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'open');
    const painted = await firstFramePixels(page);
    suite.check('first paint removes loading only after genuine open-frame pixels exist', painted.phase === 'open' && painted.meanError < .5 && painted.opaqueFraction > .999 && await page.locator('#hero-car').evaluate((car) => !car.classList.contains('hood-loading') && Number(getComputedStyle(car).opacity) > .99), painted);
  } finally { if (releaseLoading) releaseLoading(); await loading.close(); }

  const interrupted = await newContext(browser);
  try {
    const page = await interrupted.newPage(); suite.watch(page, 'language interruption');
    let requests = 0;
    page.on('request', (request) => { if (request.url().includes('/assets/car-hood-animation.mp4')) requests++; });
    await navigate(page, suite.url());
    await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'closing');
    const oldVideo = await page.locator('.rs5-source').elementHandle(), before = requests;
    await page.click('[data-act="lang"]');
    await waitForSteadyLights(page);
    suite.check('language change stops the old video and uses the final poster without another load', requests === before && await oldVideo.evaluate((video) => !video.isConnected && video.paused) && await page.locator('#hero-car').evaluate((car) => car.dataset.frame === 'poster' && !car.querySelector('.rs5-source').currentSrc));
  } finally { await interrupted.close(); }

  const navigation = await newContext(browser);
  try {
    const page = await navigation.newPage(); suite.watch(page, 'navigation interruption');
    await navigate(page, suite.url());
    await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'closing');
    const oldVideo = await page.locator('.rs5-source').elementHandle();
    await page.click('.hero a[href="#book"]');
    await page.waitForSelector('[data-form="book"]');
    suite.check('leaving the hero cancels playback on the detached video', await oldVideo.evaluate((video) => !video.isConnected && video.paused));
    await page.evaluate(() => { location.hash = ''; });
    await waitForSteadyLights(page);
    suite.check('returning after interrupted playback shows the final poster without replay', await page.locator('#hero-car').evaluate((car) => car.dataset.frame === 'poster' && !car.querySelector('.rs5-source').currentSrc));
  } finally { await navigation.close(); }

  const reduced = await newContext(browser, { reducedMotion: 'reduce' });
  try {
    const page = await reduced.newPage(); suite.watch(page, 'reduced motion');
    let requests = 0;
    page.on('request', (request) => { if (request.url().includes('/assets/car-hood-animation.mp4')) requests++; });
    await navigate(page, suite.url()); await waitForSteadyLights(page);
    suite.check('reduced motion shows a decoded final photograph and never fetches video', requests === 0 && await page.locator('#hero-car').evaluate((car) => car.dataset.phase === 'complete' && car.dataset.frame === 'poster' && car.classList.contains('lights-on')));
  } finally { await reduced.close(); }

  const changedPreference = await newContext(browser);
  try {
    const page = await changedPreference.newPage(); suite.watch(page, 'motion preference change');
    await navigate(page, suite.url());
    await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'closing');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await waitForSteadyLights(page);
    suite.check('enabling reduced motion during closure immediately stops video on the final poster', await page.locator('#hero-car').evaluate((car) => car.dataset.frame === 'poster' && car.querySelector('.rs5-source').paused));
  } finally { await changedPreference.close(); }

  for (const failure of ['missing', 'corrupt', 'autoplay']) {
    const context = await newContext(browser);
    try {
      if (failure === 'autoplay') await context.addInitScript(() => { HTMLMediaElement.prototype.play = function () { return Promise.reject(Object.assign(new Error('Playback intentionally blocked'), { name: 'NotAllowedError' })); }; });
      const page = await context.newPage(); watchExpectedMediaFailure(page, failure);
      if (failure === 'missing') await page.route(mediaPattern, (route) => route.fulfill({ status: 404, contentType: 'video/mp4', body: '' }));
      if (failure === 'corrupt') await page.route(mediaPattern, (route) => route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.from('invalid media') }));
      await navigate(page, suite.url()); await waitForSteadyLights(page);
      suite.check(`${failure} media safely resolves to the visible final photograph`, await page.locator('#hero-car').evaluate((car) => car.dataset.frame === 'poster' && car.dataset.phase === 'complete' && car.classList.contains('lights-on') && !car.classList.contains('hood-loading') && car.querySelector('.rs5-source').paused));
    } finally { await context.close(); }
  }
});
