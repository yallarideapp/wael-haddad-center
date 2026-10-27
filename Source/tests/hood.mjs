import { resolve } from 'node:path';
import { createSuite, navigate, newContext, waitForSteadyLights } from './helpers.mjs';

const suite = createSuite('hood');
const mediaPattern = '**/assets/car-hood-frames-1.webp*';
const isMotionAsset = (url) => /\/assets\/(?:car-studio-base\.webp|car-led\.webp|car-headlights\.webp|car-hood-frames-\d\.webp)/.test(url);
// Reviewed against the complete swept hood/engine area, independently of the
// production motion mask. These original photographic surfaces never move.
const fixedBodyRegions = [
  { name: 'near lamp housing', box: [405, 307, 124, 27] },
  { name: 'far lamp housing', box: [101, 303, 47, 20] },
  { name: 'front fender and arch', box: [575, 300, 25, 170] },
  { name: 'lower bumper', box: [84, 355, 456, 110] },
  { name: 'rear quarter and outer silhouette', box: [800, 230, 240, 280] },
  { name: 'roof', box: [660, 126, 100, 25] },
  { name: 'windshield', box: [665, 175, 30, 45] },
  { name: 'door', box: [750, 300, 110, 80] }
];

async function fixedBodyAcrossFrames(page) {
  return page.evaluate(async (regions) => {
    const load = async (path) => { const image = new Image(); image.src = new URL(path, document.baseURI).href; await image.decode(); return image; };
    const [body, base, ...atlases] = await Promise.all([
      'assets/car-body-aligned.webp', 'assets/car-studio-base.webp',
      ...[1, 2, 3, 4].map((part) => `assets/car-hood-frames-${part}.webp`)
    ].map(load));
    const reference = document.createElement('canvas'); reference.width = 1080; reference.height = 600;
    const ctx = reference.getContext('2d', { willReadFrequently: true }); ctx.drawImage(body, 0, 0);
    const expected = regions.map((region) => ctx.getImageData(...region.box).data);
    const rendered = document.createElement('canvas'); rendered.width = 1080; rendered.height = 600;
    const paint = rendered.getContext('2d', { willReadFrequently: true });
    return regions.map((region, position) => {
      const source = expected[position];
      let changed = 0, alphaChanged = 0, opaque = 0, transparent = 0, min = 255, max = 0;
      const frames = [];
      for (let index = 0; index <= 46; index++) {
        const cell = index % 12;
        paint.clearRect(0, 0, 1080, 600); paint.drawImage(base, 0, 0);
        paint.drawImage(atlases[Math.floor(index / 12)], cell % 3 * 1080, Math.floor(cell / 3) * 600, 1080, 600, 0, 0, 1080, 600);
        const actual = paint.getImageData(...region.box).data;
        let frameChanged = 0, frameAlphaChanged = 0;
        for (let pixel = 0; pixel < source.length; pixel += 4) {
          if (!index) {
            if (source[pixel + 3] > 240) { opaque++; for (let channel = 0; channel < 3; channel++) { min = Math.min(min, source[pixel + channel]); max = Math.max(max, source[pixel + channel]); } }
            if (!source[pixel + 3]) transparent++;
          }
          if (actual[pixel + 3] !== source[pixel + 3]) frameAlphaChanged++;
          if ([0, 1, 2, 3].some((channel) => actual[pixel + channel] !== source[pixel + channel])) frameChanged++;
        }
        changed += frameChanged; alphaChanged += frameAlphaChanged;
        frames.push({ index, changed: frameChanged, alphaChanged: frameAlphaChanged });
      }
      return { ...region, changed, alphaChanged, opaque, transparent, dynamicRange: max - min, frames };
    });
  }, fixedBodyRegions);
}

// Interior patches establish that the complete photographed mechanism still
// comes from the recording. Static lamps/bumper no longer belong in an atlas.
async function recordedMechanismPixels(page) {
  return page.evaluate(async () => {
    const load = async (path) => { const image = new Image(); image.src = new URL(path, document.baseURI).href; await image.decode(); return image; };
    const [source, ...atlases] = await Promise.all(['assets/hood-reference.webp', ...[1, 2, 3, 4].map((part) => `assets/car-hood-frames-${part}.webp`)].map(load));
    const reference = document.createElement('canvas'); reference.width = 1080; reference.height = 600;
    const rendered = document.createElement('canvas'); rendered.width = 1080; rendered.height = 600;
    const ref = reference.getContext('2d', { willReadFrequently: true }), paint = rendered.getContext('2d', { willReadFrequently: true });
    return [
      { name: 'open hood underside', index: 0, box: [300, 70, 120, 70] },
      { name: 'visible engine', index: 0, box: [250, 250, 115, 25] },
      { name: 'mid-close hood underside', index: 24, box: [280, 200, 90, 12] },
      { name: 'closed hood surface', index: 46, box: [270, 250, 150, 25] }
    ].map((region) => {
      const cell = region.index % 12;
      ref.clearRect(0, 0, 1080, 600); paint.clearRect(0, 0, 1080, 600);
      ref.drawImage(source, region.index % 6 * 1080, Math.floor(region.index / 6) * 600, 1080, 600, 0, 0, 1080, 600);
      paint.drawImage(atlases[Math.floor(region.index / 12)], cell % 3 * 1080, Math.floor(cell / 3) * 600, 1080, 600, 0, 0, 1080, 600);
      const expected = ref.getImageData(...region.box).data, actual = paint.getImageData(...region.box).data;
      let error = 0, alphaError = 0, opaque = 0, min = 255, max = 0;
      for (let pixel = 0; pixel < actual.length; pixel += 4) {
        const alpha = actual[pixel + 3], expectedAlpha = expected[pixel + 3];
        if (alpha > 240) opaque++;
        alphaError += Math.abs(alpha - expectedAlpha);
        for (let channel = 0; channel < 3; channel++) {
          error += Math.abs(actual[pixel + channel] * alpha - expected[pixel + channel] * expectedAlpha) / 255;
          if (alpha > 240) { min = Math.min(min, actual[pixel + channel]); max = Math.max(max, actual[pixel + channel]); }
        }
      }
      const pixels = region.box[2] * region.box[3];
      return { ...region, opaqueFraction: opaque / pixels, meanError: error / (pixels * 3), alphaMeanError: alphaError / pixels, dynamicRange: max - min };
    });
  });
}

