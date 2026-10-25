/* Play prepared photographic car frames, then retain their final pose. */
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
      paint(time, index) {
        clear();
        if (time <= 0 || time >= 2 || index >= 47 || !sprites.length) return;
        const fade = Math.max(0, Math.min(1, (2 - time) / 0.75));
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
          const y = 255 - age * (150 + (puff % 4) * 11);
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

  function create({ canvas, smokeCanvas, video, frames, onPhase, onError }) {
    if (!frames || typeof frames.base !== 'string' || !frames.base.length ||
        typeof frames.led !== 'string' || !frames.led.length ||
        typeof frames.headlights !== 'string' || !frames.headlights.length ||
        !Number.isFinite(frames.ledAt) || !Number.isFinite(frames.headlightsAt) ||
        !Array.isArray(frames.sources) || !frames.sources.length ||
        !frames.sources.every((source) => typeof source === 'string' && source.length > 0) ||
        !['width', 'height', 'columns', 'perSheet', 'count'].every((key) => Number.isInteger(frames[key]) && frames[key] > 0) ||
        !Number.isFinite(frames.fps) || frames.fps <= 0 ||
        frames.ledAt <= (frames.count - 2) / frames.fps || frames.headlightsAt <= frames.ledAt ||
        frames.perSheet % frames.columns !== 0 ||
        frames.sources.length !== Math.ceil(frames.count / frames.perSheet)) return null;
    let context;
    try { context = canvas?.getContext('2d', { alpha: true }); } catch (_) { return null; }
    if (!context || !video) return null;
    let smoke;
    try { smoke = createSmoke(smokeCanvas); } catch (_) { smoke = null; }

    const timeouts = new Set(), listeners = [], pending = new Set(), atlases = [];
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let stopped = false, failed = false, prepared = false, requested = false;
    let closing = false, finishing = false, complete = false, preparing;
    let frame = 0, frameIsVideo = false, hold = 0, holdStarted = 0, remaining = 300;
    let resume = false, playAttempt = 0, base, led, headlights;

    const later = (fn, delay) => {
      const id = setTimeout(() => { timeouts.delete(id); fn(); }, delay);
      timeouts.add(id); return id;
    };
    const clearLater = (id) => { clearTimeout(id); timeouts.delete(id); };
    const listen = (target, name, callback) => {
      target.addEventListener(name, callback);
      const remove = () => target.removeEventListener(name, callback);
      listeners.push(remove); return remove;
    };
    const cancelFrame = () => {
      if (frame) {
        if (frameIsVideo) video.cancelVideoFrameCallback?.(frame);
        else cancelAnimationFrame(frame);
      }
      frame = 0;
    };
    const cancelWork = () => {
      cancelFrame();
      timeouts.forEach(clearTimeout); timeouts.clear(); hold = 0;
      pending.forEach((cancel) => cancel()); pending.clear();
    };
    const releaseAtlases = () => {
      smoke?.destroy(); smoke = null;
      atlases.forEach((atlas) => {
        atlas.onload = null; atlas.onerror = null;
        atlas.removeAttribute('src');
      });
      atlases.length = 0;
      if (base) {
        base.onload = null; base.onerror = null;
        base.removeAttribute('src'); base = null;
      }
      if (led) {
        led.onload = null; led.onerror = null;
        led.removeAttribute('src'); led = null;
      }
      if (headlights) {
        headlights.onload = null; headlights.onerror = null;
        headlights.removeAttribute('src'); headlights = null;
      }
    };
    const phase = (name) => { if (!stopped && !failed) onPhase?.(name); };
    const fail = () => {
      if (stopped || failed || complete) return;
      failed = true; playAttempt++; resume = false;
      video.pause(); cancelWork();
      releaseAtlases();
      onError?.();
    };
    const paint = (mediaTime = video.currentTime) => {
      if (stopped || failed || video.readyState < 2 || !video.videoWidth || !Number.isFinite(mediaTime)) return false;
      try {
        const lightStage = mediaTime >= frames.headlightsAt ? 'headlights' : mediaTime >= frames.ledAt ? 'led' : 'off';
        // Hold the same recorded closed pose through ignition. Replacing it
        // with the later illuminated recording would move the whole front.
        const index = Math.max(0, Math.min(frames.count - 2, Math.floor(mediaTime * frames.fps + .05)));
        const atlas = atlases[Math.floor(index / frames.perSheet)], cell = index % frames.perSheet;
        if (!base?.naturalWidth || !atlas?.naturalWidth || !led?.naturalWidth || !headlights?.naturalWidth) return false;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(base, 0, 0, canvas.width, canvas.height);
        context.drawImage(atlas, (cell % frames.columns) * frames.width,
          Math.floor(cell / frames.columns) * frames.height, frames.width, frames.height,
          0, 0, canvas.width, canvas.height);
        if (lightStage !== 'off') {
          context.save(); context.globalAlpha = Math.min(1, (mediaTime - frames.ledAt) / .12);
          context.drawImage(led, 0, 0, canvas.width, canvas.height); context.restore();
        }
        if (lightStage === 'headlights') context.drawImage(headlights, 0, 0, canvas.width, canvas.height);
        canvas.dataset.mediaTime = Number(mediaTime).toFixed(4);
        canvas.dataset.frameIndex = String(index);
        canvas.dataset.lightStage = lightStage;
        smoke?.paint(mediaTime, index);
        return true;
      } catch (_) { return false; }
    };

    // Video supplies the clock; only its recorded hood and engine pixels move.
    // Lamps, fenders, bumpers, wheels and glass retain the original photograph.
    // A redundant seek on a non-seekable response can jump back to the start.
    // The seeked path is only needed if completion precedes the ended state.
    const freezeLastFrame = () => {
      const target = Math.max(0, video.duration - 1 / 24);
      if (video.ended && video.readyState >= 2) return Promise.resolve(paint(target));
      return new Promise((resolve) => {
      let settled = false, seeked = false, fallback = 0, decoded = 0;
      const remove = () => {
        video.removeEventListener('seeked', afterSeek);
        if (fallback) cancelAnimationFrame(fallback);
        if (decoded) video.cancelVideoFrameCallback?.(decoded);
        clearLater(timeout); pending.delete(cancel);
      };
      const finish = (ok) => {
        if (settled) return;
        settled = true; remove(); resolve(ok);
      };
      const cancel = () => finish(false);
      const draw = (mediaTime = target) => {
        if (stopped || failed) { finish(false); return; }
        if (!seeked || Math.abs(video.currentTime - target) > 1 / 48) return;
        finish(paint(mediaTime));
      };
      const afterSeek = () => {
        seeked = true;
        fallback = requestAnimationFrame(() => { fallback = 0; draw(); });
      };
      const timeout = later(() => finish(false), 10000);
      pending.add(cancel);
      video.addEventListener('seeked', afterSeek);
      if (video.requestVideoFrameCallback) {
        decoded = video.requestVideoFrameCallback((_, metadata) => {
          decoded = 0;
          if (Math.abs(metadata.mediaTime - target) <= 1 / 24) draw(metadata.mediaTime);
        });
      }
      try {
        if (Math.abs(video.currentTime - target) < .0001 && !video.seeking) afterSeek();
        else video.currentTime = target;
      } catch (_) { finish(false); }
      });
    };

    const finishPlayback = async () => {
      if (stopped || failed || finishing || complete) return;
      finishing = true; resume = false; playAttempt++;
      video.pause(); cancelFrame();
      if (!await freezeLastFrame()) { if (!stopped) fail(); return; }
      if (stopped || failed) return;
      complete = true;
      // drawImage copied the final pixels; release the base and decoded sheets.
      releaseAtlases(); phase('complete');
    };
    const drawFrames = () => {
      if (stopped || failed || finishing || complete || document.hidden || video.paused) return;
      frameIsVideo = Boolean(video.requestVideoFrameCallback);
      if (frameIsVideo) {
        frame = video.requestVideoFrameCallback((_, metadata) => {
          frame = 0;
          if (stopped || failed || finishing || document.hidden) return;
          if (!paint(metadata.mediaTime)) { fail(); return; }
          if (video.ended) finishPlayback(); else drawFrames();
        });
      } else {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (stopped || failed || finishing || document.hidden) return;
          if (!paint()) { fail(); return; }
          if (video.ended) finishPlayback(); else drawFrames();
        });
      }
    };
    const startVideo = () => {
      if (stopped || failed || finishing || complete || document.hidden) { resume = true; return; }
      resume = false;
      const attempt = ++playAttempt;
      let playing;
      try { playing = video.play(); } catch (_) { fail(); return; }
      Promise.resolve(playing).then(() => {
        if (stopped || failed || finishing || attempt !== playAttempt) return;
        if (document.hidden) { resume = true; video.pause(); return; }
        if (!closing) { closing = true; phase('closing'); }
        cancelFrame(); drawFrames();
      }, () => { if (attempt === playAttempt) fail(); });
    };
    const scheduleHold = () => {
      if (!prepared || !requested || stopped || failed || closing || hold || document.hidden) return;
      holdStarted = performance.now();
      hold = later(() => { hold = 0; remaining = 0; startVideo(); }, remaining);
    };
    listen(document, 'visibilitychange', () => {
      if (stopped || failed || complete || finishing) return;
      if (document.hidden) {
        if (hold) {
          remaining = Math.max(0, remaining - (performance.now() - holdStarted));
          clearLater(hold); hold = 0;
        }
        if (closing || !video.paused) {
          // Ignore an interrupted play() promise while the tab is hidden.
          resume = true; playAttempt++; video.pause(); cancelFrame();
        }
      } else if (resume && requested) startVideo();
      else scheduleHold();
    });
    listen(video, 'ended', finishPlayback);
    listen(video, 'error', fail);
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
        const source = video.dataset.src || video.getAttribute('src');
        if (!source) { resolve(false); return; }
        let settled = false, videoReady = false, decoded = 0;
        const remove = () => {
          video.removeEventListener('loadeddata', loaded);
          video.removeEventListener('error', error);
          atlases.forEach((atlas) => { atlas.onload = null; atlas.onerror = null; });
          if (base) { base.onload = null; base.onerror = null; }
          if (led) { led.onload = null; led.onerror = null; }
          if (headlights) { headlights.onload = null; headlights.onerror = null; }
          clearLater(timeout); pending.delete(cancel);
        };
        const finish = (ok) => {
          if (settled) return;
          settled = true; remove();
          if (!ok) releaseAtlases();
          resolve(ok);
        };
        const cancel = () => finish(false);
        const error = () => finish(false);
        const ready = () => {
          if (settled || stopped || failed || !videoReady || decoded !== frames.sources.length + 3) return;
          canvas.width = frames.width; canvas.height = frames.height;
          if (!paint()) { finish(false); return; }
          prepared = true; phase('open'); finish(true); scheduleHold();
        };
        const loaded = () => {
          if (!Number.isFinite(video.duration) || video.duration <= frames.headlightsAt || !video.videoWidth || !video.videoHeight) { finish(false); return; }
          videoReady = true; ready();
        };
        const timeout = later(() => finish(false), 10000);
        pending.add(cancel);
        video.addEventListener('loadeddata', loaded);
        video.addEventListener('error', error);
        base = new Image(); base.decoding = 'async';
        base.onerror = error;
        base.onload = () => {
          const afterDecode = () => {
            if (settled || stopped || failed) return;
            if (base.naturalWidth !== frames.width || base.naturalHeight !== frames.height) { finish(false); return; }
            decoded++; ready();
          };
          if (base.decode) base.decode().then(afterDecode, error);
          else afterDecode();
        };
        base.src = frames.base;
        led = new Image(); led.decoding = 'async';
        led.onerror = error;
        led.onload = () => {
          const afterDecode = () => {
            if (settled || stopped || failed) return;
            if (led.naturalWidth !== frames.width || led.naturalHeight !== frames.height) { finish(false); return; }
            decoded++; ready();
          };
          if (led.decode) led.decode().then(afterDecode, error);
          else afterDecode();
        };
        led.src = frames.led;
        headlights = new Image(); headlights.decoding = 'async';
        headlights.onerror = error;
        headlights.onload = () => {
          const afterDecode = () => {
            if (settled || stopped || failed) return;
            if (headlights.naturalWidth !== frames.width || headlights.naturalHeight !== frames.height) { finish(false); return; }
            decoded++; ready();
          };
          if (headlights.decode) headlights.decode().then(afterDecode, error);
          else afterDecode();
        };
        headlights.src = frames.headlights;
        frames.sources.forEach((source, index) => {
          const atlas = new Image(); atlases[index] = atlas; atlas.decoding = 'async';
          atlas.onerror = error;
          atlas.onload = () => {
            const afterDecode = () => {
              if (settled || stopped || failed) return;
              if (atlas.naturalWidth !== frames.width * frames.columns ||
                  atlas.naturalHeight !== frames.height * Math.ceil(frames.perSheet / frames.columns)) { finish(false); return; }
              decoded++; ready();
            };
            if (atlas.decode) atlas.decode().then(afterDecode, error);
            else afterDecode();
          };
          atlas.src = source;
        });
        video.muted = true; video.defaultMuted = true;
        video.playsInline = true; video.loop = false; video.preload = 'auto';
        try { video.src = source; video.load(); } catch (_) { finish(false); }
      });
      return preparing;
    };
    const play = () => {
      if (stopped || failed || requested || complete) return;
      requested = true; scheduleHold();
    };
    const destroy = () => {
      if (stopped) return;
      stopped = true; playAttempt++; resume = false;
      cancelWork(); listeners.forEach((remove) => remove());
      releaseAtlases();
      video.pause(); video.removeAttribute('src');
      try { video.load(); } catch (_) { /* The static final poster remains available. */ }
    };
    return { prepare, play, destroy };
  }

  window.WHHood = { create };
})();
