(() => {
  "use strict";

  const VOL = {
    white: 0.20
  };

  const FILE_KINDS = new Set(["soft", "shore", "wild", "rain", "fall"]);

  let ctx = null;
  let master = null;
  let nodes = [];
  let timers = [];
  let kind = "soft";
  let muted = false;
  let enabled = true;
  let running = false;
  let voiceOut = null;
  let brownCache = null;
  // Early-end fade (Sound Design spec): each layer fades on its own gain, never master.
  let bedSrc = null;   // MediaElementSource for the <audio> bed (created on first early end)
  let bedGain = null;  // per-layer gain for the file bed (music bed / nature chips)
  let fade = null;     // { timer, hush: [nodes], hushGain, bedGain, el } while a fade runs
  const EARLY_TAU_S = 0.30;
  const EARLY_STOP_S = 1.6;

  // Fade the outgoing voice over ~40 ms on the audio clock before stopping it (no hard cut).
  const STOP_RAMP_S = 0.04;

  function audioCtx() {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    if (!ctx) ctx = new C();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    if (!master) {
      master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
    }
    return ctx;
  }

  // The 20 s brown buffer takes 30-40 ms of main-thread work to fill, so build it once per
  // AudioContext and reuse it on every start.
  function brownBuffer(seconds) {
    const c = audioCtx();
    if (brownCache && brownCache.ctx === c && brownCache.seconds === seconds) return brownCache.buf;
    const n = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last;
    }
    let peak = 0.0001;
    for (let i = 0; i < n; i += 1) {
      const a = Math.abs(data[i]);
      if (a > peak) peak = a;
    }
    const scale = 0.9 / peak;
    for (let i = 0; i < n; i += 1) data[i] *= scale;
    brownCache = { ctx: c, seconds, buf };
    return buf;
  }

  function sourceFrom(buf, loop = true) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    return src;
  }

  function filter(type, freq, q) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q) f.Q.value = q;
    return f;
  }

  function gain(value) {
    const g = ctx.createGain();
    g.gain.value = value;
    return g;
  }

  function track(node) {
    nodes.push(node);
    return node;
  }

  function hardStop(list) {
    list.forEach((node) => {
      try {
        if (node.stop) node.stop();
      } catch {}
      try {
        node.disconnect();
      } catch {}
    });
  }

  function stopAll() {
    timers.forEach((id) => clearTimeout(id));
    timers = [];
    const old = nodes;
    const out = voiceOut;
    nodes = [];
    voiceOut = null;
    running = false;
    if (!old.length) return;
    if (!ctx || ctx.state !== "running" || !out) {
      hardStop(old);
      return;
    }
    const now = ctx.currentTime;
    const end = now + STOP_RAMP_S;
    try {
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, end);
    } catch {}
    old.forEach((node) => {
      try {
        if (node.stop) node.stop(end + 0.01);
      } catch {}
    });
    // Disconnect after the ramp and the scheduled stop have run (not tracked in timers,
    // so a following start()/stopAll() can't cancel the cleanup).
    setTimeout(() => hardStop(old), Math.ceil((STOP_RAMP_S + 0.08) * 1000));
  }

  // Route the file bed through Web Audio so its fade works on iOS (which ignores .volume).
  // Lazy: only the first early end routes it; after that the element always plays via bedGain.
  function routeBed(el) {
    if (!el || !audioCtx()) return null;
    if (!bedSrc) {
      try {
        bedSrc = ctx.createMediaElementSource(el);
      } catch {
        return null;
      }
    }
    if (!bedGain) {
      bedGain = ctx.createGain();
      bedGain.gain.value = 1;
      bedSrc.connect(bedGain);
      bedGain.connect(ctx.destination);
    }
    return bedGain;
  }

  function freshBedGain() {
    if (!bedSrc || !ctx) return;
    try { bedSrc.disconnect(); } catch {}
    bedGain = null;
    bedGain = ctx.createGain();
    bedGain.gain.value = 1;
    bedSrc.connect(bedGain);
    bedGain.connect(ctx.destination);
  }

  function fadeParam(g, t, tau) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t); // no cancelAndHold (Safari)
    g.gain.setTargetAtTime(0, t, tau);
  }

  function resetBed(el) {
    try {
      el.pause();
      el.currentTime = 0;
    } catch {}
  }

  // Early end: every active layer fades with tau 0.30 s and stops at +1.6 s.
  // Returns false when a fade is already running (re-entry guard).
  function fadeOutEarly(el, opts = {}) {
    if (fade) return false;
    const mute = Boolean(opts.muted) || muted;
    const bedPlaying = Boolean(el && !el.paused);
    if (mute || !audioCtx() || ctx.state !== "running") {
      stopAll();
      if (el) resetBed(el);
      return true;
    }
    timers.forEach((id) => clearTimeout(id));
    timers = [];
    const t = ctx.currentTime;
    const hush = nodes;
    const hushGain = voiceOut;
    nodes = [];
    voiceOut = null;
    running = false;
    if (hushGain && hush.length) {
      try { fadeParam(hushGain, t, EARLY_TAU_S); } catch {}
      hush.forEach((node) => {
        if (!node.stop) return;
        try {
          node.onended = () => hardStop(hush);
          node.stop(t + EARLY_STOP_S);
        } catch {}
      });
    } else if (hush.length) {
      hardStop(hush);
    }
    let g = null;
    if (bedPlaying) {
      g = routeBed(el);
      if (g) {
        try { fadeParam(g, t, EARLY_TAU_S); } catch {}
      } else {
        resetBed(el);
      }
    }
    const state = { hush, hushGain, bedGain: g, el: bedPlaying ? el : null, timer: null };
    state.timer = setTimeout(() => finishFade(state), Math.ceil(EARLY_STOP_S * 1000));
    fade = state;
    return true;
  }

  function finishFade(state) {
    if (fade !== state) return;
    fade = null;
    if (state.el) resetBed(state.el);
    if (state.bedGain) freshBedGain();
    hardStop(state.hush);
  }

  // A new sit while a fade runs: hard-stop the old sources with a 40 ms ramp, fresh gains.
  function cancelFade() {
    const state = fade;
    if (!state) return;
    fade = null;
    clearTimeout(state.timer);
    const t = ctx ? ctx.currentTime : 0;
    if (state.hushGain && ctx) {
      try { fadeParam(state.hushGain, t, 0.01); } catch {}
      state.hush.forEach((node) => {
        try { if (node.stop) node.stop(t + STOP_RAMP_S); } catch {}
      });
      setTimeout(() => hardStop(state.hush), Math.ceil((STOP_RAMP_S + 0.08) * 1000));
    } else {
      hardStop(state.hush);
    }
    if (state.el) resetBed(state.el);
    if (state.bedGain) freshBedGain();
  }

  function startWhite() {
    audioCtx();
    const src = track(sourceFrom(brownBuffer(20)));
    const lp = track(filter("lowpass", 320, 0.7));
    const noiseG = track(gain(VOL.white));
    voiceOut = noiseG;
    src.connect(lp);
    lp.connect(noiseG);
    noiseG.connect(master);
    src.start();
  }

  function setOutput(vol, mute) {
    if (!master) return;
    let next = mute ? 0 : Math.max(0, Math.min(1, vol));
    if (fade) next = Math.min(next, master.gain.value); // never raise during the early fade
    master.gain.setTargetAtTime(next, audioCtx().currentTime, 0.05);
  }

  function start(nextKind) {
    kind = nextKind || kind;
    if (FILE_KINDS.has(kind) || !enabled) {
      stopAll();
      return;
    }
    audioCtx();
    cancelFade();
    stopAll();
    running = true;
    if (kind === "white") startWhite();
    else running = false;
    setOutput(1, muted);
  }

  window.StillpointSound = {
    kinds: ["soft", "white", "rain", "fall", "shore", "wild"],
    start,
    stop: stopAll,
    fadeOutEarly,
    cancelFade,
    isFading() { return Boolean(fade); },
    setKind(next) {
      if (next === kind && running) return;
      kind = next;
      if (FILE_KINDS.has(next)) stopAll();
      else start(next);
    },
    getKind() { return kind; },
    setEnabled(on) {
      // Only stops. Starting is the page's job (setKind/start on Begin or gesture); restarting
      // here re-launched Hush under a file bed on every mute/unmute.
      enabled = Boolean(on);
      if (!enabled) stopAll();
    },
    setMuted(on) {
      muted = Boolean(on);
      setOutput(1, muted);
    },
    setFade(t) {
      if (!master) return;
      let v = muted || !enabled ? 0 : Math.max(0, Math.min(1, t));
      if (fade) v = Math.min(v, master.gain.value);
      master.gain.setTargetAtTime(v, audioCtx().currentTime, 0.08);
    },
    resume() {
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    },
    isSynth(id) {
      return id === "white";
    }
  };
})();