// Check the runtime compositor against decoded source cells independently of
// its draw loop.
async function firstFramePixels(page) {
  return page.evaluate(async () => {
    const car = document.querySelector('#hero-car'), canvas = car.querySelector('#rs5HeroCanvas');
    const actual = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    window.firstHoodPixels = new Uint8ClampedArray(actual);
    const state = { width: canvas.width, height: canvas.height, mediaTime: Number(canvas.dataset.mediaTime), phase: car.dataset.phase, frame: car.dataset.frame, frameIndex: Number(canvas.dataset.frameIndex) };
    const base = new Image(), atlas = new Image();
    base.src = new URL('assets/car-studio-base.webp', document.baseURI).href;
    atlas.src = new URL('assets/car-hood-frames-1.webp', document.baseURI).href;
    await Promise.all([base.decode(), atlas.decode()]);
    const reference = document.createElement('canvas'); reference.width = 1080; reference.height = 600;
    const ctx = reference.getContext('2d'); ctx.drawImage(base, 0, 0, 1080, 600);
    ctx.drawImage(atlas, 0, 0, 1080, 600, 0, 0, 1080, 600);
    const expected = ctx.getImageData(0, 0, 1080, 600).data;
    let error = 0, alphaError = 0, opaque = 0, transparent = 0, cornerAlpha = 0, min = 255, max = 0;
    for (let i = 0; i < actual.length; i += 4) {
      const alpha = actual[i + 3], expectedAlpha = expected[i + 3];
      for (let c = 0; c < 3; c++) {
        error += Math.abs(actual[i + c] * alpha - expected[i + c] * expectedAlpha) / 255;
        if (alpha > 200) { min = Math.min(min, actual[i + c]); max = Math.max(max, actual[i + c]); }
      }
      alphaError += Math.abs(alpha - expectedAlpha);
      if (alpha > 240) opaque++;
      if (alpha === 0) transparent++;
      const pixel = i / 4, x = pixel % 1080, y = Math.floor(pixel / 1080);
      if ((x < 16 || x >= 1064) && (y < 16 || y >= 584)) cornerAlpha += alpha;
    }
    return { ...state, baseWidth: base.naturalWidth, baseHeight: base.naturalHeight, atlasWidth: atlas.naturalWidth, atlasHeight: atlas.naturalHeight, meanError: error / (1080 * 600 * 3), alphaMeanError: alphaError / (1080 * 600), opaqueFraction: opaque / (1080 * 600), transparentFraction: transparent / (1080 * 600), cornerAlpha, dynamicRange: max - min };
  });
}

