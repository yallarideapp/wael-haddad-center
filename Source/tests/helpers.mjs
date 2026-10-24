import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function createSuite(name) {
  const base = new URL(process.argv[2] || process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/');
  base.hash = '';
  const outputRoot = process.argv[3] || process.env.TEST_RESULTS_DIR || fileURLToPath(new URL('./results/', import.meta.url));
  const output = resolve(outputRoot, name);
  mkdirSync(output, { recursive: true });
  const results = [], errors = [];
  const check = (label, pass, details) => {
    results.push({ name: label, pass: Boolean(pass), ...(details === undefined ? {} : { details }) });
  };
  return {
    base: base.href, output, results, errors, check,
    url(hash = '') { const url = new URL(base); url.hash = hash; return url.href; },
    watch(page, label = '') {
      page.on('pageerror', (error) => errors.push(`${label} page: ${error.message}`));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(`${label} console: ${message.text()}`); });
    },
    async run(test) {
      let browser;
      try {
        browser = await chromium.launch(process.env.PW_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE_PATH } : {});
        await test(browser);
      } catch (error) {
        check('test execution completed', false, error.stack || String(error));
      } finally {
        if (browser) await browser.close().catch((error) => errors.push(`browser close: ${error.message}`));
        const uniqueErrors = [...new Set(errors)];
        const passed = results.filter((result) => result.pass).length;
        const report = { suite: name, baseUrl: base.href, checked: results.length, passed, failed: results.length - passed, errors: uniqueErrors, results };
        writeFileSync(resolve(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(`${name}: ${passed}/${results.length} checks passed; ${uniqueErrors.length} errors. Results: ${output}`);
        for (const result of results.filter((result) => !result.pass)) console.error(`FAIL: ${result.name}`, result.details || '');
        for (const error of uniqueErrors) console.error(error);
        if (!results.length || passed !== results.length || uniqueErrors.length) process.exitCode = 1;
      }
    }
  };
}

export async function newContext(browser, options = {}, language = 'ar') {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, ...options });
  await context.addInitScript((lang) => { try { localStorage.setItem('wh-lang', lang); } catch { /* storage may be intentionally blocked */ } }, language);
  return context;
}

export async function navigate(page, url) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (response && !response.ok()) throw new Error(`HTTP ${response.status()}: ${url}`);
  await page.waitForSelector('#app .site-head, #app .a-head');
}

export async function waitForFonts(page) {
  await page.evaluate(async () => { if (document.fonts) await document.fonts.ready; });
}

export async function waitForSteadyLights(page) {
  await page.waitForFunction(() => {
    const car = document.querySelector('#hero-car');
    if (!car || car.dataset.phase !== 'complete' || !car.classList.contains('lights-on') || car.classList.contains('hood-loading')) return false;
    const poster = car.querySelector('.rs5-poster');
    if (!poster || !poster.complete || !poster.naturalWidth) return false;
    const painted = car.dataset.frame === 'video' ? car.querySelector('#rs5HeroCanvas') : car.dataset.frame === 'poster' ? poster : null;
    if (!painted) return false;
    const bounds = painted.getBoundingClientRect(), style = getComputedStyle(painted);
    return bounds.width > 0 && bounds.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > .99 && Number(getComputedStyle(car).opacity) > .99;
  });
}

export async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth, problems = [];
    if (document.documentElement.scrollWidth > width + 1) problems.push(`page width ${document.documentElement.scrollWidth}`);
    for (const element of document.querySelectorAll('body *')) {
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || element.closest('.tbl-wrap,.days,.a-tabs .wrap') || getComputedStyle(element).position === 'fixed') continue;
      if (bounds.right > width + 1 || bounds.left < -1) problems.push(`${element.getAttribute('class') || element.tagName}: ${Math.round(bounds.left)}..${Math.round(bounds.right)}`);
    }
    return problems.slice(0, 5);
  });
}
