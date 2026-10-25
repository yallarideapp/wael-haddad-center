import { resolve } from 'node:path';
import { createSuite, horizontalOverflow, navigate, newContext, waitForFonts, waitForSteadyLights } from './helpers.mjs';

const suite = createSuite('hero');
const isMotionAsset = (url) => /\/assets\/(?:car-studio-base\.webp|car-led\.webp|car-hood-(?:animation\.mp4|frames-\d\.webp))/.test(url);

async function heroState(page) {
  return page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const car = rect('#hero-car'), poster = rect('.rs5-poster'), canvas = rect('#rs5HeroCanvas'), floor = rect('.rs5-floor');
    const dock = document.querySelector('.dock');
    const usableBottom = dock && getComputedStyle(dock).display !== 'none' ? dock.getBoundingClientRect().top : innerHeight;
    const fits = (selector) => {
      const element = document.querySelector(selector), bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
      return bounds.width > 0 && bounds.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && bounds.top >= -1 && bounds.bottom <= usableBottom + 1;
    };
    const row = document.querySelector('.hero-specialism');
    const marques = [...row.querySelectorAll('.marque')];
    const image = document.querySelector('.rs5-poster');
    const source = document.querySelector('.rs5-source'), canvasElement = document.querySelector('#rs5HeroCanvas');
    const floorImage = document.querySelector('.rs5-floor');
    const stageStyle = getComputedStyle(document.querySelector('#hero-car'));
    return {
      posterLoaded: image.complete && image.naturalWidth === 1080 && image.naturalHeight === 600,
      canvasHasHighResolution: canvasElement.width === 1080 && canvasElement.height === 600,
      posterAndCanvasAligned: ['x', 'y', 'width', 'height'].every((key) => Math.abs(poster[key] - canvas[key]) < .5),
      stageHasVideoAspect: Math.abs(car.width / car.height - 1.8) < .005,
      stageHasResponsiveScale: innerWidth >= 1101 ? car.width >= Math.min(innerWidth, 1440) * .57 && car.width <= Math.min(innerWidth, 1440) * .7 : (innerWidth > 760 || car.width <= 520.5) && car.left >= -1 && car.right <= innerWidth + 1,
      floorLoaded: floorImage.complete && floorImage.naturalWidth === 1080 && floorImage.naturalHeight === 600,
      floorAndCarAligned: ['x', 'y', 'width', 'height'].every((key) => Math.abs(floor[key] - canvas[key]) < .5),
      stageHasNoMaskOrMatte: stageStyle.maskImage === 'none' && stageStyle.backgroundImage === 'none' && stageStyle.backgroundColor === 'rgba(0, 0, 0, 0)',
      sourceIsInlineMuted: source.muted && source.playsInline && source.getAttribute('data-src').includes('assets/car-hood-animation.mp4'),
      titleVisible: fits('.hero h1'), bookingVisible: fits('.hero a[href="#book"]'),
      contactVisible: fits('.hero a[href^="https://wa.me/"]'), marquesVisible: fits('.hero-specialism'),
      carVisible: car.width > 0 && car.height > 0 && car.top >= 0 && car.bottom <= usableBottom + 1,
      namesCorrect: marques.map((marque) => marque.querySelector('span').textContent).join(' · ') === 'Audi · Volkswagen · Porsche',
      logosLoaded: marques.length === 3 && marques.every((marque) => {
        const logo = marque.querySelector('img'); return logo.complete && logo.naturalWidth > 0 && logo.alt === '';
      }),
      logosAuthentic: getComputedStyle(row.querySelector('.marque-porsche img')).filter === 'none' && marques.every((marque) => getComputedStyle(marque.querySelector('img')).backgroundColor === 'rgba(0, 0, 0, 0)'),
      logosBesideNames: marques.every((marque) => {
        const logo = marque.querySelector('img').getBoundingClientRect(), label = marque.querySelector('span').getBoundingClientRect();
        return logo.width > 0 && logo.height > 0 && logo.right <= label.left + 1 && Math.abs((logo.top + logo.bottom) - (label.top + label.bottom)) <= 12;
      }),
      orderIsLeftToRight: getComputedStyle(row).direction === 'ltr' && marques.every((marque, index) => index === 0 || marque.getBoundingClientRect().left > marques[index - 1].getBoundingClientRect().right),
      rowFits: row.getBoundingClientRect().width > 0 && row.getBoundingClientRect().height > 0 && row.scrollWidth <= row.clientWidth + 1 && row.getBoundingClientRect().left >= -1 && row.getBoundingClientRect().right <= innerWidth + 1,
      contactLinkCorrect: document.querySelector('.hero a[href^="https://wa.me/"]').href.startsWith('https://wa.me/962795866455?text='),
      carBottom: car.bottom, usableBottom
    };
  });
}