async function finalFramePixels(page) {
  return page.evaluate(() => {
    const car = document.querySelector('#hero-car'), canvas = car.querySelector('#rs5HeroCanvas'), poster = car.querySelector('.rs5-poster');
    const actual = canvas.getContext('2d').getImageData(0, 0, 1080, 600).data;
    const reference = document.createElement('canvas'); reference.width = 1080; reference.height = 600;
    const ctx = reference.getContext('2d'); ctx.drawImage(poster, 0, 0, 1080, 600);
    const expected = ctx.getImageData(0, 0, 1080, 600).data;
    // Interior body regions stay outside the recorded front of the car.
    // Require opaque photographic detail, so empty transparent pixels cannot pass.
    const staticRegions = [
      { name: 'front wheel', box: [587, 353, 70, 102] },
      { name: 'rear wheel', box: [916, 339, 32, 78] },
      { name: 'door', box: [750, 300, 110, 80] }
    ].map((region) => ({ ...region, opaque: 0, changed: 0, maxDifference: 0 }));
    let posterError = 0, alphaError = 0, changed = 0, alphaChanged = 0, transparent = 0, cornerAlpha = 0, hash = 2166136261;
    for (let i = 0; i < actual.length; i += 4) {
      const alpha = actual[i + 3], expectedAlpha = expected[i + 3], firstAlpha = window.firstHoodPixels[i + 3];
      let difference = Math.abs(alpha - firstAlpha);
      for (let c = 0; c < 3; c++) {
        posterError += Math.abs(actual[i + c] * alpha - expected[i + c] * expectedAlpha) / 255;
        difference += Math.abs(actual[i + c] * alpha - window.firstHoodPixels[i + c] * firstAlpha) / 255;
        hash = Math.imul(hash ^ (alpha ? actual[i + c] : 0), 16777619) >>> 0;
      }
      hash = Math.imul(hash ^ alpha, 16777619) >>> 0;
      alphaError += Math.abs(alpha - expectedAlpha);
      if (Math.abs(alpha - firstAlpha) > 24) alphaChanged++;
      if (alpha === 0) transparent++;
      const pixel = i / 4, x = pixel % 1080, y = Math.floor(pixel / 1080);
      for (const region of staticRegions) {
        const [left, top, width, height] = region.box;
        if (x < left || x >= left + width || y < top || y >= top + height) continue;
        if (alpha > 240 && firstAlpha > 240) region.opaque++;
        const delta = Math.max(...[0, 1, 2, 3].map((channel) => Math.abs(actual[i + channel] - window.firstHoodPixels[i + channel])));
        region.maxDifference = Math.max(region.maxDifference, delta);
        if (delta) region.changed++;
      }
      if ((x < 16 || x >= 1064) && (y < 16 || y >= 584)) cornerAlpha += alpha;
      if (difference > 24) changed++;
    }
    return { posterMeanError: posterError / (1080 * 600 * 3), alphaMeanError: alphaError / (1080 * 600), changedFraction: changed / (1080 * 600), alphaChangedFraction: alphaChanged / (1080 * 600), transparentFraction: transparent / (1080 * 600), cornerAlpha, hash, staticRegions, frameIndex: Number(canvas.dataset.frameIndex), mediaTime: Number(canvas.dataset.mediaTime), dip: Number(canvas.dataset.dip), phase: car.dataset.phase, frame: car.dataset.frame };
  });
}

