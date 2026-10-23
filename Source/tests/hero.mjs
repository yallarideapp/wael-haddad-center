import { resolve } from 'node:path';
import { createSuite, horizontalOverflow, navigate, newContext, waitForFonts, waitForSteadyLights } from './helpers.mjs';

const suite = createSuite('hero');

async function heroState(page) {
  return page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const car = rect('#hero-car'), photo = rect('#hero-car img'), overlay = rect('.car-lights');
    const dock = document.querySelector('.dock');
    const usableBottom = dock && getComputedStyle(dock).display !== 'none' ? dock.getBoundingClientRect().top : innerHeight;
    const fits = (selector) => {
      const element = document.querySelector(selector), bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
      return bounds.width > 0 && bounds.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && bounds.top >= -1 && bounds.bottom <= usableBottom + 1;
    };
    const row = document.querySelector('.hero-specialism');
    const marques = [...row.querySelectorAll('.marque')];
    const image = document.querySelector('#hero-car img');
    return {
      photoLoaded: image.complete && image.naturalWidth > 0,
      imageAndLightsAligned: ['x', 'y', 'width', 'height'].every((key) => Math.abs(photo[key] - overlay[key]) < 0.5),
      titleVisible: fits('.hero h1'), bookingVisible: fits('.hero a[href="#book"]'),
      contactVisible: fits('.hero a[href^="https://wa.me/"]'), marquesVisible: fits('.hero-specialism'),
      carBodyAndLampsVisible: car.width > 0 && car.height > 0 && car.top >= 0 && car.top + car.height * 0.85 <= usableBottom + 1,
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
      carBodyBottom: car.top + car.height * 0.85, usableBottom
    };
  });
}

await suite.run(async (browser) => {
  // Hold the photo so the short animation can be observed from its true start.
  const desktop = await newContext(browser, { viewport: { width: 1366, height: 768 }, colorScheme: 'light' });
  const page = await desktop.newPage();
  suite.watch(page, 'LED sequence');
  let releasePhoto, photoRequested;
  const photoGate = new Promise((resolveGate) => { releasePhoto = resolveGate; });
  const requestSeen = new Promise((resolveSeen) => { photoRequested = resolveSeen; });
  await page.route('**/assets/coupe-*.webp*', async (route) => { photoRequested(); await photoGate; await route.continue(); });
  try {
    await navigate(page, suite.url());
    await Promise.race([requestSeen, new Promise((_, reject) => setTimeout(() => reject(new Error('Car photo was not requested.')), 5000))]);
    suite.check('an incomplete photo keeps the lamps pending', await page.locator('#hero-car').evaluate((car) => car.classList.contains('lights-pending') && !car.querySelector('img').complete));
    await page.evaluate(() => {
      window.testLampSamples = [];
      window.testTextSamples = [];
      const car = document.querySelector('#hero-car'), lamp = car.querySelector('.lamp-near .lamp-stroke');
      let started;
      const sample = () => {
        const title = document.querySelector('.hero h1');
        if (!title || !car.isConnected) return;
        const titleStyle = getComputedStyle(title);
        window.testTextSamples.push({ opacity: parseFloat(titleStyle.opacity), sheen: titleStyle.backgroundPosition });
        if (car.classList.contains('lights-starting')) {
          started ??= performance.now();
          const style = getComputedStyle(lamp);
          window.testLampSamples.push({ ms: performance.now() - started, offset: parseFloat(style.strokeDashoffset), opacity: parseFloat(style.opacity), photoLoaded: car.querySelector('img').complete && car.querySelector('img').naturalWidth > 0 });
          if (performance.now() - started > 2200) return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    releasePhoto();
    await waitForSteadyLights(page);
    const samples = await page.evaluate(() => window.testLampSamples);
    const textSamples = await page.evaluate(() => window.testTextSamples);
    suite.check('main heading fades into a readable final state', textSamples.some((sample) => sample.opacity < 0.8) && textSamples.some((sample) => sample.opacity > 0.99), textSamples);
    suite.check('metallic light travels across the heading', new Set(textSamples.map((sample) => sample.sheen)).size > 2);
    suite.check('LED traces progress to steady light', samples.some((sample) => sample.offset > 0.9) && samples.some((sample) => sample.offset > 0.01 && sample.offset < 0.99) && samples.some((sample) => sample.offset < 0.001 && sample.opacity > 0.99), samples);
    suite.check('illumination begins after the photo is decoded', samples.length > 0 && samples.every((sample) => sample.photoLoaded));
    await waitForFonts(page);
    suite.check('desktop booking is visible immediately', (await heroState(page)).bookingVisible);
    await page.click('[data-act="lang"]');
    suite.check('language rerender does not replay the text introduction', await page.locator('.hero h1').evaluate((title) => getComputedStyle(title).animationName === 'none' && parseFloat(getComputedStyle(title).opacity) === 1));
    suite.check('switching language keeps steady lights', await page.locator('#hero-car').evaluate((car) => car.classList.contains('lights-on') && getComputedStyle(car.querySelector('.lamp-stroke')).animationName === 'none'));
    await page.click('.hero a[href="#book"]');
    await page.waitForSelector('[data-form="book"]');
    await page.evaluate(() => { location.hash = ''; });
    await page.waitForSelector('#hero-car.lights-on');
    suite.check('returning from booking keeps the lamps lit', await page.locator('#hero-car').evaluate((car) => car.classList.contains('lights-on')));
  } finally {
    releasePhoto();
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
            suite.check(`${language} menu rerender keeps the lamps lit`, await focused.locator('#hero-car').evaluate((car) => car.classList.contains('lights-on')));
          }
        } finally {
          await context.close();
        }
      }
    }
  }

  // Smaller phones and tablet widths only need the compact marque row to fit.
  for (const language of ['ar', 'en']) {
    for (const width of [320, 768]) {
      const context = await newContext(browser, { viewport: { width, height: 900 }, reducedMotion: 'reduce' }, language);
      try {
        const narrow = await context.newPage();
        suite.watch(narrow, `${language}/${width}px`);
        await navigate(narrow, suite.url());
        await waitForFonts(narrow);
        await narrow.waitForFunction(() => [...document.querySelectorAll('.hero-specialism img')].every((image) => image.complete && image.naturalWidth > 0));
        const state = await heroState(narrow), overflow = await horizontalOverflow(narrow);
        suite.check(`${language}/${width}px marque row fits`, state.rowFits && state.namesCorrect && state.logosLoaded && state.logosBesideNames && state.orderIsLeftToRight && !overflow.length, { state, overflow });
      } finally {
        await context.close();
      }
    }
  }

  const reduced = await newContext(browser, { viewport: { width: 390, height: 664 }, reducedMotion: 'reduce' });
  try {
    const reducedPage = await reduced.newPage();
    suite.watch(reducedPage, 'reduced motion');
    await navigate(reducedPage, suite.url());
    suite.check('reduced motion keeps text visible without fade or sheen', await reducedPage.locator('.hero h1').evaluate((title) => getComputedStyle(title).animationName === 'none' && parseFloat(getComputedStyle(title).opacity) === 1));
    suite.check('reduced motion shows steady light without animation', await reducedPage.locator('#hero-car').evaluate((car) => car.classList.contains('lights-on') && [...car.querySelectorAll('.lamp-stroke')].every((lamp) => {
      const style = getComputedStyle(lamp); return style.animationName === 'none' && parseFloat(style.opacity) === 1 && parseFloat(style.strokeDashoffset) === 0;
    })));
    await reducedPage.screenshot({ path: resolve(suite.output, 'reduced-motion-phone.png') });
  } finally {
    await reduced.close();
  }
});
