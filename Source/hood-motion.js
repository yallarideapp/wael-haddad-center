/* Photographic hood closure on a time-based clock: eased, blended between recorded poses, then lights. */
(() => {
  'use strict';

  // Soft, irregular density textures are prepared once. Every puff's position
  // comes from media time, so smoke shares the hood's pause/resume and cleanup.
  function createSmoke(canvas) {
    let context;
    try { context = canvas?.getContext('2d', { alpha: true }); } catch (_) { return null; }
    if (!context) return null;
    const sprites = [];
    let seed = 7319;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let variant = 0; variant < 4; variant++) {
      const sprite = document.createElement('canvas'); sprite.width = sprite.height = 192;
      const painter = sprite.getContext('2d');
      if (!painter) return null;
      const pixels = painter.createImageData(192, 192);
      const fields = [4, 8, 16, 32].map((size) => ({ size, data: Array.from({ length: (size + 1) ** 2 }, random) }));
      const sample = ({ size, data }, x, y) => {
        const gx = x * size / 192, gy = y * size / 192, ix = Math.floor(gx), iy = Math.floor(gy);
        const smooth = (n) => n * n * (3 - 2 * n), fx = smooth(gx - ix), fy = smooth(gy - iy), row = size + 1;
        return (data[iy * row + ix] * (1 - fx) + data[iy * row + ix + 1] * fx) * (1 - fy) +
          (data[(iy + 1) * row + ix] * (1 - fx) + data[(iy + 1) * row + ix + 1] * fx) * fy;
      };
      for (let y = 0; y < 192; y++) for (let x = 0; x < 192; x++) {
        const dx = (x - 95.5) / 95.5, dy = (y - 95.5) / 95.5;
        const noise = fields.reduce((sum, field, octave) => sum + sample(field, x, y) * [0.52, 0.28, 0.14, 0.06][octave], 0);
        const edge = Math.max(0, 1 - dx * dx - dy * dy);
        const density = Math.pow(edge, 1.6) * Math.max(0, noise - 0.25) * 2;
        const i = (y * 192 + x) * 4;
        pixels.data[i] = 171 + noise * 46;
        pixels.data[i + 1] = 162 + noise * 43;
        pixels.data[i + 2] = 150 + noise * 39;
        pixels.data[i + 3] = Math.min(205, density * 205);
      }
      painter.putImageData(pixels, 0, 0); sprites.push(sprite);
    }
    const clear = () => context.clearRect(0, 0, canvas.width, canvas.height);
    return {
      // `until` is when the bonnet latches: the plume thins as the gap closes
      // and is gone shortly after, instead of floating over a shut bonnet.
      paint(time, index, until = 2) {
        clear();
        const end = until + .4;
        if (time <= 0 || time >= end || index >= 47 || !sprites.length) return;
        const fade = Math.max(0, Math.min(1, (end - time) / .7));
        const envelope = Math.min(1, time / 0.18) * fade * fade * (3 - 2 * fade);
        context.save(); context.scale(canvas.width / 1080, canvas.height / 840);
        // The extra 240px is above the photographic stage, so the plume can
        // rise naturally without a hard cut at the raised bonnet's top edge.
        context.translate(0, 240);
        for (let puff = 0; puff < 16; puff++) {
          const age = time - (-0.28 + puff * 0.075), life = 1.6 + (puff % 3) * 0.12;
          if (age <= 0 || age >= life) continue;
          const size = 52 + age * (90 + (puff % 3) * 12);
          const x = (puff % 2 ? 420 : 340) - age * (48 + (puff % 3) * 8) + Math.sin(age * 3.5 + puff) * 14;
          const y = 255 - age * (96 + (puff % 4) * 9);
          context.save(); context.translate(x, y); context.rotate(Math.sin(puff * 2.1 + age) * 0.38);
          context.globalAlpha = Math.pow(Math.sin(Math.PI * age / life), 1.4) * 0.42 * envelope;
          context.drawImage(sprites[puff % 4], -size / 2, -size * 0.44, size, size * 0.88);
          context.restore();
        }
        context.restore();
      },
      destroy() { clear(); sprites.forEach((sprite) => { sprite.width = sprite.height = 0; }); sprites.length = 0; }
    };
  }

  // Timeline (seconds after the open pose is released). The recorded hood
  // poses are placed by measured closing progress, so the hood follows a
  // gravity curve, latches with a small rebound and settles the suspension.
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };

  function create({ canvas, smokeCanvas, frames, onPhase, onError }) {
    const f = frames;
    if (!f || typeof f.base !== 'string' || !f.base.length ||
        typeof f.led !== 'string' || !f.led.length ||
        typeof f.headlights !== 'string' || !f.headlights.length ||
        !Number.isFinite(f.ledAt) || !Number.isFinite(f.headlightsAt) || !Number.isFinite(f.duration) ||
        !Number.isFinite(f.closeAt) || !Number.isFinite(f.latchAt) ||
        !Array.isArray(f.sources) || !f.sources.length ||
        !f.sources.every((source) => typeof source === 'string' && source.length > 0) ||
        !['width', 'height', 'columns', 'perSheet', 'count'].every((key) => Number.isInteger(f[key]) && f[key] > 0) ||
        !Array.isArray(f.progress) || f.progress.length !== f.count - 1 ||
        !f.progress.every((value, i) => Number.isFinite(value) && (!i || value >= f.progress[i - 1])) ||
        f.closeAt < 0 || f.latchAt <= f.closeAt || f.ledAt <= f.latchAt || f.headlightsAt <= f.ledAt || f.duration <= f.headlightsAt ||
        f.perSheet % f.columns !== 0 || f.sources.length !== Math.ceil(f.count / f.perSheet)) return null;
    let context, mix, mixContext, lamp, lampContext;
    try {
      context = canvas?.getContext('2d', { alpha: true });
      mix = document.createElement('canvas'); mix.width = f.width; mix.height = f.height;
      mixContext = mix.getContext('2d', { alpha: true });
      lamp = document.createElement('canvas'); lamp.width = f.width; lamp.height = f.height;
      lampContext = lamp.getContext('2d', { alpha: true });
    } catch (_) { return null; }
    if (!context || !mixContext || !lampContext) return null;
    let smoke;
    try { smoke = createSmoke(smokeCanvas); } catch (_) { smoke = null; }

    const last = f.count - 2;                     // the final recorded closed pose
    const progress = f.progress;
    const sweeps = Array.isArray(f.ledSweeps) ? f.ledSweeps : [];
    const timeouts = new Set(), listeners = [], atlases = [];
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let stopped = false, failed = false, prepared = false, requested = false;
    let closing = false, complete = false, preparing;
    let raf = 0, hold = 0, holdStarted = 0, remaining = 300;
    let elapsed = 0, resumedAt = 0, running = false, base, led, headlights;

    const later = (fn, delay) => {
      const id = setTimeout(() => { timeouts.delete(id); fn(); }, delay);
      timeouts.add(id); return id;
    };
    const clearLater = (id) => { clearTimeout(id); timeouts.delete(id); };
    const listen = (target, name, callback) => {
      target.addEventListener(name, callback);
      listeners.push(() => target.removeEventListener(name, callback));
    };
    const cancelWork = () => {
      if (raf) cancelAnimationFrame(raf); raf = 0; running = false;
      timeouts.forEach(clearTimeout); timeouts.clear(); hold = 0;
    };
    const release = (image) => { if (image) { image.onload = null; image.onerror = null; image.removeAttribute('src'); } };
    const releaseImages = () => {
      smoke?.destroy(); smoke = null;
      atlases.forEach(release); atlases.length = 0;
      release(base); release(led); release(headlights); base = led = headlights = null;
      mix.width = mix.height = 0; lamp.width = lamp.height = 0;
    };
    const phase = (name) => { if (!stopped && !failed) onPhase?.(name); };
    const fail = () => {
      if (stopped || failed || complete) return;
      failed = true; cancelWork(); releaseImages(); onError?.();
    };

    // Closing progress 0..1 (with the latch rebound) at timeline time t.
    const hoodProgress = (t) => {
      if (t <= f.closeAt) return 0;
      if (t < f.latchAt) {
        const u = (t - f.closeAt) / (f.latchAt - f.closeAt);
        return .14 * u + .86 * Math.pow(u, 2.35);   // released by hand, then gravity
      }
      const k = t - f.latchAt;                       // latch rebound, ~0.3s
      return k >= .32 ? 1 : 1 - .028 * Math.sin(Math.PI * k / .16) * Math.exp(-k / .09) * (k < .16 ? 1 : .35);
    };
    // Recorded pose as a fractional index into the measured progress table.
    const poseAt = (p) => {
      if (p <= 0) return 0;
      if (p >= 1) return last;
      let i = 0;
      while (i < last && progress[i + 1] < p) i++;
      const span = progress[i + 1] - progress[i];
      return span > 0 ? i + (p - progress[i]) / span : i;
    };
    // Suspension dip after the hood latches, in source pixels (positive = down).
    const bodyDip = (t) => {
      const k = t - f.latchAt;
      if (k <= 0 || k > .7) return 0;
      const dip = 4 * Math.exp(-k / .11) * Math.sin(2 * Math.PI * k / .24);
      return Math.abs(dip) < .05 ? 0 : Math.round(dip * 100) / 100;
    };
    // Xenon ignition: a short strike, a dip, then a smooth climb to full output.
    const headlightLevel = (t) => {
      const k = t - f.headlightsAt;
      if (k <= 0) return 0;
      if (k < .05) return k / .05 * .9;
      if (k < .11) return .9 - (k - .05) / .06 * .55;
      return Math.min(1, .35 + .65 * smooth((k - .11) / .32));
    };
    const cell = (index) => {
      const atlas = atlases[Math.floor(index / f.perSheet)], c = index % f.perSheet;
      return [atlas, (c % f.columns) * f.width, Math.floor(c / f.columns) * f.height];
    };
    const drawLeds = (t, target) => {
      const k = t - f.ledAt;
      if (k <= 0) return;
      if (!sweeps.length) {
        target.save(); target.globalAlpha = Math.min(1, k / .12); target.drawImage(led, 0, 0, f.width, f.height); target.restore();
        return;
      }
      // Each strip lights from its inner end towards the wing, with a soft edge:
      // paint the reveal mask first, then keep the LED layer only inside it.
      lampContext.globalCompositeOperation = 'source-over';
      lampContext.clearRect(0, 0, f.width, f.height);
      const reach = smooth(k / .42), soft = 18;
      for (const [from, to] of sweeps) {
        const head = from + (to - from) * reach, dir = Math.sign(to - from) || 1;
        const g = lampContext.createLinearGradient(head - dir * soft, 0, head + dir * soft, 0);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        lampContext.fillStyle = reach >= 1 ? '#000' : g;
        const x0 = Math.min(from, to) - soft - 4, x1 = Math.max(from, to) + soft + 4;
        lampContext.fillRect(x0, 0, x1 - x0, f.height);
      }
      lampContext.globalCompositeOperation = 'source-in';
      lampContext.drawImage(led, 0, 0, f.width, f.height);
      lampContext.globalCompositeOperation = 'source-over';
      target.drawImage(lamp, 0, 0);
    };
    const paint = (t) => {
      if (stopped || failed || !Number.isFinite(t)) return false;
      try {
        if (!base?.naturalWidth || !led?.naturalWidth || !headlights?.naturalWidth || atlases.some((a) => !a?.naturalWidth)) return false;
        const pose = poseAt(hoodProgress(t));
        const lower = Math.floor(pose), upper = Math.min(last, lower + 1), w = pose - lower;
        const dip = bodyDip(t);
        const lightStage = t >= f.headlightsAt ? 'headlights' : t >= f.ledAt ? 'led' : 'off';
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.save(); context.translate(0, dip);
        context.drawImage(base, 0, 0, canvas.width, canvas.height);
        if (w < .002 || upper === lower) {
          const [atlas, sx, sy] = cell(lower);
          context.drawImage(atlas, sx, sy, f.width, f.height, 0, 0, canvas.width, canvas.height);
        } else {
          // Linear blend of two neighbouring recorded poses (premultiplied sum),
          // so the 24fps recording moves smoothly on 60–120Hz screens.
          mixContext.clearRect(0, 0, f.width, f.height);
          mixContext.globalCompositeOperation = 'lighter';
          const [a1, x1, y1] = cell(lower), [a2, x2, y2] = cell(upper);
          mixContext.globalAlpha = 1 - w; mixContext.drawImage(a1, x1, y1, f.width, f.height, 0, 0, f.width, f.height);
          mixContext.globalAlpha = w; mixContext.drawImage(a2, x2, y2, f.width, f.height, 0, 0, f.width, f.height);
          mixContext.globalAlpha = 1; mixContext.globalCompositeOperation = 'source-over';
          context.drawImage(mix, 0, 0, canvas.width, canvas.height);
        }
        drawLeds(t, context);
        const level = headlightLevel(t);
        // The running lights read brighter on their own; the extra pass hands
        // over to the headlights so the final frame equals the lit poster.
        const boost = t >= f.ledAt ? .85 * (1 - level) : 0;
        if (boost > .01) { context.globalAlpha = boost; drawLeds(t, context); context.globalAlpha = 1; }
        if (level > 0) { context.globalAlpha = level; context.drawImage(headlights, 0, 0, canvas.width, canvas.height); context.globalAlpha = 1; }
        context.restore();
        canvas.dataset.mediaTime = t.toFixed(4);
        canvas.dataset.frameIndex = String(Math.round(pose));
        canvas.dataset.pose = pose.toFixed(3);
        canvas.dataset.dip = dip.toFixed(2);
        canvas.dataset.lightStage = lightStage;
        smoke?.paint(t, Math.round(pose), f.latchAt);
        return true;
      } catch (_) { return false; }
    };

    const now = () => (running ? elapsed + (performance.now() - resumedAt) / 1000 : elapsed);
    const tick = () => {
      raf = 0;
      if (stopped || failed || complete || !running) return;
      const t = Math.min(f.duration, now());
      if (!paint(t)) { fail(); return; }
      if (t >= f.duration) {
        complete = true; running = false;
        releaseImages(); phase('complete'); return;
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (stopped || failed || complete || running || document.hidden) return;
      if (!closing) { closing = true; phase('closing'); }
      running = true; resumedAt = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const pause = () => {
      if (!running) return;
      elapsed = now(); running = false;
      if (raf) cancelAnimationFrame(raf); raf = 0;
    };
    const scheduleHold = () => {
      if (!prepared || !requested || stopped || failed || closing || hold || document.hidden) return;
      holdStarted = performance.now();
      hold = later(() => { hold = 0; remaining = 0; start(); }, remaining);
    };
    listen(document, 'visibilitychange', () => {
      if (stopped || failed || complete) return;
      if (document.hidden) {
        if (hold) { remaining = Math.max(0, remaining - (performance.now() - holdStarted)); clearLater(hold); hold = 0; }
        pause();
      } else if (closing) start();
      else scheduleHold();
    });
    const motionChanged = () => { if (preference.matches) fail(); };
    if (preference?.addEventListener) listen(preference, 'change', motionChanged);
    else if (preference?.addListener) {
      preference.addListener(motionChanged);
      listeners.push(() => preference.removeListener(motionChanged));
    }

    const prepare = () => {
      if (preparing) return preparing;
      preparing = new Promise((resolve) => {
        if (stopped || failed || preference?.matches) { resolve(false); return; }
        let settled = false, decoded = 0;
        const total = f.sources.length + 3;
        const finish = (ok) => {
          if (settled) return;
          settled = true; clearLater(timeout);
          if (!ok) releaseImages();
          resolve(ok);
        };
        const ready = () => {
          if (settled || stopped || failed || decoded !== total) return;
          canvas.width = f.width; canvas.height = f.height;
          if (!paint(0)) { finish(false); return; }
          prepared = true; phase('open'); finish(true); scheduleHold();
        };
        const timeout = later(() => finish(false), 10000);
        const load = (src, width, height) => {
          const image = new Image(); image.decoding = 'async';
          image.onerror = () => finish(false);
          image.onload = () => {
            const done = () => {
              if (settled || stopped || failed) return;
              if (image.naturalWidth !== width || image.naturalHeight !== height) { finish(false); return; }
              decoded++; ready();
            };
            if (image.decode) image.decode().then(done, () => finish(false)); else done();
          };
          image.src = src;
          return image;
        };
        base = load(f.base, f.width, f.height);
        led = load(f.led, f.width, f.height);
        headlights = load(f.headlights, f.width, f.height);
        f.sources.forEach((source, index) => {
          atlases[index] = load(source, f.width * f.columns, f.height * Math.ceil(f.perSheet / f.columns));
        });
      });
      return preparing;
    };
    const play = () => {
      if (stopped || failed || requested || complete) return;
      requested = true; scheduleHold();
    };
    const destroy = () => {
      if (stopped) return;
      stopped = true; cancelWork(); listeners.forEach((remove) => remove()); releaseImages();
    };
    return { prepare, play, destroy };
  }

  window.WHHood = { create };
})();
