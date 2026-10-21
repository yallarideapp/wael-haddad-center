import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSuite, navigate, newContext } from './helpers.mjs';

const suite = createSuite('flows');
const { check } = suite;
const base = suite.base;
await suite.run(async (browser) => {
  const uploadDirectory = mkdtempSync(join(tmpdir(), 'wael-haddad-test-'));
  try {
    const ctx = await newContext(browser, { viewport: { width: 390, height: 740 } });
    const page = await ctx.newPage();
    suite.watch(page, 'functional flow');
    const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('wh-demo-v1') || 'null'));

    // 1. booking via symptom chip on home
    await navigate(page, base);
    if (await page.evaluate(() => window.WH_DEFAULTS.mode) !== 'demo') throw new Error('The functional suite requires Source/ in demo mode.');
    await page.click('[data-act="sym"][data-id="heater"]');
    check('symptom panel updates', (await page.textContent('#sym-panel')).includes('التدفئة'));
    await page.click('#sym-panel a[href="#book-sym-heater"]');
    await page.waitForSelector('[data-form="book"]');
    check('symptom prefilled', await page.$eval('[data-act="pick"][data-key="ref"][data-val="heater"]', (e) => e.getAttribute('aria-checked') === 'true'));
    // Submit empty fields to show inline errors.
    await page.click('[data-form="book"] button[type="submit"]');
    check('missing fields listed', (await page.textContent('#book-summary')).includes('ناقص'));
    await page.click('[data-act="pick"][data-key="brand"][data-val="Audi"]');
    await page.fill('#bk-model', 'Q5');
    await page.selectOption('#bk-year', '2018');
    const day = await page.$$('[data-act="pick"][data-key="date"]');
    await day[1].click();
    await page.click('[data-act="pick"][data-key="period"][data-val="am"]');
    await page.fill('#bk-name', 'تجربة');
    const submitBeforeTyping = await page.$('[data-form="book"] button[type="submit"]');
    await page.fill('#bk-phone', '٠٧٩١١١٢٢٣٣');
    check('Arabic digits converted without replacing the submit button', (await page.inputValue('#bk-phone')) === '0791112233' && await submitBeforeTyping.evaluate((element) => element.isConnected && element === document.querySelector('[data-form="book"] button[type="submit"]')));
    check('summary shows car', (await page.textContent('#book-summary')).includes('Audi Q5 2018'));
    await page.click('[data-form="book"] button[type="submit"]');
    await page.waitForSelector('.confirm', { timeout: 3000 });
    const wa = await page.getAttribute('.confirm a.btn-wa', 'href');
    check('booking wa link to shop', wa.startsWith('https://wa.me/962795866455?text=') && decodeURIComponent(wa).includes('Audi Q5 2018'));
    let S = await store();
    check('booking stored', S.bookings[0].car.model === 'Q5' && S.bookings[0].phone === '0791112233' && S.bookings[0].kind === 'symptom');
    const bid = S.bookings[0].id;

    // 2. admin: booking arrives -> job -> add finding with photo -> customer approves
    await navigate(page, base + '#admin-bookings');
    check('booking listed in admin', (await page.textContent('.rows')).includes(bid));
    await page.click(`[data-act="a-bk-arrive"][data-id="${bid}"]`);
    await page.waitForSelector('.mech');
    const jobId = (await store()).jobs[0].id;
    check('job created from booking', jobId.startsWith('J') && (await store()).jobs[0].customer.phone === '0791112233');
    // photo
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==', 'base64');
    const photoPath = join(uploadDirectory, 'photo.png');
    writeFileSync(photoPath, png);
    await page.setInputFiles('input[name="photo"]', photoPath);
    await page.waitForSelector('#photo-pick img');
    await page.fill('input[name="title"]', 'تهريب ماء من الرديتر');
    await page.fill('input[name="t-genuine"]', '120');
    await page.fill('input[name="t-commercial"]', '٧٥');
    await page.click('[data-form="a-finding"] button[type="submit"]');
    await page.waitForFunction((id) => { const state = JSON.parse(localStorage.getItem('wh-demo-v1')); return state.jobs.find((job) => job.id === id).findings.length === 1; }, jobId);
    S = await store();
    const job = S.jobs.find((j) => j.id === jobId);
    check('finding added with photo', job.findings.length === 1 && job.findings[0].photo.startsWith('data:image/jpeg') && job.findings[0].tiers.commercial === 75);
    check('stage moved to approval', job.stage === 'approval');
    const waHref = await page.getAttribute('.mech a.btn-wa', 'href');
    check('send report link to customer', waHref.startsWith('https://wa.me/962791112233') && decodeURIComponent(waHref).includes('#report-' + jobId));
    // customer opens report
    await navigate(page, base + '#report-' + jobId);
    await page.click(`[data-act="tier"][data-v="commercial"]`);
    await page.click(`[data-act="decide"][data-v="approved"]`);
    S = await store();
    check('customer approved commercial', S.jobs.find((j) => j.id === jobId).findings[0].status === 'approved' && S.jobs.find((j) => j.id === jobId).findings[0].choice === 'commercial');
    check('total shows 75', (await page.textContent('.totals')).includes('75'));
    const reply = decodeURIComponent(await page.getAttribute('.totals a', 'href'));
    check('reply text lists approval', reply.includes('تهريب ماء من الرديتر') && reply.includes('تجاري'));
    // 3. track by plate for sample + advance stages to done
    await navigate(page, base + '#job-J1026');
    await page.click('[data-act="a-adv"]');
    S = await store();
    check('J1026 advanced to ready', S.jobs.find((j) => j.id === 'J1026').stage === 'ready');
    check('ready message', decodeURIComponent(await page.getAttribute('.mech a.btn-wa', 'href')).includes('جاهزة للاستلام'));
    await navigate(page, base + '#track');
    await page.fill('#track-plate', '١٠-٩٠٨٧٦');
    await page.press('#track-plate', 'Enter');
    check('track finds plate typed in Arabic digits', (await page.textContent('.status-card')).includes('جاهزة للاستلام'));
    // 4. Hiding the winter offer updates the home page.
    await navigate(page, base + '#admin-settings');
    await page.uncheck('[data-set="offer.on"]');
    await navigate(page, base);
    check('offer bar hidden', !(await page.$('.offer-bar')));
    // 5. reset
    await navigate(page, base + '#admin-settings');
    await page.click('[data-act="a-reset"]');
    await page.click('[data-act="a-reset-yes"]');
    S = await store();
    check('reset restores samples', S.jobs.length === 3 && S.settings.offer.on === true && S.bookings.length === 2);
    // 6. English mode
    await page.click('[data-act="lang"]');
    check('english switch', (await page.getAttribute('html', 'dir')) === 'ltr' && (await page.textContent('.a-tabs')).includes('Bookings'));
    // 7. storage blocked -> still renders
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 740 } });
    await ctx2.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    const p2 = await ctx2.newPage(); const e2 = [];
    suite.watch(p2, 'blocked storage'); p2.on('pageerror', (error) => e2.push(error.message));
    await navigate(p2, base);
    check('renders with storage blocked', (await p2.$('.hero')) && !e2.length);

  } finally {
    rmSync(uploadDirectory, { recursive: true, force: true });
  }
});