// Compare the restored grille and badges with the original photographic body,
// independently of the runtime atlas. The off-stage snapshot avoids headlight
// bloom and must preserve the same detail as the initial open pose.
async function restoredGrillePixels(page) {
  return page.evaluate(async () => {
    const body = new Image(); body.src = new URL('assets/car-body-aligned.webp', document.baseURI).href;
    await body.decode();
    const reference = document.createElement('canvas'); reference.width = 1080; reference.height = 600;
    const ctx = reference.getContext('2d'); ctx.drawImage(body, 0, 0, 1080, 600);
    const expected = ctx.getImageData(0, 0, 1080, 600).data;
    return ['open', 'closed unlit'].map((name) => {
      const actual = name === 'open' ? window.firstHoodPixels : window.hoodLightSnapshots.off?.pixels;
      if (!actual) return { name, captured: false };
      const box = [180, 330, 175, 85];
      let error = 0, opaque = 0;
      for (let y = box[1]; y < box[1] + box[3]; y++) for (let x = box[0]; x < box[0] + box[2]; x++) {
        const i = (y * 1080 + x) * 4;
        if (actual[i + 3] > 240 && expected[i + 3] > 240) opaque++;
        for (let c = 0; c < 3; c++) error += Math.abs(actual[i + c] - expected[i + c]);
      }
      return { name, captured: true, opaqueFraction: opaque / (box[2] * box[3]), meanError: error / (box[2] * box[3] * 3) };
    });
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
      const atlasPaths = new Set(), basePaths = new Set(), ledPaths = new Set(), headlightPaths = new Set();
      page.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        if (/car-hood-frames-\d\.webp$/.test(path)) atlasPaths.add(path);
        if (/car-studio-base\.webp$/.test(path)) basePaths.add(path);
        if (/car-led\.webp$/.test(path)) ledPaths.add(path);
        if (/car-headlights\.webp$/.test(path)) headlightPaths.add(path);
      });
      const gate = new Promise((resolveGate) => { release = resolveGate; });
      await page.route(mediaPattern, async (route) => { await gate; await route.continue(); });
      await navigate(page, suite.url());
      await page.evaluate(async (regions) => {
        window.hoodSamples = [];
        window.hoodLightSnapshots = {};
        window.hoodStaticSamples = [];
        const car = document.querySelector('#hero-car'), canvas = car.querySelector('#rs5HeroCanvas');
        const body = new Image(); body.src = new URL('assets/car-body-aligned.webp', document.baseURI).href; await body.decode();
        const reference = document.createElement('canvas'); reference.width = 1080; reference.height = 600;
        const ref = reference.getContext('2d', { willReadFrequently: true }); ref.drawImage(body, 0, 0);
        const expected = regions.map((region) => ref.getImageData(...region.box).data), seenFrames = new Set();
        const sample = () => {
          if (!car.isConnected) return;
          const box = car.getBoundingClientRect(), floor = car.querySelector('.rs5-floor').getBoundingClientRect();
          const frameIndex = Number(canvas.dataset.frameIndex), lightStage = canvas.dataset.lightStage;
          window.hoodSamples.push({ time: performance.now(), phase: car.dataset.phase, frame: car.dataset.frame, frameIndex, lightStage, pose: Number(canvas.dataset.pose), dip: Number(canvas.dataset.dip), mediaTime: Number(canvas.dataset.mediaTime), body: [box.x, box.y, box.width, box.height], floor: [floor.x, floor.y, floor.width, floor.height] });
          if (lightStage === 'off' && !Number(canvas.dataset.dip) && Number.isInteger(frameIndex) && frameIndex >= 0 && !seenFrames.has(frameIndex)) {
            seenFrames.add(frameIndex);
            const ctx = canvas.getContext('2d');
            window.hoodStaticSamples.push({ frameIndex, regions: regions.map((region, position) => {
              const source = expected[position], actual = ctx.getImageData(...region.box).data;
              let changed = 0, alphaChanged = 0;
              for (let pixel = 0; pixel < source.length; pixel += 4) {
                if (actual[pixel + 3] !== source[pixel + 3]) alphaChanged++;
                if ([0, 1, 2, 3].some((channel) => actual[pixel + channel] !== source[pixel + channel])) changed++;
              }
              return { name: region.name, changed, alphaChanged };
            }) });
          }
          // Capture the real rendered light stages while playback advances.
          // Every light stage must use the same closed pose, so lighting can
          // be checked without mistaking a geometry change for ignition.
          if ((frameIndex === 46 && lightStage === 'off' && Number(canvas.dataset.mediaTime) >= 1.95) || (lightStage === 'led' && Number(canvas.dataset.mediaTime) >= 2.35) || (lightStage === 'headlights' && Number(canvas.dataset.mediaTime) >= 3.25)) {
            if (!window.hoodLightSnapshots[lightStage]) window.hoodLightSnapshots[lightStage] = { pixels: canvas.getContext('2d').getImageData(0, 0, 1080, 600).data, frameIndex, mediaTime: Number(canvas.dataset.mediaTime) };
          }
          if (car.dataset.phase !== 'complete') requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }, fixedBodyRegions);
      release();
      await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'open');
      const first = await firstFramePixels(page);
      suite.check(`${device} first visible pose matches the fixed body parts plus the first recorded front frame`, first.width === 1080 && first.height === 600 && first.baseWidth === 1080 && first.baseHeight === 600 && first.atlasWidth === 3240 && first.atlasHeight === 2400 && first.meanError < .5 && first.alphaMeanError < .5 && first.dynamicRange > 100 && first.frame === 'video' && first.phase === 'open' && first.frameIndex === 0, first);
      suite.check(`${device} open car has transparent corners and foreground rather than a rectangular matte`, first.cornerAlpha === 0 && first.transparentFraction > .2 && first.opaqueFraction > .06 && first.opaqueFraction < .8, first);
      const floor = await page.locator('.rs5-floor').evaluate(async (image) => {
        await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let cornerAlpha = 0, floorPixels = 0;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
          const alpha = pixels[(y * canvas.width + x) * 4 + 3];
          if ((x < 16 || x >= canvas.width - 16) && (y < 16 || y >= canvas.height - 16)) cornerAlpha += alpha;
          if (y >= 450 && alpha > 20) floorPixels++;
        }
        return { width: canvas.width, height: canvas.height, cornerAlpha, floorPixels };
      });
      suite.check(`${device} photographic floor loads separately with soft transparent outer corners`, floor.width === 1080 && floor.height === 600 && floor.cornerAlpha === 0 && floor.floorPixels > 2000, floor);
      suite.check(`${device} open pose pauses briefly before mechanical closure`, first.mediaTime === 0, first);
      await page.screenshot({ path: resolve(suite.output, `${device}-hood-open.png`) });
      await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'closing');
      await page.waitForFunction(() => Number(document.querySelector('#rs5HeroCanvas').dataset.mediaTime) >= .6);
      const smoke = await page.locator('.rs5-smoke').evaluate((canvas) => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let visible = 0, soft = 0, outsidePlume = 0;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
          const alpha = pixels[(y * canvas.width + x) * 4 + 3];
          if (!alpha) continue;
          visible++; if (alpha < 160) soft++;
          // The plume stays above the engine: it cannot wash over the wheels,
          // rear body, or the outer frame edges.
          if (x < 30 || x > 650 || y < 5 || y > 540) outsidePlume++;
        }
        return { visible, soft, outsidePlume };
      });
      suite.check(`${device} soft smoke rises above the engine during closure and stays clear of wheels and frame edges`, smoke.visible > 500 && smoke.soft / smoke.visible > .95 && smoke.outsidePlume === 0, smoke);
      await page.screenshot({ path: resolve(suite.output, `${device}-hood-closing.png`) });
      await waitForSteadyLights(page);
      const final = await finalFramePixels(page);
      suite.check(`${device} smoke fully clears for the frozen lit ending`, await page.locator('.rs5-smoke').evaluate((canvas) => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return false;
        return true;
      }));
      await page.screenshot({ path: resolve(suite.output, `${device}-lights-on.png`) });
      const mechanism = await recordedMechanismPixels(page);
      suite.check(`${device} open, moving, and closed hood plus engine retain the recorded photographic detail`, mechanism.every((region) => region.opaqueFraction > .95 && region.meanError < 3 && region.alphaMeanError < 2 && region.dynamicRange > 8), mechanism);
      const fixedBody = await fixedBodyAcrossFrames(page);
      suite.check(`${device} all 47 hood poses preserve original lamp housings, fenders, bumper, roof, windshield, door, and rear body exactly`, fixedBody.every((region) => region.frames.length === 47 && region.changed === 0 && region.alphaChanged === 0), fixedBody);
      suite.check(`${device} fixed body checks contain photographic detail and the complete outer rear silhouette`, fixedBody.every((region) => region.opaque > 100 && region.dynamicRange > 8) && fixedBody.find((region) => region.name === 'rear quarter and outer silhouette')?.transparent > 100, fixedBody);
      const staticSamples = await page.evaluate(() => window.hoodStaticSamples);
      const sampledIndices = staticSamples.map((sample) => sample.frameIndex);
      suite.check(`${device} real playback preserves the photographic body in intermediate frames across all four atlases`, sampledIndices.length >= 18 && sampledIndices.includes(0) && sampledIndices.includes(46) && [0, 1, 2, 3].every((part) => sampledIndices.some((index) => Math.floor(index / 12) === part)) && staticSamples.every((sample) => sample.regions.every((region) => region.changed === 0 && region.alphaChanged === 0)), staticSamples);
      const restoredGrille = await restoredGrillePixels(page);
      suite.check(`${device} grille and badge region match the original sharp photograph before headlight ignition`, restoredGrille.every((region) => region.captured && region.opaqueFraction > .95 && region.meanError < 3), restoredGrille);
      suite.check(`${device} sequence changes both car pixels and the open-to-closed silhouette`, final.changedFraction > .025 && final.alphaChangedFraction > .005, final);
      suite.check(`${device} sharp wheels and door remain pixel-identical during closure`, final.staticRegions.every((region) => region.changed === 0 && region.opaque > region.box[2] * region.box[3] * .9), final.staticRegions);
      suite.check(`${device} closed pose with light overlays agrees with the transparent lit poster`, final.posterMeanError < 3 && final.alphaMeanError < 1 && final.cornerAlpha === 0 && final.transparentFraction > .2, final);
      suite.check(`${device} timeline stops at 3.5s on the settled closed pose`, final.frameIndex === 46 && final.mediaTime === 3.5 && final.dip === 0, final);
      await page.waitForTimeout(220);
      const frozen = await finalFramePixels(page);
      suite.check(`${device} final frame remains frozen with no loop or later redraw`, frozen.hash === final.hash && frozen.mediaTime === final.mediaTime && frozen.phase === 'complete', { final, frozen });
      const samples = await page.evaluate(() => window.hoodSamples);
      const lightStages = [...new Set(samples.map((sample) => sample.lightStage).filter(Boolean))];
      const firstLed = samples.find((sample) => sample.lightStage === 'led'), firstHeadlights = samples.find((sample) => sample.lightStage === 'headlights');
      suite.check(`${device} the closed hood is followed by LED running lights and then headlights without replacing its pose`, lightStages.join(',') === 'off,led,headlights' && samples.some((sample) => sample.frameIndex === 46 && sample.lightStage === 'off') && firstLed?.frameIndex === 46 && firstLed.mediaTime >= 2.15 && firstLed.mediaTime < 2.3 && firstHeadlights?.frameIndex === 46 && firstHeadlights.mediaTime >= 2.85 && firstHeadlights.mediaTime < 3 && firstHeadlights.mediaTime - firstLed.mediaTime >= .6, { lightStages, firstLed, firstHeadlights });
      const lightPixels = await page.evaluate(() => {
        const snapshots = window.hoodLightSnapshots;
        if (!['off', 'led', 'headlights'].every((stage) => snapshots[stage])) return { captured: Object.keys(snapshots) };
        const regions = [
          { name: 'near LED rail', box: [408, 317, 119, 18], role: 'rail' },
          { name: 'far LED rail', box: [103, 297, 47, 27], role: 'rail' },
          { name: 'near projector core', box: [499, 305, 9, 9], role: 'projector' },
          { name: 'far projector core', box: [116, 303, 7, 7], role: 'projector' }
        ];
        const luminance = (pixels, i) => .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
        return { captured: Object.keys(snapshots), regions: regions.map((region) => {
          const [left, top, width, height] = region.box;
          let ledDelta = 0, headlightDelta = 0, ledLit = 0, changed = 0;
          for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) {
            const i = (y * 1080 + x) * 4;
            const off = luminance(snapshots.off.pixels, i), led = luminance(snapshots.led.pixels, i), headlights = luminance(snapshots.headlights.pixels, i);
            ledDelta += Math.abs(led - off); headlightDelta += headlights - off;
            if (led - off > 18) ledLit++;
            if (Math.abs(led - off) > 3) changed++;
          }
          return { ...region, ledDelta: ledDelta / (width * height), headlightDelta: headlightDelta / (width * height), ledLit, changed };
        }) };
      });
      suite.check(`${device} LED rails brighten while both projector cores stay dark until headlights ignite`, lightPixels.regions?.filter((region) => region.role === 'rail').every((region) => region.ledLit > 10) && lightPixels.regions?.filter((region) => region.role === 'projector').every((region) => region.ledDelta < 2 && region.ledLit === 0 && region.headlightDelta > 20), lightPixels);
      const lightGeometry = await page.evaluate(() => {
        const snapshots = window.hoodLightSnapshots;
        if (!['off', 'led', 'headlights'].every((stage) => snapshots[stage])) return { captured: Object.keys(snapshots) };
        // Light may alter the lamps and their bounded soft spill. All other
        // body pixels, including the roof/cowl, must stay literally fixed.
        const support = [34, 225, 628, 502];
        return { captured: Object.keys(snapshots), stages: ['led', 'headlights'].map((stage) => {
          const before = snapshots.off.pixels, after = snapshots[stage].pixels;
          let alphaChanged = 0, outsideLightChanged = 0, changed = 0;
          const protectedRegions = [
            { name: 'roof', box: [540, 130, 250, 55] },
            { name: 'cowl', box: [440, 205, 100, 20] },
            { name: 'windshield', box: [550, 160, 100, 60] },
            { name: 'front wheel', box: [587, 353, 70, 102] },
            { name: 'rear wheel', box: [916, 339, 32, 78] },
            { name: 'door', box: [750, 300, 110, 80] }
          ].map((region) => ({ ...region, changed: 0, opaque: 0 }));
          for (let i = 0; i < before.length; i += 4) {
            const x = (i / 4) % 1080, y = Math.floor(i / 4 / 1080);
            if (before[i + 3] !== after[i + 3]) alphaChanged++;
            const differs = [0, 1, 2].some((channel) => before[i + channel] !== after[i + channel]);
            if (differs) {
              changed++;
              if (x < support[0] || x >= support[2] || y < support[1] || y >= support[3]) outsideLightChanged++;
            }
            for (const region of protectedRegions) {
              const [left, top, width, height] = region.box;
              if (x < left || x >= left + width || y < top || y >= top + height) continue;
              if (before[i + 3] > 240) region.opaque++;
              if (differs || before[i + 3] !== after[i + 3]) region.changed++;
            }
          }
          return { stage, frameIndex: snapshots[stage].frameIndex, alphaChanged, outsideLightChanged, changed, protectedRegions };
        }) };
      });
      suite.check(`${device} switching lights preserves every silhouette pixel and all body pixels outside the lamp spill`, lightGeometry.stages?.every((stage) => stage.frameIndex === 46 && stage.alphaChanged === 0 && stage.outsideLightChanged === 0 && stage.changed > 20), lightGeometry);
      suite.check(`${device} roof, cowl, windshield, wheels, and door stay fixed when the lights ignite`, lightGeometry.stages?.every((stage) => stage.protectedRegions.every((region) => region.changed === 0 && region.opaque > 0)), lightGeometry);
      const phases = [...new Set(samples.map((s) => s.phase).filter(Boolean))];
      suite.check(`${device} sequence advances from decoded open frame through closing to complete`, ['open', 'closing', 'complete'].every((phase, index, order) => phases.includes(phase) && (!index || phases.indexOf(phase) > phases.indexOf(order[index - 1]))), phases);
      const indices = samples.filter((sample) => ['open', 'closing', 'complete'].includes(sample.phase)).map((sample) => sample.frameIndex);
      suite.check(`${device} the base, both light layers, and four atlases load once with no frame reversal or replay`, basePaths.size === 1 && ledPaths.size === 1 && headlightPaths.size === 1 && atlasPaths.size === 4 && indices[0] === 0 && indices.at(-1) === 46 && indices.some((index) => index > 11 && index < 36) && indices.every((index, position) => Number.isInteger(index) && index >= 0 && index <= 46 && (position <= indices.findIndex((value) => value >= 44) ? !position || index >= indices[position - 1] : index >= 40)), { base: [...basePaths], led: [...ledPaths], headlights: [...headlightPaths], atlases: [...atlasPaths], indices: [...new Set(indices)] });
      const moving = samples.filter((sample) => ['open', 'closing', 'complete'].includes(sample.phase));
      const shifted = moving.find((sample) => sample.body.some((value, index) => Math.abs(value - moving[0].body[index]) >= .1));
      suite.check(`${device} canvas stage position and dimensions remain fixed throughout playback`, moving.length > 10 && !shifted, { initial: moving[0], shifted });
      const shiftedFloor = moving.find((sample) => sample.floor.some((value, index) => Math.abs(value - moving[0].floor[index]) >= .1));
      suite.check(`${device} reflective floor stays aligned and stationary throughout playback`, moving.length > 10 && !shiftedFloor && moving.every((sample) => sample.floor.every((value, index) => Math.abs(value - sample.body[index]) < .5)), { initial: moving[0]?.floor, shiftedFloor });
      const closingPoses = samples.filter((sample) => sample.phase === 'closing' && sample.mediaTime < 1.2 && Number.isFinite(sample.pose));
      const speed = (from, to) => { const part = closingPoses.filter((sample) => sample.mediaTime >= from && sample.mediaTime < to); return part.length > 1 ? (part.at(-1).pose - part[0].pose) / (part.at(-1).mediaTime - part[0].mediaTime) : NaN; };
      suite.check(`${device} hood accelerates like a falling bonnet instead of moving at a constant rate`, speed(.9, 1.2) > speed(.1, .45) * 2.5, { early: speed(.1, .45), late: speed(.9, 1.2) });
      suite.check(`${device} poses between recorded frames are blended for smooth motion`, closingPoses.some((sample) => Math.abs(sample.pose - Math.round(sample.pose)) > .1), closingPoses.slice(0, 12).map((sample) => sample.pose));
      const dips = samples.filter((sample) => Number.isFinite(sample.dip));
      suite.check(`${device} body settles on its suspension after the latch and returns exactly to rest`, dips.some((sample) => Math.abs(sample.dip) > .3 && sample.mediaTime > 1.2 && sample.mediaTime < 1.5) && dips.filter((sample) => sample.mediaTime < 1.2 || sample.mediaTime > 1.95).every((sample) => sample.dip === 0), dips.filter((sample) => sample.dip).slice(0, 10));
      const opened = samples.find((sample) => sample.phase === 'open'), closing = samples.find((sample) => sample.phase === 'closing'), complete = samples.find((sample) => sample.phase === 'complete');
      const timing = opened && closing && complete ? { hold: closing.time - opened.time, playback: complete.time - closing.time } : null;
      suite.check(`${device} holds the initial frame for 300ms and plays the 3.5-second sequence once`, timing && timing.hold >= 200 && timing.hold <= 700 && timing.playback >= 3200 && timing.playback <= 4500, timing);
      suite.check(`${device} uses transparent raster frames without a stage mask, matte, or hood mesh`, await page.locator('#hero-car').evaluate((car) => {
        const canvasStyle = getComputedStyle(car.querySelector('#rs5HeroCanvas')), stageStyle = getComputedStyle(car);
        return !car.querySelector('.hood-mesh,.car-hood,.car-engine,.car-lights') && canvasStyle.clipPath === 'none' && stageStyle.maskImage === 'none' && stageStyle.backgroundImage === 'none' && stageStyle.backgroundColor === 'rgba(0, 0, 0, 0)';
      }));
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
    await Promise.race([seen, new Promise((_, reject) => setTimeout(() => reject(new Error('No hood frame load was started')), 5000))]);
    await page.waitForFunction(() => document.querySelector('.rs5-poster').complete && document.querySelector('.rs5-poster').naturalWidth > 0);
    suite.check('slow frame decoding never flashes the closed poster before the open frame', await page.locator('#hero-car').evaluate((car) => car.dataset.phase === 'loading' && car.classList.contains('hood-loading') && Number(getComputedStyle(car).opacity) === 0));
    releaseLoading();
    await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'open');
    const painted = await firstFramePixels(page);
    suite.check('first paint removes loading only after a decoded transparent open-frame cell exists', painted.phase === 'open' && painted.meanError < .5 && painted.alphaMeanError < .5 && painted.transparentFraction > .2 && painted.opaqueFraction > .06 && await page.locator('#hero-car').evaluate((car) => !car.classList.contains('hood-loading') && Number(getComputedStyle(car).opacity) > .99), painted);
  } finally { if (releaseLoading) releaseLoading(); await loading.close(); }

  const loadingBase = await newContext(browser);
  let releaseBase;
  try {
    const page = await loadingBase.newPage(); suite.watch(page, 'base loading');
    let requested;
    const seen = new Promise((resolveSeen) => { requested = resolveSeen; });
    const gate = new Promise((resolveGate) => { releaseBase = resolveGate; });
    await page.route('**/assets/car-studio-base.webp*', async (route) => { requested(); await gate; await route.continue(); });
    await navigate(page, suite.url());
    await Promise.race([seen, new Promise((_, reject) => setTimeout(() => reject(new Error('No car photograph load was started')), 5000))]);
    await page.waitForFunction(() => performance.getEntriesByType('resource').filter((entry) => /car-hood-frames-\d\.webp/.test(entry.name)).length === 4);
    await page.waitForTimeout(300);
    suite.check('decoded hood frames cannot reveal the recorded front before the fixed body parts are ready', await page.locator('#hero-car').evaluate((car) => car.dataset.phase === 'loading' && Number(getComputedStyle(car).opacity) === 0));
    releaseBase();
    await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'open');
    const painted = await firstFramePixels(page);
    suite.check('the first visible car waits for both decoded body parts and recorded front', painted.phase === 'open' && painted.meanError < .5 && painted.alphaMeanError < .5 && painted.opaqueFraction > .06, painted);
  } finally { if (releaseBase) releaseBase(); await loadingBase.close(); }

  const interrupted = await newContext(browser);
  try {
    const page = await interrupted.newPage(); suite.watch(page, 'language interruption');
    let requests = 0;
    page.on('request', (request) => { if (isMotionAsset(request.url())) requests++; });
    await navigate(page, suite.url());
    await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'closing');
    const oldCanvas = await page.locator('#rs5HeroCanvas').elementHandle(), before = requests;
    await page.click('[data-act="lang"]');
    await waitForSteadyLights(page);
    const stoppedAt = await oldCanvas.evaluate((canvas) => canvas.dataset.mediaTime);
    await page.waitForTimeout(300);
    suite.check('language change stops the old animation and uses the final poster without another load', requests === before && await oldCanvas.evaluate((canvas, at) => !canvas.isConnected && canvas.dataset.mediaTime === at, stoppedAt) && await page.locator('#hero-car').evaluate((car) => car.dataset.frame === 'poster'));
  } finally { await interrupted.close(); }

  const navigation = await newContext(browser);
  try {
    const page = await navigation.newPage(); suite.watch(page, 'navigation interruption');
    await navigate(page, suite.url());
    await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'closing');
    const oldCanvas = await page.locator('#rs5HeroCanvas').elementHandle();
    await page.click('.hero a[href="#book"]');
    await page.waitForSelector('[data-form="book"]');
    const stoppedAt = await oldCanvas.evaluate((canvas) => canvas.dataset.mediaTime);
    await page.waitForTimeout(300);
    suite.check('leaving the hero cancels drawing on the detached canvas', await oldCanvas.evaluate((canvas, at) => !canvas.isConnected && canvas.dataset.mediaTime === at, stoppedAt));
    await page.evaluate(() => { location.hash = ''; });
    await waitForSteadyLights(page);
    suite.check('returning after interrupted playback shows the final poster without replay', await page.locator('#hero-car').evaluate((car) => car.dataset.frame === 'poster'));
  } finally { await navigation.close(); }

  const reduced = await newContext(browser, { reducedMotion: 'reduce' });
  try {
    const page = await reduced.newPage(); suite.watch(page, 'reduced motion');
    let requests = 0;
    page.on('request', (request) => { if (isMotionAsset(request.url())) requests++; });
    await navigate(page, suite.url()); await waitForSteadyLights(page);
    suite.check('reduced motion shows a decoded final photograph without fetching the base, light layers, or frame atlases', requests === 0 && await page.locator('#hero-car').evaluate((car) => car.dataset.phase === 'complete' && car.dataset.frame === 'poster' && car.classList.contains('lights-on')));
  } finally { await reduced.close(); }

  const changedPreference = await newContext(browser);
  try {
    const page = await changedPreference.newPage(); suite.watch(page, 'motion preference change');
    await navigate(page, suite.url());
    await page.waitForFunction(() => document.querySelector('#hero-car').dataset.phase === 'closing');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await waitForSteadyLights(page);
    suite.check('enabling reduced motion during closure immediately shows the final poster', await page.locator('#hero-car').evaluate((car) => car.dataset.frame === 'poster'));
  } finally { await changedPreference.close(); }

  // Blocked video autoplay (iOS Low Power Mode, some browsers) no longer
  // matters: the animation runs on its own clock and still plays through.
  const blocked = await newContext(browser);
  try {
    await blocked.addInitScript(() => { HTMLMediaElement.prototype.play = function () { return Promise.reject(Object.assign(new Error('Playback intentionally blocked'), { name: 'NotAllowedError' })); }; });
    const page = await blocked.newPage(); suite.watch(page, 'autoplay blocked');
    await navigate(page, suite.url()); await waitForSteadyLights(page);
    suite.check('blocked media autoplay still plays the full hood sequence', await page.locator('#hero-car').evaluate((car) => car.dataset.frame === 'video' && car.dataset.phase === 'complete' && Number(car.querySelector('#rs5HeroCanvas').dataset.mediaTime) === 3.5));
  } finally { await blocked.close(); }

  for (const failure of ['missing', 'corrupt', 'missing base', 'missing atlas', 'missing LED', 'missing headlights']) {
    const context = await newContext(browser);
    try {
      const page = await context.newPage(); watchExpectedMediaFailure(page, failure);
      if (failure === 'missing') await page.route(mediaPattern, (route) => route.fulfill({ status: 404, contentType: 'image/webp', body: '' }));
      if (failure === 'corrupt') await page.route(mediaPattern, (route) => route.fulfill({ status: 200, contentType: 'image/webp', body: Buffer.from('invalid media') }));
      if (failure === 'missing base') await page.route('**/assets/car-studio-base.webp*', (route) => route.fulfill({ status: 404, contentType: 'image/webp', body: '' }));
      if (failure === 'missing atlas') await page.route('**/assets/car-hood-frames-2.webp*', (route) => route.fulfill({ status: 404, contentType: 'image/webp', body: '' }));
      if (failure === 'missing LED') await page.route('**/assets/car-led.webp*', (route) => route.fulfill({ status: 404, contentType: 'image/webp', body: '' }));
      if (failure === 'missing headlights') await page.route('**/assets/car-headlights.webp*', (route) => route.fulfill({ status: 404, contentType: 'image/webp', body: '' }));
      await navigate(page, suite.url()); await waitForSteadyLights(page);
      suite.check(`${failure} media safely resolves to the visible final photograph`, await page.locator('#hero-car').evaluate((car) => car.dataset.frame === 'poster' && car.dataset.phase === 'complete' && car.classList.contains('lights-on') && !car.classList.contains('hood-loading')));
    } finally { await context.close(); }
  }
});