await suite.run(async (browser) => {
  const desktop = await newContext(browser, { viewport: { width: 1366, height: 768 }, colorScheme: 'light' });
  const page = await desktop.newPage();
  suite.watch(page, 'video introduction');
  let releaseVideo, videoRequested;
  const videoGate = new Promise((resolveGate) => { releaseVideo = resolveGate; });
  const requestSeen = new Promise((resolveSeen) => { videoRequested = resolveSeen; });
  let motionRequests = 0;
  page.on('request', (request) => { if (isMotionAsset(request.url())) motionRequests++; });
  await page.route('**/assets/car-hood-animation.mp4*', async (route) => { videoRequested(); await videoGate; await route.continue(); });
  try {
    await navigate(page, suite.url());
    await Promise.race([requestSeen, new Promise((_, reject) => setTimeout(() => reject(new Error('Hood video was not requested.')), 5000))]);
    suite.check('undecoded video keeps the car hidden rather than flashing the closed poster', await page.locator('#hero-car').evaluate((car) => car.classList.contains('hood-loading') && Number(getComputedStyle(car).opacity) === 0));
    await page.evaluate(() => {
      window.testTextSamples = [];
      const car = document.querySelector('#hero-car');
      const sample = () => {
        const title = document.querySelector('.hero h1');
        if (!title || !car.isConnected) return;
        const style = getComputedStyle(title);
        window.testTextSamples.push({ opacity: Number(style.opacity), sheen: style.backgroundPosition });
        if (car.dataset.phase !== 'complete') requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    releaseVideo();
    await waitForSteadyLights(page);
    const textSamples = await page.evaluate(() => window.testTextSamples);
    suite.check('main heading fades into a readable final state', textSamples.some((sample) => sample.opacity < .8) && textSamples.some((sample) => sample.opacity > .99), textSamples);
    suite.check('metallic light travels across the heading', new Set(textSamples.map((sample) => sample.sheen)).size > 2);
    suite.check('photographic sequence finishes with the high-resolution final RGBA frame', await page.locator('#hero-car').evaluate((car) => {
      const video = car.querySelector('.rs5-source'), canvas = car.querySelector('#rs5HeroCanvas');
      return car.dataset.phase === 'complete' && car.classList.contains('lights-on') && car.dataset.frame === 'video' && video.videoWidth === 720 && video.videoHeight === 400 && video.paused && canvas.width === 1080 && canvas.height === 600 && Number(canvas.dataset.frameIndex) === 47 && canvas.dataset.lightStage === 'headlights';
    }));
    await waitForFonts(page);
    suite.check('desktop booking is visible immediately', (await heroState(page)).bookingVisible);
    const requestsBeforeRerender = motionRequests;
    await page.click('[data-act="lang"]');
    await waitForSteadyLights(page);
    suite.check('language rerender does not replay the text introduction', await page.locator('.hero h1').evaluate((title) => getComputedStyle(title).animationName === 'none' && Number(getComputedStyle(title).opacity) === 1));
    suite.check('switching language uses the steady final photograph without loading motion assets again', motionRequests === requestsBeforeRerender && await page.locator('#hero-car').evaluate((car) => car.dataset.frame === 'poster' && car.dataset.phase === 'complete' && !car.querySelector('.rs5-source').currentSrc));
    await page.click('.hero a[href="#book"]');
    await page.waitForSelector('[data-form="book"]');
    await page.evaluate(() => { location.hash = ''; });
    await waitForSteadyLights(page);
    suite.check('returning from booking keeps the final photograph without replay', motionRequests === requestsBeforeRerender && await page.locator('#hero-car').evaluate((car) => car.dataset.frame === 'poster' && car.classList.contains('lights-on')));
  } finally {
    releaseVideo();
    await desktop.close();
  }

  for (const language of ['ar', 'en']) {
    for (const colorScheme of ['light', 'dark']) {
      for (const [device, width, height] of [['phone', 390, 664], ['desktop', 1366, 768]]) {
        const context = await newContext(browser, { viewport: { width, height }, colorScheme }, language);
        try {
          const focused = await context.newPage();
          suite.watch(focused, `${language}/${device}/${colorScheme}`);
          await navigate(focused, suite.url());
          await waitForSteadyLights(focused);
          await waitForFonts(focused);
          await focused.waitForFunction(() => [...document.querySelectorAll('.hero-specialism img')].every((image) => image.complete && image.naturalWidth > 0));
          const state = await heroState(focused), overflow = await horizontalOverflow(focused);
          suite.check(`${language}/${device}/${colorScheme} hero and marque logos`, Object.values(state).filter((value) => typeof value === 'boolean').every(Boolean) && !overflow.length, { state, overflow });
          await focused.screenshot({ path: resolve(suite.output, `${language}-${device}-${colorScheme}.png`) });
          if (device === 'phone' && colorScheme === 'light') {
            await focused.click('[data-act="menu"]');
            await waitForSteadyLights(focused);
            suite.check(`${language} menu rerender keeps the final photograph without replay`, await focused.locator('#hero-car').evaluate((car) => car.dataset.frame === 'poster' && car.classList.contains('lights-on') && !car.querySelector('.rs5-source').currentSrc));
          }
        } finally { await context.close(); }
      }
    }
  }

  for (const language of ['ar', 'en']) {
    for (const width of [320, 768]) {
      const context = await newContext(browser, { viewport: { width, height: 900 }, reducedMotion: 'reduce' }, language);
      try {
        const narrow = await context.newPage();
        suite.watch(narrow, `${language}/${width}px`);
        await navigate(narrow, suite.url());
        await waitForSteadyLights(narrow);
        await waitForFonts(narrow);
        await narrow.waitForFunction(() => [...document.querySelectorAll('.hero-specialism img')].every((image) => image.complete && image.naturalWidth > 0));
        const state = await heroState(narrow), overflow = await horizontalOverflow(narrow);
        suite.check(`${language}/${width}px marque row fits`, state.rowFits && state.namesCorrect && state.logosLoaded && state.logosBesideNames && state.orderIsLeftToRight && !overflow.length, { state, overflow });
      } finally { await context.close(); }
    }
  }

  const reduced = await newContext(browser, { viewport: { width: 390, height: 664 }, reducedMotion: 'reduce' });
  try {
    const reducedPage = await reduced.newPage();
    suite.watch(reducedPage, 'reduced motion');
    let motionRequests = 0;
    reducedPage.on('request', (request) => { if (isMotionAsset(request.url())) motionRequests++; });
    await navigate(reducedPage, suite.url());
    await waitForSteadyLights(reducedPage);
    suite.check('reduced motion keeps text visible without fade or sheen', await reducedPage.locator('.hero h1').evaluate((title) => getComputedStyle(title).animationName === 'none' && Number(getComputedStyle(title).opacity) === 1));
    suite.check('reduced motion shows the final lit photograph without loading video, base, LED layer, or atlases', motionRequests === 0 && await reducedPage.locator('#hero-car').evaluate((car) => car.dataset.frame === 'poster' && car.dataset.phase === 'complete' && !car.querySelector('.rs5-source').currentSrc));
    await reducedPage.screenshot({ path: resolve(suite.output, 'reduced-motion-phone.png') });
  } finally { await reduced.close(); }
});
