/* Draw the supplied car footage without simulating or deforming its bonnet. */
(() => {
  'use strict';

  function create({ canvas, video, onPhase, onError }) {
    let context;
    try { context = canvas?.getContext('2d', { alpha: false }); } catch (_) { return null; }
    if (!context || !video) return null;

    const timeouts = new Set(), listeners = [], pending = new Set();
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let stopped = false, failed = false, prepared = false, requested = false;
    let closing = false, finishing = false, complete = false, preparing;
    let frame = 0, frameIsVideo = false, hold = 0, holdStarted = 0, remaining = 300;
    let resume = false, playAttempt = 0;

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
    const phase = (name) => { if (!stopped && !failed) onPhase?.(name); };
    const fail = () => {
      if (stopped || failed || complete) return;
      failed = true; playAttempt++; resume = false;
      video.pause(); cancelWork();
      onError?.();
    };
    const paint = (mediaTime = video.currentTime) => {
      if (stopped || failed || video.readyState < 2 || !video.videoWidth) return false;
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.dataset.mediaTime = Number(mediaTime).toFixed(4);
        return true;
      } catch (_) { return false; }
    };

    // At ended, the decoded image is already the last frame. Read it directly:
    // a redundant seek on a non-seekable response can jump back to the start.
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
      complete = true; phase('complete');
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
        let settled = false;
        const remove = () => {
          video.removeEventListener('loadeddata', loaded);
          video.removeEventListener('error', error);
          clearLater(timeout); pending.delete(cancel);
        };
        const finish = (ok) => {
          if (settled) return;
          settled = true; remove(); resolve(ok);
        };
        const cancel = () => finish(false);
        const error = () => finish(false);
        const loaded = () => {
          if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) { finish(false); return; }
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          if (!paint()) { finish(false); return; }
          prepared = true; phase('open'); finish(true); scheduleHold();
        };
        const timeout = later(() => finish(false), 10000);
        pending.add(cancel);
        video.addEventListener('loadeddata', loaded);
        video.addEventListener('error', error);
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
      video.pause(); video.removeAttribute('src');
      try { video.load(); } catch (_) { /* The static final poster remains available. */ }
    };
    return { prepare, play, destroy };
  }

  window.WHHood = { create };
})();
