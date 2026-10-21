/* Wael Haddad Center — admin panel (demo: no password, data stays in this browser).
   #admin, #admin-bookings, #admin-services, #admin-settings, and #job-<id> (the mechanic's one-button screen). */
(function () {
  'use strict';
  const W = window.WH;
  const { tr, L, esc, bdi, icon } = W;
  const $ = (s, r = document) => r.querySelector(s);
  const st = { addJob: false, confirmReset: false, confirmDel: null, photo: null, urg: 'soon' };
  const DAYS = () => [tr('الأحد', 'Sun'), tr('الاثنين', 'Mon'), tr('الثلاثاء', 'Tue'), tr('الأربعاء', 'Wed'), tr('الخميس', 'Thu'), tr('الجمعة', 'Fri'), tr('السبت', 'Sat')];

  const now = () => Date.now();
  function setStage(j, id) {
    if (j.stage === id) return;
    j.stage = id; j.log.push({ stage: id, at: now() });
  }
  function nextStage(j) {
    if (j.stage === 'done') return null;
    if (j.stage === 'ready') return 'done';
    const i = W.stageIdx(j.stage);
    let n = W.D.stages[i + 1] ? W.D.stages[i + 1].id : 'ready';
    if (n === 'approval' && !(j.findings || []).length) n = 'parts';
    return n;
  }
  const aStage = (id) => (id === 'approval' ? tr('بانتظار موافقة الزبون', 'Waiting for customer OK') : W.stageName(id));
  const pendingCount = (j) => (j.findings || []).filter((f) => f.status === 'pending').length;
  const custName = (j) => (j.customer && j.customer.name) || tr('الزبون', 'customer');

  function waForJob(j) {
    const S = W.S; const car = W.carName(j.car);
    const ph = j.customer && j.customer.phone;
    if (!ph || !W.validPhone(ph)) return null;
    if (j.stage === 'done') {
      if (!S.settings.reviewUrl) return { label: tr('اطلب تقييم', 'Ask for a review'), disabled: tr('حط رابط تقييم Google بالإعدادات', 'Add the Google review link in Settings') };
      return { label: tr('اطلب تقييم', 'Ask for a review'), href: W.waLink(ph, tr(`شكراً إنك اخترت ${W.shopName()}. كيف السيارة معك؟ إذا عجبتك الخدمة، قيّمنا على Google: ${S.settings.reviewUrl}`, `Thanks for choosing ${W.shopName()}. How is the car driving? If you liked the service, please review us on Google: ${S.settings.reviewUrl}`)) };
    }
    if (pendingCount(j)) {
      return { label: tr('ابعت التقرير', 'Send report'), href: W.waLink(ph, tr(`مرحبا ${custName(j)}، فحصنا سيارتك ${car} ولقينا ${pendingCount(j)} أشياء بدها رأيك. شوف الصور والأسعار ووافق من هون:\n${W.siteUrl()}#report-${j.id}`, `Hello ${custName(j)}, we inspected your ${car} and found ${pendingCount(j)} items that need your decision. See the photos and prices and approve here:\n${W.siteUrl()}#report-${j.id}`)) };
    }
    if (j.stage === 'ready') {
      return { label: tr('ابعت: جاهزة', 'Send: ready'), href: W.waLink(ph, tr(`مرحبا ${custName(j)}، سيارتك ${car} جاهزة للاستلام من ${W.shopName()}.\n${L(S.settings, 'address')}`, `Hello ${custName(j)}, your ${car} is ready for pickup at ${W.shopName()}.\n${L(S.settings, 'address')}`)) };
    }
    return { label: tr('ابعت التحديث', 'Send update'), href: W.waLink(ph, tr(`مرحبا ${custName(j)}، سيارتك ${car} هلأ: ${W.stageName(j.stage)}. تابعها من هون (رقم اللوحة ${j.plate}):\n${W.siteUrl()}#track`, `Hello ${custName(j)}, your ${car} is now: ${W.stageName(j.stage)}. Follow it here (plate ${j.plate}):\n${W.siteUrl()}#track`)) };
  }
  function waBtn(j, cls = 'btn-sm') {
    const w = waForJob(j); if (!w) return '';
    if (w.disabled) return `<span class="fine">${esc(w.disabled)}</span>`;
    return `<a class="btn btn-wa ${cls}" href="${esc(w.href)}" target="_blank" rel="noopener">${icon('wa')}${esc(w.label)}</a>`;
  }
  function pillFor(j) {
    const cls = j.stage === 'ready' || j.stage === 'done' ? 'pill-ready' : pendingCount(j) || j.stage === 'parts' ? 'pill-wait' : 'pill-now';
    return `<span class="pill ${cls}">${aStage(j.stage)}</span>`;
  }

  /* ---------- chrome ---------- */
  function head() {
    return `<header class="a-head"><div class="wrap">
      <span class="mark" aria-hidden="true">WH</span><b>${tr('لوحة التحكم', 'Admin panel')}</b><span class="sample-tag">${tr('نسخة عرض', 'Demo')}</span>
      <div class="sp"><button class="lang-btn" data-act="lang">${tr('EN', 'ع')}</button><a class="btn btn-sm" href="#" style="border:1px solid currentColor">${tr('الموقع', 'Website')}</a></div>
    </div></header>`;
  }
  function tabs(cur) {
    const S = W.S;
    const active = S.jobs.filter((j) => j.stage !== 'done').length;
    const fresh = S.bookings.filter((b) => b.status === 'new').length;
    const t = [
      ['jobs', '#admin', tr('الكراج اليوم', 'In the garage'), active],
      ['bookings', '#admin-bookings', tr('الحجوزات', 'Bookings'), fresh],
      ['services', '#admin-services', tr('الخدمات والأسعار', 'Services & prices'), 0],
      ['settings', '#admin-settings', tr('الإعدادات', 'Settings'), 0]
    ];
    return `<nav class="a-tabs"><div class="wrap" style="display:flex;gap:4px">${t.map(([k, h, n, c]) => `<a href="${h}"${cur === k ? ' aria-current="page"' : ''}>${n}${c ? `<span class="badge">${c}</span>` : ''}</a>`).join('')}</div></nav>`;
  }

  /* ---------- jobs ---------- */
  function stats() {
    const S = W.S;
    const active = S.jobs.filter((j) => j.stage !== 'done');
    const all = S.jobs.flatMap((j) => j.findings || []);
    const yes = all.filter((f) => f.status === 'approved'); const no = all.filter((f) => f.status === 'declined');
    const rate = yes.length + no.length ? Math.round((yes.length / (yes.length + no.length)) * 100) + '%' : '—';
    const extra = yes.reduce((a, f) => a + W.findingPrice(f), 0);
    return `<div class="stats">
      <div class="stat"><span>${tr('سيارات بالكراج', 'Cars in the garage')}</span><b>${active.length}</b></div>
      <div class="stat"><span>${tr('بتستنى موافقة الزبون', 'Waiting for customer OK')}</span><b>${active.filter((j) => pendingCount(j)).length}</b></div>
      <div class="stat"><span>${tr('نسبة الموافقة على ملاحظات الفحص', 'Inspection notes approved')}</span><b>${rate}</b></div>
      <div class="stat"><span>${tr('شغل إضافي انوافق عليه', 'Extra work approved')}</span><b>${W.jod(extra)}</b></div>
    </div>`;
  }
  function jobRow(j) {
    const p = pendingCount(j); const nx = nextStage(j);
    return `<div class="row">
      <div class="who"><b>${bdi(W.carFull(j.car))}</b><div><span class="plate"><span>${esc(j.plate || '—')}</span></span><span>${esc(custName(j))}</span><span class="mono" dir="ltr">${esc(j.customer && j.customer.phone)}</span>${j.sample ? `<span class="sample-tag">${tr('مثال', 'Sample')}</span>` : ''}</div></div>
      <div>${pillFor(j)}<div class="fine" style="margin-top:4px">${p ? `${p} ${tr('بتستنى موافقة', 'awaiting OK')} · ` : ''}${tr('آخر تحديث', 'updated')} <span class="mono">${W.fmtTime(j.log[j.log.length - 1].at)}</span></div></div>
      <div class="acts"><a class="btn btn-primary btn-sm" href="#job-${esc(j.id)}">${tr('فتح', 'Open')}</a>${nx ? `<button class="btn btn-ghost btn-sm" data-act="a-adv" data-job="${esc(j.id)}">${nx === 'done' ? tr('سلّمناها', 'Picked up') : tr('التالي', 'Next')} ${W.arrow()}</button>` : ''}${waBtn(j)}</div>
    </div>`;
  }
  function addJobForm() {
    const brands = [...W.D.brands, tr('غيرها', 'Other')];
    return `<form class="a-card" data-form="a-newjob" style="margin-bottom:16px"><h3>${tr('سيارة جديدة دخلت', 'A car just arrived')}</h3>
      <div class="grid-3">
        <label class="field"><span>${tr('رقم اللوحة', 'Plate')}</span><input class="input" name="plate" data-plate dir="ltr" required placeholder="12-34567"></label>
        <label class="field"><span>${tr('الشركة', 'Make')}</span><select class="input" name="brand">${brands.map((b) => `<option>${esc(b)}</option>`).join('')}</select></label>
        <label class="field"><span>${tr('الموديل', 'Model')}</span><input class="input" name="model" placeholder="A4"></label>
        <label class="field"><span>${tr('السنة', 'Year')}</span><input class="input" name="year" inputmode="numeric" dir="ltr" placeholder="2017"></label>
        <label class="field"><span>${tr('العدّاد', 'Odometer')}</span><input class="input" name="km" inputmode="numeric" dir="ltr" placeholder="120000"></label>
        <label class="field"><span>${tr('متوقع تجهز', 'Expected ready')} <small>${tr('اختياري', 'optional')}</small></span><input class="input" name="eta" placeholder="${tr('اليوم العصر', 'This afternoon')}"></label>
        <label class="field"><span>${tr('اسم الزبون', 'Customer name')}</span><input class="input" name="name" required></label>
        <label class="field"><span>${tr('موبايل الزبون', 'Customer mobile')}</span><input class="input" name="phone" data-phone dir="ltr" inputmode="tel" required placeholder="07X XXX XXXX"></label>
      </div>
      <div class="cta-row" style="margin-top:0"><button class="btn btn-primary" type="submit">${tr('أضف للكراج', 'Add to garage')}</button><button class="btn btn-ghost" type="button" data-act="a-addjob">${tr('إلغاء', 'Cancel')}</button></div>
      <p class="err" id="newjob-err" role="alert"></p>
    </form>`;
  }
  function viewJobs() {
    const S = W.S;
    const active = S.jobs.filter((j) => j.stage !== 'done').sort((a, b) => b.log[b.log.length - 1].at - a.log[a.log.length - 1].at);
    const done = S.jobs.filter((j) => j.stage === 'done');
    return `${stats()}<p class="fine" style="margin:-12px 0 20px">${tr('الأرقام محسوبة من السيارات اللي بالقائمة (فيها أمثلة).', 'Figures come from the cars listed (samples included).')}</p>
      <div class="a-bar"><h2>${tr('بالكراج هلأ', 'In the garage now')}</h2>${st.addJob ? '' : `<button class="btn btn-primary btn-sm" data-act="a-addjob">+ ${tr('سيارة جديدة', 'New car')}</button>`}</div>
      ${st.addJob ? addJobForm() : ''}
      <div class="rows">${active.map(jobRow).join('') || `<p class="muted">${tr('ما في سيارات هلأ.', 'No cars right now.')}</p>`}</div>
      ${done.length ? `<details style="margin-top:24px"><summary class="lbl" style="cursor:pointer;padding:8px 0">${tr('سلّمناها', 'Picked up')} (${done.length})</summary><div class="rows" style="margin-top:10px">${done.map(jobRow).join('')}</div>
        <p class="fine" style="margin-top:10px">${tr('بالنسخة الحقيقية: تذكير الزيت بيطلع لحاله على واتساب لما الزبون يقرّب من الكيلومترات.', 'Real version: the oil reminder goes out on WhatsApp by itself as the customer nears the mileage.')}</p></details>` : ''}`;
  }

  /* ---------- bookings ---------- */
  function viewBookings() {
    const S = W.S;
    const list = S.bookings.slice().sort((a, b) => (a.date + a.period).localeCompare(b.date + b.period));
    const stName = (s) => ({ new: tr('جديد', 'New'), confirmed: tr('مؤكد', 'Confirmed'), arrived: tr('وصلت', 'Arrived') }[s] || s);
    const rows = list.map((b) => {
      const ok = W.validPhone(b.phone);
      const confirmText = tr(`أهلا ${b.name}، موعدك بـ${W.shopName()} يوم ${W.fmtDate(b.date)} (${W.periodName(b.period)}) لسيارتك ${W.carName(b.car)} مؤكد.\n${L(S.settings, 'address')}\nرقم الحجز: ${b.id}`, `Hello ${b.name}, your visit to ${W.shopName()} on ${W.fmtDate(b.date)} (${W.periodName(b.period)}) for your ${W.carName(b.car)} is confirmed.\n${L(S.settings, 'address')}\nBooking: ${b.id}`);
      return `<div class="row">
        <div class="who"><b>${bdi(W.carFull(b.car))}</b><div><span>${esc(W.needName(b.kind, b.ref))}</span>${b.note ? `<span>· ${esc(b.note)}</span>` : ''}${b.sample ? `<span class="sample-tag">${tr('مثال', 'Sample')}</span>` : ''}</div></div>
        <div><b>${esc(W.fmtDate(b.date, { weekday: 'long', day: 'numeric', month: 'short' }))}</b> · ${W.periodName(b.period)}<div class="fine" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${esc(b.name)} · <span class="mono" dir="ltr">${esc(b.phone)}</span> <span class="pill ${b.status === 'new' ? 'pill-now' : b.status === 'arrived' ? 'pill-ready' : ''}">${stName(b.status)}</span> <span class="mono">${esc(b.id)}</span></div></div>
        <div class="acts">
          ${ok ? `<a class="btn btn-wa btn-sm" href="${esc(W.waLink(b.phone, confirmText))}" target="_blank" rel="noopener" data-act="a-bk-wa" data-id="${esc(b.id)}">${icon('wa')}${tr('أكّد على واتساب', 'Confirm on WhatsApp')}</a>` : ''}
          ${b.status !== 'arrived' ? `<button class="btn btn-primary btn-sm" data-act="a-bk-arrive" data-id="${esc(b.id)}">${tr('وصلت السيارة', 'Car arrived')}</button>` : ''}
          ${st.confirmDel === b.id ? `<button class="btn btn-red btn-sm" data-act="a-bk-del-yes" data-id="${esc(b.id)}">${tr('أكيد، احذف', 'Yes, delete')}</button><button class="btn btn-ghost btn-sm" data-act="a-bk-del-no">${tr('لا', 'No')}</button>` : `<button class="btn btn-ghost btn-sm" data-act="a-bk-del" data-id="${esc(b.id)}">${tr('احذف', 'Delete')}</button>`}
        </div></div>`;
    }).join('');
    return `<div class="a-bar"><h2>${tr('الحجوزات', 'Bookings')}</h2><span class="fine">${tr('الحجوزات اللي انعملت من الموقع على هالمتصفح بتطلع هون.', 'Bookings made on the site in this browser show here.')}</span></div>
      <div class="rows">${rows || `<p class="muted">${tr('ما في حجوزات.', 'No bookings.')}</p>`}</div>`;
  }

  /* ---------- services ---------- */
  function viewServices() {
    const S = W.S;
    return `<div class="a-bar"><h2>${tr('الخدمات والأسعار', 'Services & prices')}</h2><span class="fine">${tr('السعر فاضي = «حسب الموديل». صفر = «مجاني». بتنحفظ أول بأول.', 'Empty price = "priced by model". Zero = "free". Changes save as you go.')}</span></div>
      <div class="a-card">${S.services.map((s) => `<div class="svc-edit">
        <label class="field"><span>${tr('الاسم بالعربي', 'Name (Arabic)')}</span><input class="input" dir="rtl" data-svc="${s.id}" data-k="nameAr" value="${esc(s.nameAr)}"></label>
        <label class="field"><span>${tr('الاسم بالإنجليزي', 'Name (English)')}</span><input class="input" dir="ltr" data-svc="${s.id}" data-k="nameEn" value="${esc(s.nameEn)}"></label>
        <label class="field"><span>${tr('السعر يبدأ من (د.أ)', 'Price from (JOD)')}</span><input class="input" dir="ltr" inputmode="decimal" data-svc="${s.id}" data-k="price" value="${s.price == null ? '' : esc(s.price)}" placeholder="—"></label>
        <label class="switch"><input type="checkbox" data-svc="${s.id}" data-k="visible"${s.hidden ? '' : ' checked'}>${tr('ظاهرة', 'Shown')}</label>
      </div>`).join('')}</div>`;
  }

  /* ---------- settings ---------- */
  function viewSettings() {
    const S = W.S; const s = S.settings; const o = s.offer;
    const f = (label, path, val, attrs = '') => `<label class="field"><span>${label}</span><input class="input" data-set="${path}" value="${esc(val)}" ${attrs}></label>`;
    return `<div class="a-bar"><h2>${tr('الإعدادات', 'Settings')}</h2><span class="fine">${tr('بتنحفظ أول بأول.', 'Changes save as you go.')}</span></div>
      <div class="a-card"><h3>${tr('عرض الشتاء', 'Winter offer')}</h3>
        <label class="switch"><input type="checkbox" data-set="offer.on"${o.on ? ' checked' : ''}>${tr('العرض ظاهر على الموقع', 'Offer shown on the site')}</label>
        <div class="grid-2">${f(tr('العنوان بالعربي', 'Title (Arabic)'), 'offer.titleAr', o.titleAr, 'dir="rtl"')}${f(tr('العنوان بالإنجليزي', 'Title (English)'), 'offer.titleEn', o.titleEn, 'dir="ltr"')}${f(tr('التفاصيل بالعربي', 'Details (Arabic)'), 'offer.textAr', o.textAr, 'dir="rtl"')}${f(tr('التفاصيل بالإنجليزي', 'Details (English)'), 'offer.textEn', o.textEn, 'dir="ltr"')}</div></div>
      <div class="a-card"><h3>${tr('التواصل', 'Contact')}</h3>
        <div class="grid-3">${f(tr('هاتف 1', 'Phone 1'), 'phones.0', s.phones[0] || '', 'dir="ltr" data-phone')}${f(tr('هاتف 2', 'Phone 2'), 'phones.1', s.phones[1] || '', 'dir="ltr" data-phone')}${f(tr('رقم الواتساب', 'WhatsApp number'), 'whatsapp', s.whatsapp, 'dir="ltr" data-phone')}</div>
        <div class="grid-2">${f(tr('العنوان بالعربي', 'Address (Arabic)'), 'addressAr', s.addressAr, 'dir="rtl"')}${f(tr('العنوان بالإنجليزي', 'Address (English)'), 'addressEn', s.addressEn, 'dir="ltr"')}${f(tr('ساعات الدوام بالعربي', 'Hours (Arabic)'), 'hoursAr', s.hoursAr, 'dir="rtl" placeholder="السبت–الخميس ..."')}${f(tr('ساعات الدوام بالإنجليزي', 'Hours (English)'), 'hoursEn', s.hoursEn, 'dir="ltr" placeholder="Sat–Thu ..."')}</div>
        ${f(tr('رابط الموقع على خرائط Google', 'Google Maps link'), 'mapUrl', s.mapUrl, 'dir="ltr"')}
        ${f(tr('رابط تقييم Google (بنبعته للزبون بعد ما يستلم)', 'Google review link (sent after pickup)'), 'reviewUrl', s.reviewUrl, 'dir="ltr" placeholder="https://g.page/r/..."')}
      </div>
      <div class="a-card"><h3>${tr('المواعيد والتذكير', 'Bookings & reminders')}</h3>
        <div class="field"><span class="lbl">${tr('أيام العطلة (ما بتطلع للحجز)', 'Days off (hidden from booking)')}</span><div class="chips">${DAYS().map((d, i) => `<label class="switch" style="min-height:36px;margin-inline-end:10px"><input type="checkbox" data-day="${i}"${s.closedDays.includes(i) ? ' checked' : ''}>${d}</label>`).join('')}</div></div>
        ${f(tr('تذكير الزيت كل (كم)', 'Oil reminder every (km)'), 'oilIntervalKm', s.oilIntervalKm, 'dir="ltr" inputmode="numeric" style="max-width:200px"')}
      </div>
      <div class="a-card"><h3>${tr('البيانات التجريبية', 'Sample data')}</h3>
        <p class="muted">${tr('برجّع الأمثلة والإعدادات زي أول مرة، وبيمسح أي حجز أو تعديل انعمل على هالمتصفح.', 'Restores the samples and settings to the start, and clears any booking or edit made in this browser.')}</p>
        ${st.confirmReset ? `<div class="confirm-box"><b>${tr('متأكد؟', 'Sure?')}</b><button class="btn btn-red btn-sm" data-act="a-reset-yes">${tr('أيوه، رجّع كل إشي', 'Yes, reset everything')}</button><button class="btn btn-ghost btn-sm" data-act="a-reset-no">${tr('لا', 'No')}</button></div>` : `<div><button class="btn btn-ghost" data-act="a-reset">${tr('رجّع البيانات التجريبية', 'Reset sample data')}</button></div>`}
      </div>`;
  }

  /* ---------- mechanic's one-button screen ---------- */
  function viewMech(id) {
    const j = W.jobById(id);
    if (!j) return `${head()}<div class="wrap a-body"><p>${tr('ما لقينا هالسيارة.', 'Car not found.')} <a class="link" href="#admin">${tr('رجوع', 'Back')}</a></p></div>`;
    const nx = nextStage(j);
    const fs = j.findings || [];
    const tiers = ['genuine', 'commercial', 'used'];
    return `${head()}<div class="wrap a-body"><div class="mech">
      <a class="back" href="#admin">${icon('back')}${tr('الكراج اليوم', 'In the garage')}</a>
      <div class="now-card">
        <p class="kicker">${esc(j.id)}${j.sample ? ` <span class="sample-tag">${tr('مثال', 'Sample')}</span>` : ''}</p>
        <h1 style="font-family:var(--f-display);font-size:28px;margin-top:6px">${bdi(W.carFull(j.car))}</h1>
        <p style="margin-top:8px"><span class="plate"><span>${esc(j.plate || '—')}</span></span></p>
        <p class="fine" style="margin-top:8px">${esc(custName(j))} · <span class="mono" dir="ltr">${esc(j.customer && j.customer.phone)}</span></p>
        <p class="fine" style="margin-top:14px">${tr('المرحلة هلأ', 'Current stage')}</p><p class="big-stage">${aStage(j.stage)}</p>
      </div>
      ${nx ? `<button class="btn btn-red btn-block bigbtn" data-act="a-adv" data-job="${esc(j.id)}">${nx === 'done' ? tr('الزبون استلم السيارة', 'Customer picked up the car') : `${tr('المرحلة التالية:', 'Next stage:')} ${aStage(nx)} ${W.arrow()}`}</button>` : ''}
      <div><span class="lbl">${tr('أو اختار المرحلة', 'Or pick a stage')}</span><div class="chips" style="margin-top:8px">${W.D.stages.map((s) => `<button class="chip chip-sq" data-act="a-stage" data-job="${esc(j.id)}" data-v="${s.id}" aria-pressed="${j.stage === s.id}">${aStage(s.id)}</button>`).join('')}</div></div>
      ${waBtn(j, 'btn-lg btn-block')}
      <section class="a-card"><h3>${tr('ملاحظات الفحص', 'Inspection notes')} (${fs.length})</h3>
        ${fs.length ? fs.map((f) => `<div style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:12px">
          <div style="min-width:0"><b>${esc(L(f, 'title'))}</b><div class="fine">${W.tierName(f.choice)} · ${W.jod(W.findingPrice(f))} · <span class="state state-${f.status}">${f.status === 'approved' ? tr('موافق', 'Approved') : f.status === 'declined' ? tr('مؤجّل', 'Postponed') : tr('بانتظار الزبون', 'Waiting')}</span></div></div>
          ${st.confirmDel === j.id + f.id ? `<span><button class="btn btn-red btn-sm" data-act="a-f-del-yes" data-job="${esc(j.id)}" data-f="${esc(f.id)}">${tr('احذف', 'Delete')}</button> <button class="btn btn-ghost btn-sm" data-act="a-bk-del-no">${tr('لا', 'No')}</button></span>` : `<button class="btn btn-ghost btn-sm" data-act="a-f-del" data-job="${esc(j.id)}" data-f="${esc(f.id)}">${tr('احذف', 'Delete')}</button>`}</div>`).join('') : `<p class="muted">${tr('لسا ما في.', 'None yet.')}</p>`}
        ${fs.length ? `<a class="link" href="#report-${esc(j.id)}">${tr('شوف التقرير زي ما الزبون بشوفه', 'View the report as the customer sees it')}</a>` : ''}
      </section>
      <form class="a-card" data-form="a-finding" data-job="${esc(j.id)}"><h3>${tr('أضف ملاحظة فحص', 'Add an inspection note')}</h3>
        <label class="photo-pick" id="photo-pick">${st.photo ? `<img src="${st.photo}" alt="">` : `<span>${icon('camera', 'width="34" height="34" style="display:block;margin:0 auto 6px"')}${tr('صوّر القطعة', 'Photograph the part')}</span>`}<input type="file" name="photo" accept="image/*" capture="environment" aria-label="${tr('صورة', 'Photo')}"></label>
        <label class="field"><span>${tr('شو المشكلة', 'What’s the problem')}</span><input class="input" name="title" required placeholder="${tr('مثلاً: تهريب زيت من الكارتير', 'e.g. Oil leak at the sump')}"></label>
        <label class="field"><span>${tr('شرح للزبون', 'Explanation for the customer')} <small>${tr('اختياري', 'optional')}</small></span><textarea class="input" name="note"></textarea></label>
        <div class="field"><span class="lbl">${tr('قديش مستعجلة', 'How urgent')}</span><div class="chips">${['stop', 'soon', 'ok'].map((u) => `<button type="button" class="chip chip-sq" data-act="a-urg" data-v="${u}" aria-pressed="${st.urg === u}"><span class="dot dot-${u}"></span>${W.urgName(u)}</button>`).join('')}</div></div>
        <div class="grid-3">${tiers.map((k) => `<label class="field"><span>${W.tierName(k)} (${tr('د.أ', 'JOD')})</span><input class="input" name="t-${k}" dir="ltr" inputmode="decimal" placeholder="—"></label>`).join('')}</div>
        <p class="err" id="finding-err" role="alert"></p>
        <button class="btn btn-primary btn-lg btn-block" type="submit">${tr('أضف للتقرير', 'Add to report')}</button>
      </form>
      <form class="a-card" data-form="a-jobinfo" data-job="${esc(j.id)}"><h3>${tr('تفاصيل السيارة', 'Car details')}</h3>
        <div class="grid-3"><label class="field"><span>${tr('رقم اللوحة', 'Plate')}</span><input class="input" name="plate" data-plate dir="ltr" value="${esc(j.plate)}"></label>
        <label class="field"><span>${tr('العدّاد', 'Odometer')}</span><input class="input" name="km" dir="ltr" inputmode="numeric" value="${esc(j.km || '')}"></label>
        <label class="field"><span>${tr('متوقع تجهز', 'Expected ready')}</span><input class="input" name="eta" value="${esc(L(j, 'eta'))}"></label></div>
        <button class="btn btn-ghost" type="submit">${tr('احفظ', 'Save')}</button>
      </form>
    </div></div>`;
  }

  /* ---------- render ---------- */
  let lastH = '';
  function render(h) {
    if (h !== lastH) { st.confirmDel = null; st.confirmReset = false; if (!h.startsWith('job-')) st.photo = null; lastH = h; }
    if (h.startsWith('job-')) return viewMech(h.slice(4));
    const tab = h.startsWith('admin-') ? h.slice(6) : 'jobs';
    const body = { jobs: viewJobs, bookings: viewBookings, services: viewServices, settings: viewSettings }[tab] || viewJobs;
    return `${head()}${tabs(tab in { jobs: 1, bookings: 1, services: 1, settings: 1 } ? tab : 'jobs')}<div class="wrap a-body">${body()}</div>`;
  }

  /* ---------- actions ---------- */
  function onAct(act, el) {
    if (!act.startsWith('a-')) return false;
    const S = W.S;
    switch (act) {
      case 'a-addjob': st.addJob = !st.addJob; W.rerender(); if (st.addJob) { const i = $('[data-form="a-newjob"] input'); if (i) i.focus(); } break;
      case 'a-adv': {
        const j = W.jobById(el.dataset.job); const nx = j && nextStage(j); if (!nx) break;
        setStage(j, nx); W.save(); W.toast(`${W.carName(j.car)}: ${aStage(nx)}`); W.rerender(); break;
      }
      case 'a-stage': { const j = W.jobById(el.dataset.job); if (!j) break; setStage(j, el.dataset.v); W.save(); W.rerender(`[data-act="a-stage"][data-v="${el.dataset.v}"]`); break; }
      case 'a-urg': st.urg = el.dataset.v; document.querySelectorAll('[data-act="a-urg"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.urg))); break;
      case 'a-f-del': st.confirmDel = el.dataset.job + el.dataset.f; W.rerender(); break;
      case 'a-f-del-yes': { const j = W.jobById(el.dataset.job); if (j) { j.findings = (j.findings || []).filter((f) => f.id !== el.dataset.f); W.save(); } st.confirmDel = null; W.rerender(); break; }
      case 'a-bk-wa': { const b = S.bookings.find((x) => x.id === el.dataset.id); if (b && b.status === 'new') { b.status = 'confirmed'; W.save(); setTimeout(() => W.rerender(), 400); } return true; }
      case 'a-bk-arrive': {
        const b = S.bookings.find((x) => x.id === el.dataset.id); if (!b) break;
        b.status = 'arrived';
        const j = { id: 'J' + (S.seq.job++), plate: b.plate || '', car: clone(b.car), km: Number(b.km) || 0, customer: { name: b.name, phone: b.phone }, stage: 'in', etaAr: '', etaEn: '', log: [{ stage: 'in', at: now() }], findings: [], fromBooking: b.id };
        if (b.kind === 'symptom') { const s = W.symById(b.ref); j.noteAr = s ? s.ar : ''; }
        S.jobs.unshift(j); W.save(); location.hash = 'job-' + j.id; break;
      }
      case 'a-bk-del': st.confirmDel = el.dataset.id; W.rerender(); break;
      case 'a-bk-del-no': st.confirmDel = null; W.rerender(); break;
      case 'a-bk-del-yes': S.bookings = S.bookings.filter((b) => b.id !== el.dataset.id); st.confirmDel = null; W.save(); W.rerender(); break;
      case 'a-reset': st.confirmReset = true; W.rerender(); break;
      case 'a-reset-no': st.confirmReset = false; W.rerender(); break;
      case 'a-reset-yes': W.resetAll(); st.confirmReset = false; W.toast(tr('رجعت البيانات التجريبية.', 'Sample data restored.')); W.rerender(); break;
      default: return false;
    }
    return true;
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function setPath(obj, path, val) {
    const ks = path.split('.'); let o = obj;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = val;
  }
  function onChange(e) {
    const t = e.target; const S = W.S;
    if (t.dataset.svc) {
      const s = S.services.find((x) => x.id === t.dataset.svc); if (!s) return;
      const k = t.dataset.k;
      if (k === 'visible') s.hidden = !t.checked;
      else if (k === 'price') { const v = W.normDigits(t.value).trim(); if (v === '') s.price = null; else if (isFinite(Number(v)) && Number(v) >= 0) s.price = Math.round(Number(v) * 100) / 100; else { t.classList.add('bad'); W.toast(tr('السعر لازم يكون رقم، أو اتركه فاضي.', 'Price must be a number, or leave it empty.')); return; } t.classList.remove('bad'); }
      else s[k] = t.value.trim() || s[k];
      if (W.save()) W.toast(tr('انحفظ.', 'Saved.'));
      return;
    }
    if (t.dataset.set) {
      const p = t.dataset.set; let v = t.type === 'checkbox' ? t.checked : t.value.trim();
      if (p.startsWith('phones.') || p === 'whatsapp') {
        if (v && !W.validPhone(v)) { t.classList.add('bad'); W.toast(tr('اكتب رقم موبايل أردني صحيح (07XXXXXXXX).', 'Enter a valid Jordanian mobile (07XXXXXXXX).')); return; }
        v = v ? W.normPhone(v) : '';
      }
      if (p === 'oilIntervalKm') { const n = Number(W.normDigits(v)); if (!(n >= 1000 && n <= 50000)) { t.classList.add('bad'); W.toast(tr('اكتب رقم بين 1000 و 50000.', 'Enter a number from 1,000 to 50,000.')); return; } v = n; }
      if (/^https?:/i.test(String(v)) === false && (p === 'mapUrl' || p === 'reviewUrl') && v) { t.classList.add('bad'); W.toast(tr('الرابط لازم يبدأ بـ https://', 'The link must start with https://')); return; }
      t.classList.remove('bad');
      setPath(S.settings, p, v);
      if (p.startsWith('phones.')) S.settings.phones = S.settings.phones.filter(Boolean);
      if (!S.settings.phones.length) S.settings.phones = W.D.settings.phones.slice();
      if (W.save()) W.toast(tr('انحفظ.', 'Saved.'));
      return;
    }
    if (t.dataset.day != null) {
      const d = Number(t.dataset.day); const cd = S.settings.closedDays;
      S.settings.closedDays = t.checked ? Array.from(new Set([...cd, d])) : cd.filter((x) => x !== d);
      if (W.save()) W.toast(tr('انحفظ.', 'Saved.'));
      return;
    }
    if (t.name === 'photo' && t.files && t.files[0]) {
      readPhoto(t.files[0]).then((url) => {
        st.photo = url;
        const box = $('#photo-pick'); if (box) { const old = box.querySelector('img, span'); if (old) old.remove(); box.insertAdjacentHTML('afterbegin', `<img src="${url}" alt="">`); }
      }).catch(() => W.toast(tr('ما قدرنا نقرأ الصورة. جرّب صورة ثانية.', 'Couldn’t read that photo. Try another.')));
    }
  }
  function readPhoto(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) { reject(new Error('type')); return; }
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => {
        const max = 960; const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        try { resolve(c.toDataURL('image/jpeg', 0.78)); } catch (e) { reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  function onSubmit(kind, f) {
    const S = W.S;
    if (kind === 'a-newjob') {
      const v = (n) => (f.elements[n].value || '').trim();
      const err = $('#newjob-err');
      if (!W.plateKey(v('plate'))) { err.textContent = tr('اكتب رقم اللوحة.', 'Enter the plate.'); f.elements.plate.focus(); return; }
      if (!v('name')) { err.textContent = tr('اكتب اسم الزبون.', 'Enter the customer’s name.'); f.elements.name.focus(); return; }
      if (!W.validPhone(v('phone'))) { err.textContent = tr('رقم الموبايل لازم يكون أردني (07XXXXXXXX).', 'The mobile must be Jordanian (07XXXXXXXX).'); f.elements.phone.focus(); return; }
      const brand = v('brand');
      const j = { id: 'J' + (S.seq.job++), plate: v('plate'), car: { brand, model: v('model'), year: W.normDigits(v('year')).replace(/[^0-9]/g, '') }, km: Number(W.normDigits(v('km')).replace(/[^0-9]/g, '')) || 0,
        customer: { name: v('name'), phone: W.normPhone(v('phone')) }, stage: 'in', etaAr: v('eta'), etaEn: v('eta'), log: [{ stage: 'in', at: now() }], findings: [] };
      S.jobs.unshift(j); st.addJob = false; W.save(); location.hash = 'job-' + j.id;
      return;
    }
    if (kind === 'a-finding') {
      const j = W.jobById(f.dataset.job); if (!j) return;
      const err = $('#finding-err');
      const title = (f.elements.title.value || '').trim(); const note = (f.elements.note.value || '').trim();
      const tiers = {};
      for (const k of ['genuine', 'commercial', 'used']) {
        const raw = W.normDigits(f.elements['t-' + k].value).trim();
        if (raw === '') continue;
        const n = Number(raw);
        if (!(n > 0)) { err.textContent = tr('الأسعار لازم تكون أرقام أكبر من صفر.', 'Prices must be numbers above zero.'); f.elements['t-' + k].focus(); return; }
        tiers[k] = Math.round(n * 100) / 100;
      }
      if (!title) { err.textContent = tr('اكتب شو المشكلة.', 'Describe the problem.'); f.elements.title.focus(); return; }
      if (!Object.keys(tiers).length) { err.textContent = tr('حط سعر واحد على الأقل.', 'Enter at least one price.'); f.elements['t-genuine'].focus(); return; }
      const finding = { id: 'f' + Date.now().toString(36), illus: 'leak', urgency: st.urg, titleAr: title, titleEn: title, noteAr: note, noteEn: note, photo: st.photo || '', tiers, choice: Object.keys(tiers)[0], status: 'pending' };
      j.findings = j.findings || []; j.findings.push(finding);
      if (W.stageIdx(j.stage) < W.stageIdx('approval')) setStage(j, 'approval');
      st.photo = null; st.urg = 'soon';
      if (!W.save()) { j.findings.pop(); return; }
      W.toast(tr('انضافت للتقرير. ابعته للزبون على واتساب.', 'Added. Send the report to the customer on WhatsApp.'));
      W.rerender(); window.scrollTo(0, 0);
      return;
    }
    if (kind === 'a-jobinfo') {
      const j = W.jobById(f.dataset.job); if (!j) return;
      j.plate = (f.elements.plate.value || '').trim();
      j.km = Number(W.normDigits(f.elements.km.value).replace(/[^0-9]/g, '')) || 0;
      j.etaAr = j.etaEn = (f.elements.eta.value || '').trim();
      if (W.save()) W.toast(tr('انحفظ.', 'Saved.'));
      W.rerender();
    }
  }

  W.admin = { render, onAct, onChange, onSubmit };
})();
