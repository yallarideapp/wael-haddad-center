import { resolve } from 'node:path';
import { createSuite, horizontalOverflow, navigate, newContext, waitForFonts } from './helpers.mjs';

const suite = createSuite('smoke');
const sizes = [['phone', 390, 664], ['desktop', 1366, 768]];
const routes = ['', 'book', 'book-svc-oil', 'track', 'report-J1024', 'garage', 'admin', 'admin-bookings', 'admin-services', 'admin-settings', 'job-J1024'];

await suite.run(async (browser) => {
  for (const language of ['ar', 'en']) {
    for (const [device, width, height] of sizes) {
      for (const colorScheme of ['light', 'dark']) {
        const context = await newContext(browser, { viewport: { width, height }, colorScheme, deviceScaleFactor: 1 }, language);
        try {
          const page = await context.newPage();
          suite.watch(page, `${language}/${device}/${colorScheme}`);
          for (const route of routes) {
            const label = `${language}/${device}/${colorScheme} #${route || 'home'}`;
            const errorCount = suite.errors.length;
            try {
              await navigate(page, suite.url(route));
              if (await page.evaluate(() => window.WH_DEFAULTS.mode) !== 'demo') throw new Error('Run the full route matrix against Source/ in demo mode.');
              await waitForFonts(page);
              if (route === 'track') {
                await page.fill('#track-plate', '12-34567');
                await page.press('#track-plate', 'Enter');
                await page.waitForSelector('.status-card');
              }
              if (route === 'garage') {
                await page.fill('#garage-phone', '0791234567');
                await page.press('#garage-phone', 'Enter');
                await page.waitForSelector('.v-head');
              }
              const overflow = await horizontalOverflow(page);
              suite.check(label, !overflow.length && suite.errors.length === errorCount, { overflow, errors: suite.errors.slice(errorCount) });
              await page.screenshot({ path: resolve(suite.output, `${language}-${device}-${colorScheme}-${route || 'home'}.png`), fullPage: true });
            } catch (error) {
              suite.check(label, false, error.message);
            }
          }
        } finally {
          await context.close();
        }
      }
    }
  }
});
