/* Wael Haddad Center — site script (vanilla JS, no build step).
   Demo mode: bookings, jobs and approvals are kept in this browser (localStorage).
   The real version replaces `WH.store` with the server API; the screens stay the same. */
(function () {
  'use strict';
  const D = window.WH_DEFAULTS;
  const LIVE = D.mode === 'live';
  const KEY = LIVE ? 'wh-live-v1' : 'wh-demo-v1';
  const LKEY = 'wh-lang';
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- language ---------- */
  let lang = 'ar';
  try { const l = localStorage.getItem(LKEY); if (l === 'ar' || l === 'en') lang = l; } catch (e) { /* storage blocked */ }
  const tr = (ar, en) => (lang === 'ar' ? ar : en);
  const L = (o, k) => (o && (o[k + (lang === 'ar' ? 'Ar' : 'En')] || o[k + 'Ar'] || o[k + 'En'])) || '';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bdi = (s) => `<bdi>${esc(s)}</bdi>`;

  /* ---------- numbers, dates, phones ---------- */
  const normDigits = (s) => String(s == null ? '' : s)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
  const plateKey = (s) => normDigits(s).replace(/[^0-9]/g, '');
  function normPhone(s) {
    let d = normDigits(s).replace(/[^0-9]/g, '');
    if (d.startsWith('00962')) d = d.slice(5); else if (d.startsWith('962')) d = d.slice(3);
    d = d.replace(/^0+/, '');
    return d ? '0' + d : '';
  }
  const validPhone = (s) => /^07[789]\d{7}$/.test(normPhone(s));
  const intl = (p) => '962' + normPhone(p).slice(1);
  const waLink = (phone, text) => `https://wa.me/${intl(phone)}${text ? '?text=' + encodeURIComponent(text) : ''}`;
  const telLink = (phone) => `tel:+${intl(phone)}`;
  const money = (n) => (Math.round(Number(n) * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const jod = (n) => (lang === 'ar' ? `${money(n)} د.أ` : `JOD ${money(n)}`);
  const kmTxt = (n) => `${Number(n).toLocaleString('en-US')} ${tr('كم', 'km')}`;
  const locale = () => (lang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-GB');
  function isoLocal(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function dayISO(offset) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset); return isoLocal(d); }
  const fmtDate = (iso, opt) => new Date(iso + 'T12:00:00').toLocaleDateString(locale(), opt || { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtShortDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
  const siteUrl = () => location.href.split('#')[0];

  /* ---------- store ---------- */
  let S;
  function seed() {
    const now = Date.now();
    const s = {
      version: D.version,
      settings: clone(D.settings),
      services: clone(D.services),
      jobs: LIVE ? [] : clone(D.sample.jobs),
      bookings: LIVE ? [] : clone(D.sample.bookings),
      history: LIVE ? {} : clone(D.sample.history),
      seq: { job: 1030, booking: 3103 }
    };
    s.settings.closedDays = [];
    s.jobs.forEach((j) => {
      j.sample = true;
      j.log = j.log.map(([stage, m]) => ({ stage, at: now - m * 60000 }));
      j.createdAt = j.log[0].at;
    });
    s.bookings.forEach((b) => {
      b.sample = true;
      b.date = dayISO(b.inDays); delete b.inDays;
      b.createdAt = now - b.agoMin * 60000; delete b.agoMin;
    });
    return s;
  }
  function fill() {
    const st = Object.assign(clone(D.settings), S.settings || {});
    st.offer = Object.assign(clone(D.settings.offer), (S.settings && S.settings.offer) || {});
    if (!Array.isArray(st.phones) || !st.phones.length) st.phones = clone(D.settings.phones);
    if (!Array.isArray(st.closedDays)) st.closedDays = [];
    S.settings = st;
    if (!Array.isArray(S.services)) S.services = clone(D.services);
    if (!Array.isArray(S.jobs)) S.jobs = [];
    if (!Array.isArray(S.bookings)) S.bookings = [];
    if (!S.history || typeof S.history !== 'object') S.history = {};
    if (!S.seq) S.seq = { job: 1030, booking: 3103 };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && o.version === D.version && Array.isArray(o.jobs)) { S = o; fill(); return; }
      }
    } catch (e) { /* fall back to the shipped sample */ }
    S = seed();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); return true; }
    catch (e) { toast(tr('ما انحفظ التعديل على هالمتصفح (التخزين ممتلئ أو مقفول).', 'Not saved in this browser (storage is full or blocked).')); return false; }
  }
  function resetAll() { S = seed(); save(); }
  load();

  /* ---------- lookups ---------- */
  const stageIdx = (id) => D.stages.findIndex((s) => s.id === id);
  const stageName = (id) => {
    if (id === 'done') return tr('تم الاستلام', 'Picked up');
    const s = D.stages.find((x) => x.id === id); return s ? (lang === 'ar' ? s.ar : s.en) : id;
  };
  const svcById = (id) => S.services.find((s) => s.id === id);
  const symById = (id) => D.symptoms.find((s) => s.id === id);
  const jobById = (id) => S.jobs.find((j) => j.id.toLowerCase() === String(id).toLowerCase());
  const carName = (c) => `${c.brand}${c.model ? ' ' + c.model : ''}`;
  const carFull = (c) => `${carName(c)}${c.year ? ' ' + c.year : ''}`;
  const findingPrice = (f) => Number((f.tiers || {})[f.choice] || 0);
  const tierName = (k) => ({ genuine: tr('أصلي', 'Genuine'), commercial: tr('تجاري', 'Aftermarket'), used: tr('مستعمل', 'Used') }[k] || k);
  const periodName = (p) => ({ am: tr('الصبح', 'Morning'), noon: tr('الظهر', 'Midday'), pm: tr('بعد العصر', 'Afternoon') }[p] || '');
  const urgName = (u) => ({ stop: tr('وقّف السيارة', 'Stop driving'), soon: tr('احجز هالأسبوع', 'Book this week'), ok: tr('بتقدر تستنى', 'Can wait') }[u] || '');
  const needName = (kind, ref) => {
    if (kind === 'symptom') { const s = symById(ref); return s ? (lang === 'ar' ? s.ar : s.en) : ''; }
    const s = svcById(ref); return s ? L(s, 'name') : '';
  };
  const shopName = () => L(S.settings, 'name');
  const phone1 = () => S.settings.phones[0];
  const shopWa = () => S.settings.whatsapp || phone1();

  /* ---------- icons ---------- */
  const I = {
    oil: '<path d="M3 11h9l3-3 6 2-6 5H5a2 2 0 0 1-2-2v-2z"/><path d="M7 11V8h4"/><path d="M20.5 17.3c0 1-.7 1.7-1.6 1.7s-1.6-.7-1.6-1.7c0-1 1.6-2.9 1.6-2.9s1.6 1.9 1.6 2.9z"/>',
    service: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="m9 15.5 2 2 4-4"/>',
    mechanic: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8 6.2 21l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    electric: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    brakes: '<circle cx="11" cy="12" r="8.5"/><circle cx="11" cy="12" r="3"/><path d="M19.5 6.5a9.5 9.5 0 0 1 0 11" stroke-width="3"/>',
    parts: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    winter: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7"/><path d="m9 3.5 3 2 3-2M9 20.5l3-2 3 2M3 10.5l3.3-.3-1-3M20.7 13.5l-3.3.3 1 3M3 13.5l3.3.3-1 3M21 10.5l-3.3-.3 1-3"/>',
    phone: '<path d="M5 3h3.5l2 5-2.5 1.5a11 11 0 0 0 6.5 6.5L16 13.5l5 2V19a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
    wa: '<path d="M4 20l1.3-3.9A8.5 8.5 0 1 1 8.6 19L4 20z"/><path d="M9 8.5c0 3 2.5 6 5.5 6.5l1.2-1.4-2-1-1 .8c-1-.5-1.8-1.3-2.2-2.2l.8-1-1-2L9 8.5z" fill="currentColor" stroke="none"/>',
    pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    track: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17v.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
    back: '<path d="M9 6l6 6-6 6"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>'
  };
  const icon = (k, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${I[k] || ''}</svg>`;
  const arrow = () => `<span class="arrow" aria-hidden="true">←</span>`;

  /* Illustrations for sample findings (the real report shows the mechanic's photo). */
  const ILLUS = {
    brake: '<circle cx="88" cy="72" r="52"/><circle cx="88" cy="72" r="19"/><circle cx="88" cy="72" r="5" fill="currentColor"/><circle cx="88" cy="38" r="3.5"/><circle cx="118" cy="80" r="3.5"/><circle cx="66" cy="98" r="3.5"/><circle cx="62" cy="52" r="3.5"/><path d="M134 34c22 22 22 54 0 76" class="il-hot" stroke-width="16"/><path d="M128 42c16 18 16 42 0 60" stroke-width="2" stroke-dasharray="4 5"/>',
    leak: '<rect x="28" y="34" width="144" height="58" rx="8"/><path d="M28 52h144" class="il-hot" stroke-width="4"/><circle cx="56" cy="43" r="3"/><circle cx="100" cy="43" r="3"/><circle cx="144" cy="43" r="3"/><path d="M48 92v16h104V92"/><path class="il-hot il-fill" d="M118 96c0 0-9 12-9 19a9 9 0 0 0 18 0c0-7-9-19-9-19z"/><path class="il-hot" d="M150 56c0 10 2 20 6 30" stroke-width="3"/>',
    wiper: '<path d="M22 116C40 52 160 52 178 116"/><path d="M100 118 44 70" stroke-width="4"/><path d="M44 70 26 54" class="il-hot" stroke-width="7"/><circle cx="100" cy="118" r="7" fill="currentColor"/><path d="M60 100c8-6 20-10 30-10M120 92c12 2 22 6 30 12" stroke-dasharray="3 6"/>',
    sensor: '<rect x="40" y="56" width="70" height="32" rx="6"/><path d="M110 64h26v16h-26M136 68h24M136 76h24"/><path d="M40 72H18" class="il-hot" stroke-width="6"/><path d="M60 56V44h30v12"/>'
  };
  const illus = (k) => `<svg viewBox="0 0 200 140" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ILLUS[k] || ILLUS.leak}</svg>`;

  /* ---------- ui helpers ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function copyText(text) {
    const done = () => toast(tr('انسخ: ', 'Copied: ') + text);
    const fallback = () => {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove(); ok ? done() : toast(text);
    };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
  }
  let timers = [], heroObserver = null, heroFrame = 0;
  const clearTimers = () => {
    timers.forEach((t) => clearInterval(t)); timers = [];
    if (heroObserver) { heroObserver.disconnect(); heroObserver = null; }
    cancelAnimationFrame(heroFrame); heroFrame = 0;
  };
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let heroLightsPlayed = false, heroIntroPlayed = false;

  function heroCar() {
    const state = heroLightsPlayed || reduceMotion() ? 'lights-on' : 'lights-pending hood-loading';
    // Image and light paths share one coordinate system, including at mobile sizes.
    const near = 'M640 451 L654 467 Q658 470 669 469 L762 465 M786 488 L813 483 Q827 480 834 464 L846 439';
    const far = 'M125 431 L113 463 Q112 470 123 473 M148 459 L174 463 L191 448';
    const hood = 'M129 411 C176 355 323 316 490 307 C656 298 870 306 1006 319 C874 325 719 368 579 437 C443 423 275 433 129 411Z';
    const hoodPhoto = window.innerWidth <= 760 ? 'coupe-studio-mobile.webp' : 'coupe-studio.webp';
    return `<div class="hero-visual" aria-hidden="true">
      <div class="hero-car ${state}" id="hero-car">
        <img src="assets/coupe-studio.webp?v=20261023-cutout" srcset="assets/coupe-studio-mobile.webp?v=20261023-cutout 840w, assets/coupe-studio.webp?v=20261023-cutout 1672w" sizes="(max-width: 760px) 100vw, 62vw" width="1672" height="941" alt="" fetchpriority="high" decoding="async">
        <div class="car-hood">
          <svg class="hood-engine" viewBox="0 0 1672 941" fill="none" focusable="false">
            <defs><clipPath id="hood-outline"><path d="${hood}"/></clipPath></defs>
            <g class="engine-bay" clip-path="url(#hood-outline)">
              <path d="${hood}" fill="#111213"/>
              <image href="assets/engine-bay.webp?v=20261024-hood" x="110" y="290" width="920" height="170"/>
            </g>
            <g class="hood-struts" stroke-linecap="round">
              <path class="strut-body" stroke="#181B1E" stroke-width="7"/>
              <path class="strut-rod" stroke="#969CA1" stroke-width="2.5"/>
            </g>
          </svg>
          <div class="hood-panel">
            <div class="hood-top" style="clip-path:path('${hood}')"><img class="hood-top-image" src="assets/${hoodPhoto}?v=20261023-cutout" width="1672" height="941" alt=""></div>
            <img class="hood-underside" src="assets/hood-underside.webp?v=20261024-hood-natural" width="1000" height="600" alt="">
          </div>
        </div>
        <svg class="car-lights" viewBox="0 0 1672 941" fill="none" focusable="false">
          <defs><filter id="lamp-halo" x="-30%" y="-100%" width="160%" height="300%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="8"/></filter></defs>
          <g class="lamp lamp-far"><path class="lamp-glow" d="${far}"/><path class="lamp-stroke" pathLength="1" d="${far}"/></g>
          <g class="lamp lamp-near"><path class="lamp-glow" d="${near}"/><path class="lamp-stroke" pathLength="1" d="${near}"/></g>
        </svg>
      </div>
    </div>`;
  }
  function settleHero(car) {
    if (!car) return;
    car.className = 'hero-car lights-on'; car.dataset.phase = 'complete';
    $('.car-hood', car).style.opacity = '0'; car.dataset.hoodOpen = '0';
    $('.hood-panel', car).removeAttribute('style');
  }
  // Project the complete photographed panel, including its curved alpha edge.
  // Four-point mapping preserves perspective instead of stretching a cropped inset.
  function hoodProjection(source, target) {
    const rows = source.flatMap(([x, y], i) => {
      const [u, v] = target[i];
      return [[x,y,1,0,0,0,-u*x,-u*y,u], [0,0,0,x,y,1,-v*x,-v*y,v]];
    });
    for (let col = 0; col < 8; col++) {
      let pivot = col;
      for (let row = col + 1; row < 8; row++) if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
      [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
      const divisor = rows[col][col];
      for (let j = col; j <= 8; j++) rows[col][j] /= divisor;
      for (let row = 0; row < 8; row++) if (row !== col) {
        const factor = rows[row][col];
        for (let j = col; j <= 8; j++) rows[row][j] -= factor * rows[col][j];
      }
    }
    return [...rows.map((row) => row[8]), 1];
  }
  const hoodCorners = [[129,411],[579,437],[1006,319],[490,307]];
  const hoodUV = [[0,1],[1,1],[1,0],[0,0]];
  const hoodPlane = hoodProjection(hoodUV, hoodCorners);
  const hoodUnproject = hoodProjection(hoodCorners, hoodUV);
  const hoodTextureUV = [1/1000,0,0,0,-1/600,1,0,0,1];
  const multiplyPlane = (a, b) => a.map((_, i) => {
    const row = Math.floor(i/3)*3, col = i%3;
    return a[row]*b[col] + a[row+1]*b[col+3] + a[row+2]*b[col+6];
  });
  const planeCSS = ([a,b,c,d,e,f,g,h,i]) => `matrix3d(${a},${d},0,${g},${b},${e},0,${h},0,0,1,0,${c},${f},0,${i})`;
  function positionHood(car, openness) {
    const angle = openness * Math.PI / 3, c = Math.cos(angle), s = Math.sin(angle);
    // Rotate one shared plane, so all four corners become edge-on together.
    const pose = [...hoodPlane];
    pose[1] *= c; pose[4] = pose[4]*c - 360*s; pose[7] *= c;
    const point = (u, v) => {
      const depth = pose[6]*u + pose[7]*v + 1;
      return [(pose[0]*u + pose[1]*v + pose[2])/depth, (pose[3]*u + pose[4]*v + pose[5])/depth];
    };
    const far = point(0, 1);
    const panel = $('.hood-panel', car), top = $('.hood-top', car), underside = $('.hood-underside', car);
    panel.style.transform = `scale(${car.clientWidth / 1672})`;
    top.style.transform = planeCSS(multiplyPlane(pose, hoodUnproject));
    underside.style.transform = planeCSS(multiplyPlane(pose, hoodTextureUV));
    // Swap faces only as the rigid panel crosses edge-on to the camera.
    const below = 516 * (far[1] - 307) - 12 * (far[0] - 490) < 0;
    top.style.display = below ? 'none' : 'block';
    underside.style.display = below ? 'block' : 'none';
    $('.engine-bay', car).style.opacity = String(Math.min(1, angle / .04));
    const left = point(.06, .48), right = point(.94, .48);
    const rods = `M380 355L${left.join(' ')} M850 375L${right.join(' ')}`;
    $$('.hood-struts path', car).forEach((path) => path.setAttribute('d', rods));
    $('.hood-struts', car).style.opacity = below ? '1' : '0';
    car.dataset.hoodOpen = openness.toFixed(3);
  }
  function startHeroLights() {
    const car = $('#hero-car'); if (!car) return;
    if (heroLightsPlayed || reduceMotion()) {
      settleHero(car); heroLightsPlayed = true; return;
    }
    let engineReady = false;
    const start = () => {
      if (!car.isConnected) return;
      if (heroObserver) { heroObserver.disconnect(); heroObserver = null; }
      heroLightsPlayed = true;
      const illuminate = () => {
        $('.car-hood', car).style.opacity = '0';
        car.classList.remove('hood-loading'); car.dataset.hoodOpen = '0';
        car.dataset.phase = 'lights';
        car.classList.replace('lights-pending', 'lights-starting');
        const lamp = $('.lamp-near .lamp-stroke', car);
        lamp.addEventListener('animationend', () => { if (car.isConnected) settleHero(car); }, { once: true });
        timers.push(setTimeout(() => { if (car.isConnected) settleHero(car); }, 1900));
      };
      if (!engineReady) { illuminate(); return; }
      let elapsed = 0, previous;
      const ease = (t) => t * t * (3 - 2 * t);
      const animate = (now) => {
        if (!car.isConnected) return;
        if (reduceMotion()) { settleHero(car); return; }
        if (previous !== undefined && !document.hidden) elapsed += Math.min(now - previous, 80);
        previous = now;
        let openness = 1;
        if (elapsed < 1300) car.dataset.phase = 'open';
        else if (elapsed < 3100) { car.dataset.phase = 'closing'; openness = 1 - ease((elapsed - 1300) / 1800); }
        else { heroFrame = 0; illuminate(); return; }
        positionHood(car, openness);
        heroFrame = requestAnimationFrame(animate);
      };
      heroFrame = requestAnimationFrame(animate);
    };
    const ready = () => {
      if (!car.isConnected) return;
      if (engineReady) {
        $('.hood-top-image', car).src = $('img', car).currentSrc;
        positionHood(car, 1); car.dataset.phase = 'open';
        $('.car-hood', car).style.opacity = '1';
      }
      car.classList.remove('hood-loading');
      if (!('IntersectionObserver' in window)) { start(); return; }
      heroObserver = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.55)) start();
      }, { threshold: 0.55 });
      heroObserver.observe(car);
    };
    const img = $('img', car);
    const engine = new Image(); engine.src = 'assets/engine-bay.webp?v=20261024-hood';
    const underside = $('.hood-underside', car);
    // Decode both textures before moving the hood. A missing engine asset falls back to lights only.
    const photoReady = img.decode ? img.decode().then(() => true, () => Boolean(img.naturalWidth)) : new Promise((resolve) => {
      if (img.complete) resolve(Boolean(img.naturalWidth));
      else { img.onload = () => resolve(true); img.onerror = () => resolve(false); }
    });
    const decodeTexture = (image) => image.decode ? image.decode().then(() => true, () => false) : new Promise((resolve) => {
      if (image.complete) resolve(Boolean(image.naturalWidth));
      else { image.onload = () => resolve(true); image.onerror = () => resolve(false); }
    });
    Promise.all([photoReady, decodeTexture(engine), decodeTexture(underside)]).then(([photo, bay, panel]) => { engineReady = bay && panel; if (photo) ready(); });
  }

  /* ---------- transient UI state ---------- */
  const ui = {
    sym: 'brakes', menu: false, trackQ: '', garageQ: '', sos: null,
    draft: null, bookTab: 'service', bookErr: '', bookTried: false
  };
  function newDraft() {
    return { brand: '', model: '', year: '', plate: '', km: '', kind: 'service', ref: '', note: '', date: '', period: '', name: '', phone: '' };
  }

  /* ================= SHELL ================= */
  function offerBar() {
    const o = S.settings.offer; if (!o.on) return '';
    return `<div class="offer-bar"><div class="wrap"><span><b>${esc(L(o, 'title'))}</b><span class="offer-detail"> ${esc(L(o, 'text'))}</span></span><a href="#book-svc-winter">${tr('احجز فحصك', 'Book your check')} ${arrow()}</a></div></div>`;
  }
  function header(active) {
    const links = [
      ['#services', tr('الخدمات', 'Services'), 'services'],
      ['#symptoms', tr('ما مشكلة سيارتك؟', 'What’s wrong?'), 'symptoms'],
      ['#track', tr('تتبّع سيارتك', 'Track your car'), 'track'],
      ['#garage', tr('سجل سيارتي', 'My service book'), 'garage'],
      ['#contact', tr('الموقع', 'Find us'), 'contact']
    ].filter((l) => !LIVE || (l[2] !== 'track' && l[2] !== 'garage'));
    const nav = links.map(([h, t, k]) => `<a href="${h}"${active === k ? ' aria-current="page"' : ''}>${t}</a>`).join('');
    return `<header class="site-head${ui.menu ? ' open' : ''}">
      <div class="wrap head-row">
        <a class="brand" href="#" aria-label="${esc(shopName())}"><span class="mark" aria-hidden="true">WH</span><span class="brand-name"><b>${esc(shopName())}</b><span>${esc(L(S.settings, 'tagline'))}</span></span></a>
        <nav class="nav" aria-label="${tr('القائمة', 'Menu')}">${nav}</nav>
        <div class="head-actions">
          <button class="lang-btn" data-act="lang" aria-label="${tr('English', 'العربية')}">${tr('EN', 'ع')}</button>
          <a class="btn btn-primary btn-sm head-call" href="#book">${tr('احجز موعد', 'Book a visit')}</a>
          <button class="menu-btn" data-act="menu" aria-expanded="${ui.menu}" aria-label="${tr('القائمة', 'Menu')}">${icon(ui.menu ? 'close' : 'menu')}</button>
        </div>
      </div>
      <nav class="wrap mobile-nav" aria-label="${tr('القائمة', 'Menu')}">${nav}<a href="#book">${tr('احجز موعد', 'Book a visit')}</a>${LIVE ? '' : `<a class="demo-link" href="#admin">${tr('لوحة التحكم (نسخة عرض)', 'Admin panel (demo)')}</a>`}</nav>
    </header>`;
  }
  function footer() {
    const st = S.settings;
    return `<footer class="site-foot"><div class="wrap">
      <div class="foot-row">
        <div><b style="color:var(--ink);font-family:var(--f-display);font-size:17px">${esc(shopName())}</b><div>${esc(L(st, 'tagline'))}</div><div>${esc(L(st, 'address'))}</div>
          <div class="mono" dir="ltr" style="margin-top:4px">${st.phones.map(esc).join(' · ')}</div></div>
        <nav aria-label="${tr('روابط', 'Links')}"><a href="#services">${tr('الخدمات', 'Services')}</a><a href="#book">${tr('احجز موعد', 'Book a visit')}</a>${LIVE ? '' : `<a href="#track">${tr('تتبّع سيارتك', 'Track your car')}</a><a href="#garage">${tr('سجل سيارتي', 'My service book')}</a>`}<a href="#contact">${tr('الموقع', 'Find us')}</a>${LIVE ? '' : `<a href="#admin">${tr('لوحة التحكم (نسخة عرض)', 'Admin panel (demo)')}</a>`}</nav>
      </div>
      <div class="foot-note"><span>© ${new Date().getFullYear()} ${esc(shopName())}</span>${LIVE ? '' : `<span>${tr('نسخة عرض: الحجوزات والطلبات بتنحفظ على هالمتصفح بس، والبيانات التجريبية معلّمة.', 'Demo version: bookings and requests stay in this browser; sample data is labelled.')}</span>`}</div>
    </div></footer>`;
  }
  function dock() {
    return `<nav class="dock" aria-label="${tr('اختصارات', 'Shortcuts')}">
      <a href="${telLink(phone1())}">${icon('phone')}${tr('اتصل', 'Call')}</a>
      <a class="d-wa" href="${waLink(shopWa(), tr('مرحبا، عندي سؤال عن سيارتي', 'Hello, I have a question about my car'))}" target="_blank" rel="noopener">${icon('wa')}${tr('واتساب', 'WhatsApp')}</a>
      ${LIVE ? `<a href="#contact">${icon('pin')}${tr('الموقع', 'Map')}</a>` : `<a href="#track">${icon('track')}${tr('تتبّع', 'Track')}</a>`}
      <a class="d-book" href="#book">${icon('cal')}${tr('احجز', 'Book')}</a>
    </nav>`;
  }
  function shell(active, body, noDock) {
    return `${offerBar()}${header(active)}<main id="main">${body}</main>${footer()}${noDock ? '' : dock()}${LIVE ? '' : `
      <a class="demo-corner" href="#admin">${tr('نسخة عرض · لوحة التحكم', 'Demo · Admin panel')}</a>`}`;
  }

  /* ================= HOME ================= */
  function heroTicket() {
    const stages = D.stages.map((s, i) => `<li data-i="${i}"><span>${lang === 'ar' ? s.ar : s.en}</span><span class="t"></span></li>`).join('');
    return `<article class="ticket" aria-label="${tr('مثال على متابعة سيارة', 'Example of a car being tracked')}">
      <header class="ticket-head"><span>${tr('أمر صيانة', 'Repair order')} <span class="mono">J1024</span></span><span class="live">${tr('مثال حي', 'Live example')}</span></header>
      <div class="ticket-car"><div><b>Audi A6</b><span class="yr">2016</span></div><span class="plate"><span>12-34567</span></span></div>
      <ol class="stages" id="hero-stages">${stages}</ol>
      <form class="ticket-foot" data-form="track-quick">
        <label for="hero-plate">${tr('وين وصلت سيارتك؟ اكتب رقم اللوحة', 'Where’s your car? Enter the plate')}</label>
        <div class="track-row">
          <div class="plate-field"><span class="strip">الأردن<br>JORDAN</span><input id="hero-plate" name="plate" data-plate inputmode="numeric" autocomplete="off" placeholder="12-34567" aria-label="${tr('رقم اللوحة', 'Plate number')}"></div>
          <button class="btn btn-primary" type="submit">${tr('تتبّع', 'Track')}</button>
        </div>
      </form>
    </article>`;
  }
  function visitCard() {
    const st = S.settings;
    return `<article class="ticket" aria-label="${tr('بطاقة المركز', 'Visit card')}">
      <header class="ticket-head"><span>${tr('زورنا', 'Visit us')}</span><span class="live">${tr('البيادر', 'Al-Bayader')}</span></header>
      <dl class="contact-list" style="margin:0;padding:4px 18px 8px;border-top:0">
        <div class="c-row"><dt>${tr('العنوان', 'Address')}</dt><dd>${esc(L(st, 'address'))}</dd><div class="acts"><a class="btn btn-ghost btn-sm" href="${esc(st.mapUrl)}" target="_blank" rel="noopener">${icon('pin')}${tr('الخريطة', 'Map')}</a></div></div>
        ${st.phones.map((p) => `<div class="c-row"><dt>${tr('هاتف', 'Phone')}</dt><dd class="mono" dir="ltr">${esc(p)}</dd><div class="acts"><a class="btn btn-ghost btn-sm" href="${telLink(p)}">${icon('phone')}${tr('اتصل', 'Call')}</a></div></div>`).join('')}
        ${L(st, 'hours') ? `<div class="c-row"><dt>${tr('الدوام', 'Hours')}</dt><dd>${esc(L(st, 'hours'))}</dd><div></div></div>` : ''}
      </dl>
      <div class="ticket-foot"><a class="btn btn-wa btn-block" href="${waLink(shopWa(), tr('مرحبا، بدي أستفسر عن صيانة سيارتي', 'Hello, I\u2019d like to ask about servicing my car'))}" target="_blank" rel="noopener">${icon('wa')}${tr('تواصل معنا', 'Message us on WhatsApp')}</a></div>
    </article>`;
  }
  function startHeroLoop() {
    const list = $('#hero-stages'); if (!list) return;
    const items = $$('li', list);
    const base = new Date(); base.setHours(9, 10, 0, 0);
    const times = items.map((_, i) => fmtTime(base.getTime() + i * 38 * 60000));
    const paint = (n) => items.forEach((li, i) => {
      li.className = i < n ? 'done' : i === n ? 'now' : '';
      li.querySelector('.t').innerHTML = i < n ? times[i] : i === n ? `<span class="now-tag">${tr('الآن', 'Now')}</span>` : '';
    });
    let n = 2; paint(n);
    if (reduceMotion()) return;
    let hold = 0;
    timers.push(setInterval(() => {
      if (document.hidden || list.matches(':hover')) return;
      if (n === items.length - 1) { if (++hold < 2) return; hold = 0; n = 0; } else n++;
      paint(n);
    }, 1700));
  }
  function svcRow(s) {
    let price;
    if (s.price === 0) price = `<span class="free">${tr('مجاني هالفترة', 'Free for now')}</span>`;
    else if (typeof s.price === 'number' && s.price > 0) price = `${tr('من', 'from')} <b>${jod(s.price)}</b>`;
    else price = tr('السعر حسب الموديل', 'Priced by model');
    return `<div class="svc">
      <span class="ic">${icon(s.icon)}</span>
      <div><h3>${esc(L(s, 'name'))}</h3><p>${esc(L(s, 'desc'))}</p></div>
      <div class="price">${price}</div>
      <a class="btn btn-ghost btn-sm go" href="#book-svc-${esc(s.id)}">${tr('احجز', 'Book')}</a>
    </div>`;
  }
  function symPanel() {
    const s = symById(ui.sym) || D.symptoms[0];
    const stop = s.level === 'stop';
    return `<span class="urg urg-${s.level}">${icon(s.level === 'ok' ? 'ok' : s.level === 'stop' ? 'alert' : 'clock')}${urgName(s.level)}</span>
      <h3>${lang === 'ar' ? s.ar : s.en}</h3>
      <p>${lang === 'ar' ? s.adviceAr : s.adviceEn}</p>
      <div class="cta-row" style="margin-top:18px">
        ${stop ? `<a class="btn btn-red" href="${telLink(phone1())}">${icon('phone')}${tr('اتصل هلأ', 'Call now')} <span class="mono" dir="ltr">${esc(phone1())}</span></a>` : ''}
        <a class="btn ${stop ? 'btn-ghost' : 'btn-primary'}" href="#book-sym-${s.id}">${tr('احجز فحص لهالمشكلة', 'Book a check for this')}</a>
      </div>`;
  }
  function viewHome() {
    const introClass = heroIntroPlayed ? '' : ' hero-intro';
    heroIntroPlayed = true;
    const st = S.settings;
    const o = st.offer;
    const services = S.services.filter((s) => !s.hidden && (s.id !== 'winter' || o.on));
    const offerCard = o.on ? `<div class="wrap offer-wrap"><div class="offer-card">
        <span class="snow">${icon('winter')}</span>
        <div><p class="kicker">${tr('عرض الشتاء', 'Winter offer')}</p><h3>${esc(L(o, 'title'))}</h3><p>${esc(L(o, 'text'))}.</p>
          <p class="covers">${tr('الفحص بشمل:', 'The check covers:')} <bdi>${D.brands.join(' · ')}</bdi></p></div>
        <a class="btn btn-red" href="#book-svc-winter">${tr('احجز الفحص المجاني', 'Book the free check')}</a>
      </div></div>` : '';
    const chips = D.symptoms.map((s) => `<button class="chip" data-act="sym" data-id="${s.id}" aria-pressed="${ui.sym === s.id}"><span class="dot dot-${s.level}"></span>${lang === 'ar' ? s.ar : s.en}</button>`).join('');
    const quotes = D.quotes.map((q) => `<blockquote class="quote" lang="ar" dir="rtl"><p>${esc(q.text)}</p><footer>${esc(q.who)} · ${tr('تعليق على فيسبوك', 'Facebook comment')}</footer></blockquote>`).join('');
    const hours = L(st, 'hours');
    return `
    <section class="hero${introClass}"><div class="wrap hero-grid">
      <div class="hero-copy">
        <p class="eyebrow">${tr('البيادر · المنطقة الصناعية', 'Al-Bayader · Industrial Area')} — ${tr('منذ', 'since')}&nbsp;<span class="mono">${esc(st.since)}</span></p>
        <h1 class="display">${esc(shopName())}<span class="h1-sub">${esc(L(st, 'tagline'))}</span></h1>
        <p class="lead"><b>${esc(L(st, 'slogan'))}</b><span>${tr('عناية متخصصة بسيارتك، من الفحص إلى الصيانة. احجز زيارتك واحكينا بالتفاصيل.', 'Specialist care for your car, from inspection to maintenance. Book a visit and tell us what you need.')}</span></p>
        <div class="cta-row">
          <a class="btn btn-primary btn-lg" href="#book">${tr('احجز موعد', 'Book a visit')}</a>
          <a class="btn btn-ghost btn-lg" href="${waLink(shopWa(), tr('مرحبا، بدي أستفسر عن صيانة سيارتي', 'Hello, I’d like to ask about servicing my car'))}" target="_blank" rel="noopener">${icon('wa')}${tr('تواصل معنا', 'Message us')}</a>
        </div>
        <ul class="hero-specialism" dir="ltr" aria-label="${tr('ماركات المركبات', 'Vehicle brands')}">
          <li class="marque marque-audi"><img src="assets/audi-rings.svg?v=20261024-clean" width="52" height="18" alt=""><span>Audi</span></li>
          <li class="marque marque-vw"><img src="assets/volkswagen-emblem.svg?v=20261024-clean" width="26" height="26" alt=""><span>Volkswagen</span></li>
          <li class="marque marque-porsche"><img src="assets/porsche-crest.png?v=20261024-clean" width="24" height="32" alt=""><span>Porsche</span></li>
        </ul>
      </div>
      ${heroCar()}
    </div></section>
    ${offerCard}

    <section class="sec" id="services"><div class="wrap">
      <div class="sec-head"><div><p class="kicker">${tr('الخدمات', 'Services')}</p><h2>${tr('شو بنعمل لسيارتك', 'What we do for your car')}</h2>
        <p>${tr('أودي، فولكس فاجن وبورش. احجز الخدمة اللي بدك إياها وبنأكدلك الموعد على واتساب.', 'Audi, Volkswagen and Porsche. Book the service you need and we confirm on WhatsApp.')}</p></div></div>
      <div class="svc-list">${services.map(svcRow).join('')}</div>
    </div></section>

    <section class="sec sec-alt" id="symptoms"><div class="wrap">
      <div class="sec-head"><div><p class="kicker">${tr('مش عارف شو القصة؟', 'Not sure what it is?')}</p><h2>${tr('ما مشكلة سيارتك؟', 'Pick what you notice in the car')}</h2>
        <p>${tr('منحكيلك كم مستعجلة، وبتحجز فحص بكبسة.', 'We tell you how urgent it is, and you can book a check in one tap.')}</p></div></div>
      <div class="sym-layout">
        <div><div class="sym-chips" role="group" aria-label="${tr('الأعراض', 'Symptoms')}">${chips}</div>
          <div class="legend"><span><i class="dot dot-stop"></i>${urgName('stop')}</span><span><i class="dot dot-soon"></i>${urgName('soon')}</span><span><i class="dot dot-ok"></i>${urgName('ok')}</span></div></div>
        <div class="sym-panel" id="sym-panel" aria-live="polite">${symPanel()}</div>
      </div>
      <p class="fine" style="margin-top:20px">${tr('إرشاد عام بساعدك تقرر متى تيجي. التشخيص الأكيد بكون بعد ما نفحص السيارة.', 'General guidance to help you decide when to come in. A real diagnosis comes after we inspect the car.')}</p>
    </div></section>

    ${LIVE ? '' : `<section class="sec" id="how"><div class="wrap">
      <div class="demo-preview"><div><span class="sample-tag">${tr('تجربة توضيحية', 'Demo preview')}</span><h2>${tr('من الاستقبال للتسليم، خطوة بخطوة', 'From arrival to handover, step by step')}</h2><p>${tr('جرّب شكل متابعة السيارة وتقرير الفحص. السيارات والبيانات هون أمثلة للعرض.', 'Explore the tracking and inspection experience. The cars and data here are samples.')}</p></div>${heroTicket()}</div>
      <div class="sec-head"><div><p class="kicker">${tr('كيف بنشتغل', 'How it works')}</p><h2>${tr('بتعرف كل إشي قبل ما تدفع', 'You know everything before you pay')}</h2></div></div>
      <ol class="steps">
        <li><h3>${tr('احجز أو تعال', 'Book or drop in')}</h3><p>${tr('اختار الخدمة أو المشكلة والوقت اللي بناسبك.', 'Choose the service or problem and a time that suits you.')}</p></li>
        <li><h3>${tr('بنفحص وبنصوّرلك', 'We inspect and photograph')}</h3><p>${tr('أي قطعة فيها مشكلة بنبعتلك صورتها وسعرها على واتساب.', 'Any part with a problem: we send you its photo and price on WhatsApp.')}</p></li>
        <li><h3>${tr('إنت بتقرر', 'You decide')}</h3><p>${tr('بتختار أصلي أو تجاري، وبتوافق أو بتأجّل من موبايلك.', 'Pick genuine or aftermarket, then approve or postpone from your phone.')}</p></li>
        <li><h3>${tr('بتتابع لحد ما تجهز', 'Follow it to the finish')}</h3><p>${tr('بتشوف وين وصلت سيارتك، وبتوصلك رسالة لما تجهز.', 'See where your car is, and get a message when it’s ready.')}</p></li>
      </ol>
      <div class="how-foot"><a class="btn btn-primary" href="#report-J1024">${tr('شوف مثال على تقرير فحص', 'See a sample inspection report')}</a><span class="sample-tag">${tr('مثال', 'Sample')}</span></div>
    </div></section>

    <section class="sec sec-alt" id="tools"><div class="wrap">
      <div class="tools">
        <div class="panel"><h3>${tr('تتبّع سيارتك', 'Track your car')}</h3><p>${tr('إذا سيارتك عنا هلأ، اكتب رقم اللوحة وشوف وين وصلت.', 'If your car is with us now, enter the plate to see where it’s at.')}</p>
          <form data-form="track-quick"><div class="track-row"><div class="plate-field"><span class="strip">الأردن<br>JORDAN</span><input name="plate" data-plate inputmode="numeric" autocomplete="off" placeholder="12-34567" aria-label="${tr('رقم اللوحة', 'Plate number')}"></div><button class="btn btn-primary" type="submit">${tr('تتبّع', 'Track')}</button></div></form>
          <p class="hint">${tr('جرّب لوحة تجريبية:', 'Try a sample plate:')} <button type="button" data-act="try-plate" data-v="12-34567">12-34567</button> <button type="button" data-act="try-plate" data-v="10-90876">10-90876</button></p></div>
        <div class="panel"><h3>${tr('سجل سيارتك', 'Your service book')}</h3><p>${tr('كل صيانة عملتها عنا، الكفالات، ومتى صيانتك الجاية.', 'Every service done here, warranties, and when your next one is due.')}</p>
          <form data-form="garage-quick"><div class="track-row"><input class="input" name="phone" data-phone dir="ltr" inputmode="tel" autocomplete="tel" placeholder="07X XXX XXXX" aria-label="${tr('رقم الموبايل', 'Mobile number')}" style="flex:1 1 200px;min-height:52px;font-size:18px"><button class="btn btn-primary" type="submit">${tr('افتح السجل', 'Open')}</button></div></form>
          <p class="hint">${tr('رقم تجريبي:', 'Sample number:')} <button type="button" data-act="try-phone" data-v="0791234567">0791234567</button></p></div>
      </div>
    </div></section>`}

    <section class="sec" id="about"><div class="wrap about-grid">
      <div>
        <p class="kicker">${tr('مين إحنا', 'About us')}</p>
        <div class="facts" style="margin-top:14px">
          <div><b class="mono">${esc(st.since)}</b><span>${tr('سنة البداية', 'Working since')}</span></div>
          <div><b>${tr('ألماني', 'German')}</b><span><bdi>Audi · VW · Porsche</bdi></span></div>
          <div><b>${tr('أصلي', 'Genuine')}</b><span>${tr('زيوت وفلاتر', 'oils and filters')}</span></div>
        </div>
        <p class="about-text">${tr('المهندس وائل حداد بيشتغل على أودي وفولكس فاجن (وطوارق) وبورش من سنة 1989. المركز بالبيادر، بالمنطقة الصناعية، مقابل أدوية الحكمة.', 'Engineer Wael Haddad has worked on Audi, Volkswagen (Touareg included) and Porsche since 1989. The center is in Al-Bayader Industrial Area, opposite Hikma Pharmaceuticals.')}</p>
      </div>
      <div class="quotes">${quotes}</div>
    </div></section>

    <section class="sec sec-alt" id="contact"><div class="wrap">
      <div class="sec-head"><div><p class="kicker">${tr('الموقع والتواصل', 'Find us')}</p><h2>${tr('تعال زورنا بالبيادر', 'Visit us in Al-Bayader')}</h2></div></div>
      <div class="contact-grid">
        <dl class="contact-list">
          <div class="c-row"><dt>${tr('العنوان', 'Address')}</dt><dd>${esc(L(st, 'address'))}</dd><div class="acts"><a class="btn btn-ghost btn-sm" href="${esc(st.mapUrl)}" target="_blank" rel="noopener">${icon('pin')}${tr('الخريطة', 'Map')}</a></div></div>
          ${st.phones.map((p, i) => `<div class="c-row"><dt>${tr('هاتف', 'Phone')} ${st.phones.length > 1 ? i + 1 : ''}</dt><dd class="mono" dir="ltr">${esc(p)}</dd><div class="acts"><button class="btn btn-ghost btn-sm" data-act="copy" data-v="${esc(p)}">${icon('copy')}${tr('انسخ', 'Copy')}</button><a class="btn btn-ghost btn-sm" href="${telLink(p)}">${icon('phone')}${tr('اتصل', 'Call')}</a></div></div>`).join('')}
          <div class="c-row"><dt>${tr('واتساب', 'WhatsApp')}</dt><dd class="mono" dir="ltr">${esc(shopWa())}</dd><div class="acts"><a class="btn btn-wa btn-sm" href="${waLink(shopWa())}" target="_blank" rel="noopener">${icon('wa')}${tr('افتح', 'Open')}</a></div></div>
          ${hours ? `<div class="c-row"><dt>${tr('الدوام', 'Hours')}</dt><dd>${esc(hours)}</dd><div></div></div>` : ''}
        </dl>
        <div class="sos" id="sos"><h3>${tr('عالق على الطريق؟', 'Stuck on the road?')}</h3><p>${tr('ابعتلنا موقعك على واتساب وشو صار مع السيارة، ومنحكيلك شو تعمل.', 'Send us your location and what happened on WhatsApp, and we’ll tell you what to do.')}</p>${sosBody()}</div>
      </div>
    </div></section>`;
  }
  function sosBody() {
    const base = tr('مرحبا، سيارتي وقفت معي.', 'Hello, my car has broken down.');
    if (ui.sos && ui.sos.url) return `<a class="btn btn-wa btn-block" href="${waLink(shopWa(), base + '\n' + tr('موقعي: ', 'My location: ') + ui.sos.url)}" target="_blank" rel="noopener">${icon('wa')}${tr('ابعت موقعي على واتساب', 'Send my location on WhatsApp')}</a><p class="fine" style="margin-top:8px">${tr('أخذنا موقعك. اكبس الزر لتبعته.', 'Location found. Tap to send it.')}</p>`;
    if (ui.sos && ui.sos.failed) return `<a class="btn btn-wa btn-block" href="${waLink(shopWa(), base + '\n' + tr('أنا بـ: ', 'I’m at: '))}" target="_blank" rel="noopener">${icon('wa')}${tr('افتح واتساب واكتب وين إنت', 'Open WhatsApp and type where you are')}</a><p class="fine" style="margin-top:8px">${tr('ما قدرنا ناخذ موقعك من المتصفح.', 'The browser didn’t share your location.')}</p>`;
    return `<button class="btn btn-red btn-block" data-act="sos"${ui.sos && ui.sos.busy ? ' disabled' : ''}>${icon('pin')}${ui.sos && ui.sos.busy ? tr('عم ناخذ موقعك…', 'Getting your location…') : tr('شارك موقعي', 'Share my location')}</button>`;
  }

  /* ================= BOOKING ================= */
  function nextDays(n) {
    const out = []; const closed = S.settings.closedDays || [];
    for (let i = 0; out.length < n && i < 30; i++) {
      const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + i);
      if (closed.includes(d.getDay())) continue;
      out.push({ iso: isoLocal(d), i, d });
    }
    return out;
  }
  function viewBook(prefill) {
    if (!ui.draft) ui.draft = newDraft();
    const dr = ui.draft;
    if (prefill) {
      if (prefill.kind) { dr.kind = prefill.kind; dr.ref = prefill.ref; ui.bookTab = prefill.kind; }
    }
    const brands = [...D.brands, tr('غيرها', 'Other')];
    const brandChips = brands.map((b) => `<button type="button" class="chip chip-sq" data-act="pick" data-key="brand" data-val="${esc(b)}" aria-checked="${dr.brand === b}" role="radio">${bdi(b)}</button>`).join('');
    const years = []; for (let y = new Date().getFullYear() + 1; y >= 1995; y--) years.push(y);
    const svcChips = S.services.filter((s) => !s.hidden && (s.id !== 'winter' || S.settings.offer.on)).map((s) => `<button type="button" class="chip chip-sq" role="radio" data-act="pick" data-key="ref" data-kind="service" data-val="${s.id}" aria-checked="${dr.kind === 'service' && dr.ref === s.id}">${esc(L(s, 'name'))}</button>`).join('');
    const symChips = D.symptoms.map((s) => `<button type="button" class="chip chip-sq" role="radio" data-act="pick" data-key="ref" data-kind="symptom" data-val="${s.id}" aria-checked="${dr.kind === 'symptom' && dr.ref === s.id}"><span class="dot dot-${s.level}"></span>${lang === 'ar' ? s.ar : s.en}</button>`).join('');
    const days = nextDays(10).map(({ iso, i, d }) => `<button type="button" class="day" role="radio" data-act="pick" data-key="date" data-val="${iso}" aria-checked="${dr.date === iso}"><span>${i === 0 ? tr('اليوم', 'Today') : i === 1 ? tr('بكرا', 'Tomorrow') : d.toLocaleDateString(locale(), { weekday: 'short' })}</span><b>${d.getDate()}</b><span>${d.toLocaleDateString(locale(), { month: 'short' })}</span></button>`).join('');
    const periods = ['am', 'noon', 'pm'].map((p) => `<button type="button" class="chip chip-sq" role="radio" data-act="pick" data-key="period" data-val="${p}" aria-checked="${dr.period === p}">${periodName(p)}</button>`).join('');
    const bad = (k) => (ui.bookTried && missing().includes(k) ? ' bad' : '');
    return `<section class="page-head"><div class="wrap"><a class="back" href="#">${icon('back', 'width="16" height="16" class="arrow-r"')}${tr('الرئيسية', 'Home')}</a>
        <h1>${tr('احجز موعد', 'Book a visit')}</h1><p>${tr('عبّي الطلب وبنأكدلك الموعد على واتساب. ما في دفع على الموقع.', 'Fill this in and we confirm the time on WhatsApp. No payment on the site.')}</p></div></section>
      <div class="wrap page-body"><form class="book-grid" data-form="book" novalidate>
        <div>
          <fieldset class="book-step" style="border-inline:0;border-bottom:0;margin:0"><legend class="sr">${tr('السيارة', 'The car')}</legend>
            <h2><span class="mono">1</span>${tr('السيارة', 'The car')}</h2>
            <div class="field"><span class="lbl">${tr('الشركة', 'Make')}</span><div class="chips${bad('brand')}" role="radiogroup">${brandChips}</div></div>
            <div class="grid-3">
              <label class="field"><span>${tr('الموديل', 'Model')}</span><input class="input" id="bk-model" data-bind="model" value="${esc(dr.model)}" placeholder="${tr('مثلاً A6، Golf، Cayenne', 'e.g. A6, Golf, Cayenne')}" autocomplete="off"></label>
              <label class="field"><span>${tr('سنة الصنع', 'Year')}</span><select class="input" id="bk-year" data-bind="year"><option value="">—</option>${years.map((y) => `<option${String(dr.year) === String(y) ? ' selected' : ''}>${y}</option>`).join('')}</select></label>
              <label class="field"><span>${tr('العدّاد (كم)', 'Odometer (km)')} <small>${tr('اختياري', 'optional')}</small></span><input class="input" id="bk-km" data-bind="km" dir="ltr" inputmode="numeric" value="${esc(dr.km)}" placeholder="120000"></label>
            </div>
          </fieldset>
          <fieldset class="book-step" style="border-inline:0;border-bottom:0;margin:0"><legend class="sr">${tr('شو بدك نعمل', 'What you need')}</legend>
            <h2><span class="mono">2</span>${tr('شو بدك نعمل؟', 'What do you need?')}</h2>
            <div class="tabs-mini" role="tablist">
              <button type="button" role="tab" data-act="book-tab" data-v="service" aria-selected="${ui.bookTab === 'service'}">${tr('خدمة', 'A service')}</button>
              <button type="button" role="tab" data-act="book-tab" data-v="symptom" aria-selected="${ui.bookTab === 'symptom'}">${tr('عندي مشكلة', 'A problem')}</button>
            </div>
            <div class="chips${bad('ref')}" role="radiogroup">${ui.bookTab === 'service' ? svcChips : symChips}</div>
            <label class="field"><span>${tr('ملاحظات', 'Notes')} <small>${tr('اختياري', 'optional')}</small></span><textarea class="input" id="bk-note" data-bind="note" placeholder="${tr('أي إشي بتحب نعرفه قبل ما تيجي', 'Anything we should know before you come')}">${esc(dr.note)}</textarea></label>
          </fieldset>
          <fieldset class="book-step" style="border-inline:0;border-bottom:0;margin:0"><legend class="sr">${tr('الموعد', 'When')}</legend>
            <h2><span class="mono">3</span>${tr('الموعد وطريقة التواصل', 'When, and how to reach you')}</h2>
            <div class="field"><span class="lbl">${tr('اليوم', 'Day')}</span><div class="days${bad('date')}" role="radiogroup">${days}</div></div>
            <div class="field"><span class="lbl">${tr('الوقت المفضّل', 'Preferred time')}</span><div class="chips${bad('period')}" role="radiogroup">${periods}</div></div>
            <div class="grid-2">
              <label class="field"><span>${tr('الاسم', 'Name')}</span><input class="input${bad('name')}" id="bk-name" data-bind="name" value="${esc(dr.name)}" autocomplete="name"></label>
              <label class="field"><span>${tr('رقم الموبايل', 'Mobile number')}</span><input class="input${bad('phone')}" id="bk-phone" data-bind="phone" data-phone dir="ltr" inputmode="tel" autocomplete="tel" value="${esc(dr.phone)}" placeholder="07X XXX XXXX"></label>
            </div>
          </fieldset>
        </div>
        <aside class="summary" id="book-summary">${bookSummary()}</aside>
      </form></div>`;
  }
  function missing() {
    const dr = ui.draft || newDraft(); const m = [];
    if (!dr.brand) m.push('brand');
    if (!dr.ref) m.push('ref');
    if (!dr.date) m.push('date');
    if (!dr.period) m.push('period');
    if (!dr.name.trim()) m.push('name');
    if (!validPhone(dr.phone)) m.push('phone');
    return m;
  }
  function bookSummaryBody() {
    const dr = ui.draft || newDraft();
    const car = dr.brand ? `${dr.brand}${dr.model ? ' ' + dr.model : ''}${dr.year ? ' ' + dr.year : ''}` : '—';
    const when = dr.date ? `${fmtDate(dr.date)}${dr.period ? ' · ' + periodName(dr.period) : ''}` : '—';
    const names = { brand: tr('الشركة', 'make'), ref: tr('الخدمة أو المشكلة', 'service or problem'), date: tr('اليوم', 'day'), period: tr('الوقت', 'time'), name: tr('الاسم', 'name'), phone: tr('رقم موبايل أردني صحيح', 'a valid Jordanian mobile') };
    const m = missing();
    return `<dl><div><dt>${tr('السيارة', 'Car')}</dt><dd>${bdi(car)}</dd></div>
        <div><dt>${tr('الطلب', 'Need')}</dt><dd>${esc(needName(dr.kind, dr.ref) || '—')}</dd></div>
        <div><dt>${tr('الموعد', 'When')}</dt><dd>${esc(when)}</dd></div>
        <div><dt>${tr('الاسم', 'Name')}</dt><dd>${esc(dr.name || '—')}</dd></div></dl>
      ${ui.bookTried && m.length ? `<p class="err" role="alert">${tr('ناقص: ', 'Missing: ')}${m.map((k) => names[k]).join(tr('، ', ', '))}</p>` : ''}`;
  }
  /* The button stays in place while the details update, so a tap right after typing still submits. */
  function bookSummary() {
    return `<h3>${tr('ملخّص الحجز', 'Your booking')}</h3>
      <div id="sum-body">${bookSummaryBody()}</div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">${tr('ثبّت طلب الحجز', 'Send booking request')}</button>
      <p class="fine">${tr('بعدها بتبعتلنا الطلب على واتساب بكبسة، ومنرد عليك بتأكيد الموعد.', 'Next you send it to us on WhatsApp in one tap, and we reply to confirm.')}</p>`;
  }
  function bookingWaText(b) {
    return [
      tr('مرحبا، بدي أحجز موعد:', 'Hello, I’d like to book a visit:'),
      `${tr('رقم الطلب', 'Request')}: ${b.id}`,
      `${tr('السيارة', 'Car')}: ${carFull(b.car)}${b.km ? ' · ' + kmTxt(b.km) : ''}`,
      `${tr('الطلب', 'Need')}: ${needName(b.kind, b.ref)}${b.note ? ' — ' + b.note : ''}`,
      `${tr('الموعد', 'When')}: ${fmtDate(b.date)} · ${periodName(b.period)}`,
      `${tr('الاسم', 'Name')}: ${b.name} · ${b.phone}`
    ].join('\n');
  }
  function viewBooked(id) {
    const b = S.bookings.find((x) => x.id === id);
    if (!b) return notFound();
    return `<div class="wrap page-body"><div class="confirm">
      <span class="tick">${icon('check')}</span>
      <h1>${tr('خطوة أخيرة: ابعتلنا الطلب', 'One last step: send it to us')}</h1>
      <span class="code">${esc(b.id)}</span>
      <p>${tr('اكبس الزر وبتفتح محادثة واتساب مع المركز وفيها كل تفاصيل الحجز. منرد عليك بتأكيد الموعد.', 'Tap the button to open a WhatsApp chat with the center, with every detail filled in. We reply to confirm the time.')}</p>
      <div class="cta-row"><a class="btn btn-wa btn-lg" href="${waLink(shopWa(), bookingWaText(b))}" target="_blank" rel="noopener">${icon('wa')}${tr('ابعت الحجز على واتساب', 'Send on WhatsApp')}</a><a class="btn btn-ghost btn-lg" href="#">${tr('الرئيسية', 'Home')}</a></div>
      ${LIVE ? `<p class="fine">${tr('الحجز بثبت لما المركز يرد عليك على واتساب.', 'Your visit is booked once the center replies on WhatsApp.')}</p>` : `<p class="fine">${tr('بالنسخة الحقيقية الطلب بوصل لوحة التحكم مباشرة كمان. هون بنحفظه على هالمتصفح (شوفه بلوحة التحكم ← الحجوزات).', 'In the real version the request also lands in the admin panel directly. Here it is kept in this browser (see Admin → Bookings).')}</p>`}
    </div></div>`;
  }

  /* ================= TRACK ================= */
  function findJob(q) {
    const k = plateKey(q); const raw = String(q || '').trim();
    if (!raw) return null;
    const byId = jobById(raw); if (byId) return byId;
    if (!k) return null;
    return S.jobs.filter((j) => j.stage !== 'done').find((j) => plateKey(j.plate) === k) || null;
  }
  function stepper(j) {
    const cur = stageIdx(j.stage);
    const when = {}; j.log.forEach((l) => { when[l.stage] = l.at; });
    const done = j.stage === 'done';
    return `<ol class="stages" style="padding:18px 22px">${D.stages.map((s, i) => {
      const cls = done || i < cur ? 'done' : i === cur ? 'now' : '';
      const t = when[s.id] ? fmtTime(when[s.id]) : '';
      return `<li class="${cls}"><span>${lang === 'ar' ? s.ar : s.en}</span><span class="t">${i === cur && !done ? `<span class="now-tag">${tr('الآن', 'Now')}</span>` : t}</span></li>`;
    }).join('')}</ol>`;
  }
  function statusCard(j) {
    const pending = (j.findings || []).filter((f) => f.status === 'pending');
    return `<article class="status-card">
      <div class="status-top"><div><p class="kicker">${tr('أمر صيانة', 'Repair order')} ${esc(j.id)}${j.sample ? ` <span class="sample-tag">${tr('مثال', 'Sample')}</span>` : ''}</p><h2>${bdi(carFull(j.car))}</h2></div><span class="plate"><span>${esc(j.plate)}</span></span></div>
      <div class="status-now">
        <div><p class="fine">${tr('سيارتك هلأ', 'Your car is now')}</p><p class="big-stage">${stageName(j.stage)}</p></div>
        <dl class="meta">
          ${L(j, 'eta') && j.stage !== 'done' ? `<div><dt>${tr('متوقع تجهز', 'Expected')}</dt><dd>${esc(L(j, 'eta'))}</dd></div>` : ''}
          <div><dt>${tr('آخر تحديث', 'Updated')}</dt><dd class="mono">${fmtTime(j.log[j.log.length - 1].at)}</dd></div>
          ${j.km ? `<div><dt>${tr('العدّاد', 'Odometer')}</dt><dd class="mono">${kmTxt(j.km)}</dd></div>` : ''}
        </dl>
      </div>
      ${pending.length ? `<div class="alert"><span><b>${pending.length}</b> ${tr(pending.length === 1 ? 'ملاحظة فحص بتستنى موافقتك' : 'ملاحظات فحص بتستنى موافقتك', pending.length === 1 ? 'inspection note needs your OK' : 'inspection notes need your OK')}</span><a class="btn btn-red" href="#report-${esc(j.id)}">${tr('شوف الصور ووافق', 'See photos and approve')}</a></div>` : ''}
      ${stepper(j)}
      <div style="padding:0 22px 22px" class="cta-row"><a class="btn btn-wa" href="${waLink(shopWa(), tr(`مرحبا، بسأل عن سيارتي ${carName(j.car)} رقم ${j.plate} (${j.id})`, `Hello, asking about my ${carName(j.car)}, plate ${j.plate} (${j.id})`))}" target="_blank" rel="noopener">${icon('wa')}${tr('اسأل على واتساب', 'Ask on WhatsApp')}</a>${(j.findings || []).length ? `<a class="btn btn-ghost" href="#report-${esc(j.id)}">${tr('تقرير الفحص', 'Inspection report')}</a>` : ''}</div>
    </article>`;
  }
  function viewTrack() {
    const j = ui.trackQ ? findJob(ui.trackQ) : null;
    return `<section class="page-head"><div class="wrap narrow"><a class="back" href="#">${icon('back', 'width="16" height="16"')}${tr('الرئيسية', 'Home')}</a>
      <h1>${tr('وين وصلت سيارتك؟', 'Where’s your car?')}</h1><p>${tr('اكتب رقم اللوحة أو رقم أمر الصيانة.', 'Enter the plate or the repair-order number.')}</p></div></section>
      <div class="wrap narrow page-body">
        <form data-form="track"><div class="track-row"><div class="plate-field"><span class="strip">الأردن<br>JORDAN</span><input id="track-plate" name="plate" data-plate autocomplete="off" placeholder="12-34567" value="${esc(ui.trackQ)}" aria-label="${tr('رقم اللوحة', 'Plate number')}"></div><button class="btn btn-primary btn-lg" type="submit">${tr('تتبّع', 'Track')}</button></div></form>
        <p class="hint">${tr('لوحات تجريبية:', 'Sample plates:')} ${S.jobs.filter((x) => x.stage !== 'done').slice(0, 4).map((x) => `<button type="button" data-act="try-plate" data-v="${esc(x.plate)}">${esc(x.plate)}</button>`).join(' ')}</p>
        ${ui.trackQ ? (j ? statusCard(j) : `<div class="notfound"><b>${tr('ما لقينا سيارة بهاللوحة بالمركز هلأ.', 'No car with that plate is in the center right now.')}</b><p class="muted">${tr('تأكد من الرقم، أو احكينا على واتساب.', 'Check the number, or message us on WhatsApp.')}</p><a class="btn btn-wa" style="margin-top:12px" href="${waLink(shopWa())}" target="_blank" rel="noopener">${icon('wa')}${tr('واتساب', 'WhatsApp')}</a></div>`) : ''}
      </div>`;
  }

  /* ================= REPORT (approvals) ================= */
  function viewReport(id) {
    const j = jobById(id);
    if (!j) return notFound();
    const fs = j.findings || [];
    const approved = fs.filter((f) => f.status === 'approved');
    const total = approved.reduce((a, f) => a + findingPrice(f), 0);
    const pend = fs.filter((f) => f.status === 'pending').length;
    const cards = fs.map((f) => {
      const tiers = Object.keys(f.tiers || {}).filter((k) => f.tiers[k] != null && f.tiers[k] !== '');
      const locked = f.status !== 'pending';
      return `<article class="finding is-${f.status}">
        <div class="f-media">${f.photo ? `<img src="${esc(f.photo)}" alt="${esc(L(f, 'title'))}">` : `${illus(f.illus)}<span class="cap">${tr('رسم توضيحي. بالتقرير الحقيقي بتشوف صورة سيارتك.', 'Illustration. A real report shows a photo of your car.')}</span>`}</div>
        <div class="f-body">
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between"><span class="urg urg-${f.urgency}">${urgName(f.urgency)}</span>
            <span class="state state-${f.status}">${f.status === 'approved' ? icon('check', 'width="16" height="16"') + tr('موافق', 'Approved') : f.status === 'declined' ? tr('مؤجّل', 'Postponed') : tr('بانتظار ردّك', 'Waiting for you')}</span></div>
          <h3>${esc(L(f, 'title'))}</h3>
          ${L(f, 'note') ? `<p class="note">${esc(L(f, 'note'))}</p>` : ''}
          <div><span class="lbl" style="display:block;margin-bottom:8px">${tr('نوع القطعة والسعر (شامل التركيب)', 'Part type and price (fitted)')}</span>
            <div class="tiers" role="radiogroup">${tiers.map((k) => `<button type="button" class="tier" role="radio" data-act="tier" data-job="${esc(j.id)}" data-f="${esc(f.id)}" data-v="${k}" aria-checked="${f.choice === k}"${locked ? ' disabled' : ''}><span>${tierName(k)}</span><b>${jod(f.tiers[k])}</b></button>`).join('')}</div></div>
          <div class="f-actions">${locked
            ? `<button class="link" data-act="undo" data-job="${esc(j.id)}" data-f="${esc(f.id)}">${tr('غيّرت رأيي', 'Change my mind')}</button>`
            : `<button class="btn btn-primary" data-act="decide" data-v="approved" data-job="${esc(j.id)}" data-f="${esc(f.id)}">${icon('check')}${tr('وافق', 'Approve')} · ${jod(findingPrice(f))}</button><button class="btn btn-ghost" data-act="decide" data-v="declined" data-job="${esc(j.id)}" data-f="${esc(f.id)}">${tr('مش هلأ', 'Not now')}</button>`}</div>
        </div></article>`;
    }).join('');
    return `<section class="page-head"><div class="wrap"><a class="back" href="#track">${icon('back', 'width="16" height="16"')}${tr('تتبّع سيارتك', 'Track your car')}</a>
      <div class="report-head" style="margin-top:8px"><div><p class="kicker">${tr('تقرير فحص', 'Inspection report')} · ${esc(j.id)}${j.sample ? ` <span class="sample-tag">${tr('مثال، أسعار تجريبية', 'Sample, sample prices')}</span>` : ''}</p>
        <h1>${bdi(carFull(j.car))}</h1></div><span class="plate"><span>${esc(j.plate)}</span></span></div>
      <p>${fs.length ? tr('هاي الأشياء اللي لقيناها بالفحص. اختار نوع القطعة، ووافق على اللي بدك إياه. ما بنركّب إشي بدون موافقتك.', 'This is what we found. Choose the part type and approve what you want. Nothing is fitted without your OK.') : tr('ما في ملاحظات فحص على هالسيارة لهلأ.', 'No inspection notes on this car yet.')}</p></div></section>
      <div class="wrap page-body">${cards}
        ${fs.length ? `<div class="totals"><div class="sum">${tr('المجموع اللي وافقت عليه', 'Total you approved')}<b>${jod(total)}</b>${pend ? `<span>${pend} ${tr('بانتظار ردّك', 'still waiting for you')}</span>` : ''}</div>
          <a class="btn btn-wa btn-lg" href="${waLink(shopWa(), replyText(j))}" target="_blank" rel="noopener">${icon('wa')}${tr('ابعت ردّي للمركز', 'Send my reply to the center')}</a></div>
          <p class="fine" style="margin-top:12px">${tr('بالنسخة الحقيقية موافقتك بتوصل للمركز لحالها. هون، ابعت الرد على واتساب.', 'In the real version your approval reaches the center automatically. Here, send the reply on WhatsApp.')}</p>` : ''}
      </div>`;
  }
  function replyText(j) {
    const fs = j.findings || [];
    const yes = fs.filter((f) => f.status === 'approved');
    const no = fs.filter((f) => f.status === 'declined');
    const lines = [tr(`ردّي على تقرير ${j.id} (${carName(j.car)} ${j.plate}):`, `My reply to report ${j.id} (${carName(j.car)} ${j.plate}):`)];
    if (yes.length) { lines.push(tr('موافق على:', 'Approved:')); yes.forEach((f) => lines.push(`✓ ${L(f, 'title')} — ${tierName(f.choice)} — ${jod(findingPrice(f))}`)); }
    if (no.length) { lines.push(tr('مش هلأ:', 'Not now:')); no.forEach((f) => lines.push(`✗ ${L(f, 'title')}`)); }
    lines.push(`${tr('المجموع', 'Total')}: ${jod(yes.reduce((a, f) => a + findingPrice(f), 0))}`);
    return lines.join('\n');
  }

  /* ================= SERVICE BOOK ================= */
  function nextService(v, job) {
    const visits = v.visits.slice().sort((a, b) => b.date.localeCompare(a.date));
    const lastOil = visits.find((x) => x.kind === 'oil');
    if (!lastOil) return null;
    const interval = Number(S.settings.oilIntervalKm) || 10000;
    const oldest = visits[visits.length - 1];
    const today = isoLocal(new Date());
    let curKm = visits[0].km, curDate = visits[0].date;
    if (job && job.km > curKm) { curKm = job.km; curDate = today; }
    const days = Math.max(1, (new Date(curDate) - new Date(oldest.date)) / 864e5);
    const perDay = Math.max(1, (curKm - oldest.km) / days);
    const due = lastOil.km + interval;
    const left = due - curKm;
    const daysLeft = Math.round(left / perDay);
    return { due, left, perDay: Math.round(perDay), daysLeft, used: Math.min(1, Math.max(0, (curKm - lastOil.km) / interval)), curKm };
  }
  function gauge(p) {
    const r = 34, c = 2 * Math.PI * r;
    const col = p >= 1 ? 'var(--stop)' : p > 0.8 ? 'var(--warn)' : 'var(--ok)';
    return `<svg class="gauge" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--line)" stroke-width="8"/><circle cx="42" cy="42" r="${r}" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 42 42)"/><text x="42" y="47" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="15" font-weight="600" fill="var(--ink)">${Math.round(p * 100)}%</text></svg>`;
  }
  function viewGarage() {
    const ph = normPhone(ui.garageQ);
    const rec = ph ? S.history[ph] : null;
    const jobs = ph ? S.jobs.filter((j) => normPhone(j.customer.phone) === ph && j.stage !== 'done') : [];
    let result = '';
    if (ui.garageQ && !rec && !jobs.length) {
      result = `<div class="notfound"><b>${tr('ما لقينا سجل بهالرقم.', 'No record for that number.')}</b><p class="muted">${tr('السجل بنبني من أول زيارة إلك بعد إطلاق النظام.', 'Your book starts with your first visit after the system goes live.')}</p></div>`;
    } else if (rec) {
      result = `<p style="margin-top:24px">${tr('أهلا', 'Hello')} <b>${esc(rec.name)}</b> <span class="sample-tag">${tr('سجل تجريبي', 'Sample record')}</span></p>` + rec.vehicles.map((v) => {
        const job = jobs.find((x) => plateKey(x.plate) === plateKey(v.plate));
        const n = nextService(v, job);
        const nx = n ? `<div class="next">${gauge(n.used)}<div>
            <h3>${n.left > 0 ? tr(`صيانة الزيت الجاية بعد حوالي ${n.left.toLocaleString('en-US')} كم`, `Next oil service in about ${n.left.toLocaleString('en-US')} km`) : tr('صار وقت صيانة الزيت', 'Your oil service is due')}</h3>
            <p>${n.left > 0 ? tr(`على معدّل سواقتك (${n.perDay} كم باليوم) يعني تقريباً بعد ${Math.max(1, Math.round(n.daysLeft / 7))} أسبوع. منبعتلك تذكير على واتساب قبلها.`, `At your usual ${n.perDay} km a day, that’s about ${Math.max(1, Math.round(n.daysLeft / 7))} weeks. We’ll remind you on WhatsApp before then.`) : tr('احجز بالوقت اللي بناسبك.', 'Book whenever suits you.')}</p>
            <p class="fine">${tr('الحساب من عدّاد آخر زيارة ومن كل', 'Worked out from your last odometer reading and an interval of')} <span class="mono">${kmTxt(Number(S.settings.oilIntervalKm) || 10000)}</span>${tr('.', '.')}</p></div></div>` : '';
        const rows = v.visits.slice().sort((a, b) => b.date.localeCompare(a.date)).map((x) => `<tr><td class="n">${fmtShortDate(x.date)}</td><td class="n">${kmTxt(x.km)}</td><td>${esc(L(x, 'work'))}</td><td>${esc(L(x, 'warranty')) || '—'}</td><td class="n">${jod(x.total)}</td></tr>`).join('');
        return `<article class="vehicle">
          <div class="v-head"><h2>${bdi(`${v.brand} ${v.model} ${v.year}`)}</h2><span class="plate"><span>${esc(v.plate)}</span></span></div>
          ${job ? `<div class="alert" style="border-top:0;border-bottom:1px solid var(--line)"><span>${tr('سيارتك عنا هلأ:', 'Your car is with us now:')} <b>${stageName(job.stage)}</b></span><a class="btn btn-primary btn-sm" href="#report-${esc(job.id)}">${tr('افتح', 'Open')}</a></div>` : ''}
          ${nx}
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>${tr('التاريخ', 'Date')}</th><th>${tr('العدّاد', 'Odometer')}</th><th>${tr('الشغل', 'Work')}</th><th>${tr('الكفالة', 'Warranty')}</th><th>${tr('الفاتورة', 'Invoice')}</th></tr></thead><tbody>${rows}</tbody></table></div>
          <p class="fine" style="padding:12px 22px 18px">${tr('هالسجل بفيدك لما تبيع السيارة: بيثبت إنها مخدومة. الفواتير PDF بتنزل من هون بالنسخة الحقيقية.', 'This record helps when you sell the car: it proves the car was looked after. PDF invoices download from here in the real version.')}</p>
        </article>`;
      }).join('');
    } else if (jobs.length) {
      result = jobs.map(statusCard).join('');
    }
    return `<section class="page-head"><div class="wrap"><a class="back" href="#">${icon('back', 'width="16" height="16"')}${tr('الرئيسية', 'Home')}</a>
      <h1>${tr('سجل سيارتي', 'My service book')}</h1><p>${tr('كل صيانة عملتها عنا بمكان واحد، مع الكفالات وموعد الصيانة الجاية.', 'Every service done here in one place, with warranties and when the next one is due.')}</p></div></section>
      <div class="wrap page-body">
        <form data-form="garage" style="max-width:520px"><label class="field"><span>${tr('رقم الموبايل اللي حجزت فيه', 'The mobile number you booked with')}</span>
          <div class="track-row"><input class="input" id="garage-phone" name="phone" data-phone dir="ltr" inputmode="tel" autocomplete="tel" placeholder="07X XXX XXXX" value="${esc(ui.garageQ)}" style="flex:1 1 200px;min-height:52px;font-size:18px"><button class="btn btn-primary btn-lg" type="submit">${tr('افتح السجل', 'Open')}</button></div></label>
          <p class="hint">${tr('بالنسخة الحقيقية بيوصلك كود تأكيد على واتساب قبل ما يفتح السجل.', 'In the real version a confirmation code is sent to your WhatsApp first.')} ${tr('رقم تجريبي:', 'Sample:')} <button type="button" data-act="try-phone" data-v="0791234567">0791234567</button></p></form>
        ${result}
      </div>`;
  }

  function notFound() {
    return `<div class="wrap page-body"><div class="notfound"><b>${tr('هالصفحة مش موجودة.', 'This page doesn’t exist.')}</b><p><a class="link" href="#">${tr('ارجع للرئيسية', 'Back to the home page')}</a></p></div></div>`;
  }

  /* ================= ROUTER ================= */
  const SECTIONS = ['services', 'symptoms', 'how', 'tools', 'about', 'contact'];
  let lastRoute = null;
  function render() {
    clearTimers();
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    const app = $('#app');
    const toast = '<div class="toast" id="toast" role="status" aria-live="polite"></div>';
    let html, active = '', scrollTo = null, isAdmin = false, title = shopName();
    if (!h || h === 'home' || SECTIONS.includes(h)) {
      html = viewHome(); active = SECTIONS.includes(h) ? h : ''; scrollTo = SECTIONS.includes(h) ? h : null;
    } else if (h === 'book' || h.startsWith('book-')) {
      let pre = null;
      if (h.startsWith('book-svc-')) pre = { kind: 'service', ref: h.slice(9) };
      else if (h.startsWith('book-sym-')) pre = { kind: 'symptom', ref: h.slice(9) };
      if (lastRoute !== h) { ui.bookTried = false; if (pre && ui.draft) { ui.draft.kind = pre.kind; ui.draft.ref = pre.ref; } }
      html = viewBook(lastRoute !== h ? pre : null); title = tr('احجز موعد', 'Book a visit') + ' · ' + shopName();
    } else if (h.startsWith('booked-')) {
      html = viewBooked(h.slice(7));
    } else if (LIVE && /^(track|garage|report-|admin|job-)/.test(h)) {
      html = notFound();
    } else if (h === 'track') {
      html = viewTrack(); active = 'track'; title = tr('تتبّع سيارتك', 'Track your car') + ' · ' + shopName();
    } else if (h === 'garage') {
      html = viewGarage(); active = 'garage'; title = tr('سجل سيارتي', 'My service book') + ' · ' + shopName();
    } else if (h.startsWith('report-')) {
      html = viewReport(h.slice(7)); title = tr('تقرير فحص', 'Inspection report') + ' · ' + shopName();
    } else if ((h === 'admin' || h.startsWith('admin-') || h.startsWith('job-')) && WH.admin) {
      isAdmin = true;
    } else {
      html = notFound();
    }
    const noDock = h.startsWith('report-');
    document.body.classList.toggle('has-dock', !isAdmin && !noDock);
    document.body.classList.toggle('admin', isAdmin);
    if (isAdmin) {
      app.innerHTML = WH.admin.render(h) + toast;
      title = tr('لوحة التحكم', 'Admin') + ' · ' + shopName();
      WH.admin.after && WH.admin.after(h);
    } else {
      app.innerHTML = shell(active, html, noDock) + toast;
      if (!h || h === 'home' || SECTIONS.includes(h)) { startHeroLoop(); startHeroLights(); }
    }
    document.title = title;
    const changed = lastRoute !== h;
    lastRoute = h;
    if (scrollTo) { const el = document.getElementById(scrollTo); if (el) el.scrollIntoView({ block: 'start' }); }
    else if (changed) window.scrollTo(0, 0);
  }
  function rerender(focusSel) {
    const y = window.scrollY;
    const sel = focusSel || (document.activeElement && document.activeElement.id ? '#' + document.activeElement.id : null);
    render();
    window.scrollTo(0, y);
    if (sel) { const el = $(sel); if (el) el.focus({ preventScroll: true }); }
  }

  /* ================= EVENTS ================= */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) { if (ui.menu && e.target.closest('.mobile-nav a')) { ui.menu = false; } return; }
    const act = a.dataset.act;
    if (WH.admin && WH.admin.onAct && WH.admin.onAct(act, a, e)) return;
    switch (act) {
      case 'lang':
        lang = lang === 'ar' ? 'en' : 'ar';
        try { localStorage.setItem(LKEY, lang); } catch (err) { /* ignore */ }
        rerender();
        break;
      case 'menu': ui.menu = !ui.menu; rerender('.menu-btn'); break;
      case 'sym': {
        ui.sym = a.dataset.id;
        $$('.sym-chips .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === ui.sym)));
        const p = $('#sym-panel'); if (p) p.innerHTML = symPanel();
        if (window.innerWidth < 860 && p) p.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
        break;
      }
      case 'copy': copyText(a.dataset.v); break;
      case 'try-plate': ui.trackQ = a.dataset.v; if (location.hash === '#track') rerender(); else location.hash = 'track'; break;
      case 'try-phone': ui.garageQ = a.dataset.v; if (location.hash === '#garage') rerender(); else location.hash = 'garage'; break;
      case 'book-tab': ui.bookTab = a.dataset.v; rerender(`[data-act="book-tab"][data-v="${a.dataset.v}"]`); break;
      case 'pick': {
        const dr = ui.draft || (ui.draft = newDraft());
        const k = a.dataset.key;
        dr[k] = a.dataset.val;
        if (k === 'ref') dr.kind = a.dataset.kind;
        rerender(`[data-act="pick"][data-key="${k}"][data-val="${CSS.escape(a.dataset.val)}"]`);
        break;
      }
      case 'tier': case 'decide': case 'undo': {
        const j = jobById(a.dataset.job); if (!j) return;
        const f = (j.findings || []).find((x) => x.id === a.dataset.f); if (!f) return;
        if (act === 'tier' && f.status === 'pending') f.choice = a.dataset.v;
        if (act === 'decide') { f.status = a.dataset.v; toast(a.dataset.v === 'approved' ? tr('تمام، وافقت.', 'Approved.') : tr('أجّلناها.', 'Postponed.')); }
        if (act === 'undo') f.status = 'pending';
        save(); rerender(act === 'tier' ? `[data-act="tier"][data-f="${f.id}"][data-v="${a.dataset.v}"]` : null);
        break;
      }
      case 'sos': {
        ui.sos = { busy: true };
        const fail = () => { ui.sos = { failed: true }; rerenderSos(); };
        rerenderSos();
        try {
          if (!navigator.geolocation) { fail(); break; }
          navigator.geolocation.getCurrentPosition((pos) => {
            const { latitude, longitude } = pos.coords;
            ui.sos = { url: `https://maps.google.com/?q=${latitude.toFixed(5)},${longitude.toFixed(5)}` }; rerenderSos();
          }, fail, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
        } catch (err) { fail(); }
        break;
      }
      default: break;
    }
  });
  function rerenderSos() {
    const box = $('#sos'); if (!box) return;
    const old = box.querySelectorAll('.btn, .fine'); old.forEach((n) => n.remove());
    box.insertAdjacentHTML('beforeend', sosBody());
  }

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-plate]')) {
      const v = normDigits(t.value).replace(/[^0-9A-Za-z\- ]/g, '');
      if (v !== t.value) t.value = v;
    }
    if (t.matches('[data-phone]')) {
      const v = normDigits(t.value).replace(/[^0-9+ ]/g, '');
      if (v !== t.value) t.value = v;
    }
    if (t.matches('[data-bind]') && ui.draft) {
      ui.draft[t.dataset.bind] = t.value;
      const s = $('#sum-body'); if (s) s.innerHTML = bookSummaryBody();
    }
    if (WH.admin && WH.admin.onInput) WH.admin.onInput(e);
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-bind]') && ui.draft) { ui.draft[t.dataset.bind] = t.value; const s = $('#sum-body'); if (s) s.innerHTML = bookSummaryBody(); }
    if (WH.admin && WH.admin.onChange) WH.admin.onChange(e);
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-form]'); if (!f) return;
    e.preventDefault();
    const kind = f.dataset.form;
    if (kind === 'track-quick' || kind === 'track') {
      ui.trackQ = (f.elements.plate.value || '').trim();
      if (!ui.trackQ) { f.elements.plate.focus(); return; }
      if (location.hash === '#track') rerender(); else location.hash = 'track';
      return;
    }
    if (kind === 'garage-quick' || kind === 'garage') {
      ui.garageQ = (f.elements.phone.value || '').trim();
      if (!ui.garageQ) { f.elements.phone.focus(); return; }
      if (location.hash === '#garage') rerender(); else location.hash = 'garage';
      return;
    }
    if (kind === 'book') {
      const dr = ui.draft || newDraft();
      ui.bookTried = true;
      const m = missing();
      if (m.length) {
        rerender();
        const first = { brand: '[data-key="brand"]', ref: '[data-key="ref"]', date: '[data-key="date"]', period: '[data-key="period"]', name: '#bk-name', phone: '#bk-phone' }[m[0]];
        const el = $(first); if (el) { el.scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true }); }
        return;
      }
      const b = {
        id: 'B-' + (S.seq.booking++), car: { brand: dr.brand, model: dr.model.trim(), year: dr.year }, plate: dr.plate, km: normDigits(dr.km).replace(/[^0-9]/g, ''),
        kind: dr.kind, ref: dr.ref, note: dr.note.trim(), date: dr.date, period: dr.period, name: dr.name.trim(), phone: normPhone(dr.phone), status: 'new', createdAt: Date.now()
      };
      S.bookings.unshift(b); save();
      ui.draft = null; ui.bookTried = false;
      location.hash = 'booked-' + b.id;
      return;
    }
    if (WH.admin && WH.admin.onSubmit) WH.admin.onSubmit(kind, f, e);
  });
  window.addEventListener('hashchange', () => { ui.menu = false; render(); });

  /* ---------- shared API for admin.js ---------- */
  const WH = window.WH = {
    get S() { return S; }, D, save, resetAll, render, rerender, toast, tr, L, esc, bdi, icon, arrow, illus,
    normDigits, normPhone, validPhone, plateKey, waLink, telLink, jod, kmTxt, fmtTime, fmtDate, fmtShortDate, isoLocal, dayISO,
    stageIdx, stageName, svcById, symById, jobById, carName, carFull, findingPrice, tierName, periodName, urgName, needName,
    shopName, shopWa, phone1, siteUrl, replyText, bookingWaText, get lang() { return lang; }, set lang(v) { lang = v; }
  };

  document.addEventListener('DOMContentLoaded', render);
  if (document.readyState !== 'loading') setTimeout(render, 0);
})();
