(() => {
  "use strict";

  const PREF_KEY = "stillpoint-prefs-v1";
  const volDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "volume");

  let userScale = 1;
  let lastRequested = 0.32;
  let lastFade = 1;
  let applying = false;
  let rawSetFade = null;

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function savePrefs(patch) {
    const next = { ...loadPrefs(), ...patch };
    localStorage.setItem(PREF_KEY, JSON.stringify(next));
    return next;
  }

  function clamp01(n) {
    return Math.max(0, Math.min(1, n));
  }

  function relabelHush() {
    document.querySelectorAll('[data-sound="white"]').forEach((btn) => {
      btn.textContent = "Hush";
    });
    const nameEl = document.getElementById("session-sound-name");
    if (nameEl && nameEl.textContent === "White") nameEl.textContent = "Hush";
  }

  function playStartBell() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const mute = document.getElementById("mute-btn");
    if (mute && mute.getAttribute("aria-pressed") === "true") return;
    const ctx = playStartBell.ctx || new AudioCtx();
    playStartBell.ctx = ctx;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 528;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.28 * userScale, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.45);
  }

  function bedRouted() {
    const e = window.StillpointSound;
    return !!(e && typeof e.isBedRouted === "function" && e.isBedRouted());
  }

  function applyScale() {
    const audio = document.getElementById("soundscape");
    if (audio && volDesc && volDesc.set) {
      applying = true;
      // routed: the bed gain carries the scale; el.volume stays 1 (no scale², fade held)
      volDesc.set.call(audio, bedRouted() ? 1 : clamp01(lastRequested * userScale));
      applying = false;
    }
    if (rawSetFade) rawSetFade(clamp01(lastFade * userScale));
    const engine = window.StillpointSound;
    if (engine && typeof engine.setBedScale === "function") engine.setBedScale(userScale);
  }

  function wrapAudioVolume() {
    const audio = document.getElementById("soundscape");
    if (!audio || !volDesc || audio.__stillpointVolWrap) return;
    Object.defineProperty(audio, "volume", {
      configurable: true,
      get() {
        return volDesc.get.call(audio);
      },
      set(v) {
        if (applying || bedRouted()) {
          // routed: the bed gain carries level and scale; el.volume stays 1 in every engine
          volDesc.set.call(audio, applying ? clamp01(v) : 1);
          return;
        }
        lastRequested = Number(v);
        applying = true;
        volDesc.set.call(audio, clamp01(lastRequested * userScale));
        applying = false;
      }
    });
    audio.__stillpointVolWrap = true;
  }

  function wrapSynthFade() {
    const engine = window.StillpointSound;
    if (!engine || typeof engine.setFade !== "function" || engine.__stillpointVolWrap) return;
    rawSetFade = engine.setFade.bind(engine);
    engine.setFade = (t) => {
      lastFade = Number(t);
      rawSetFade(clamp01(lastFade * userScale));
    };
    engine.__stillpointVolWrap = true;
  }

  function setScaleFromSlider(value) {
    const n = Number(value);
    userScale = clamp01((Number.isFinite(n) ? n : 100) / 100);
    savePrefs({ bedVolume: userScale });
    document.querySelectorAll(".bed-volume").forEach((el) => {
      el.value = String(Math.round(userScale * 100));
    });
    applyScale();
  }

  function restorePrefs() {
    const prefs = loadPrefs();
    if (typeof prefs.bedVolume === "number") {
      userScale = clamp01(prefs.bedVolume);
    }
    document.querySelectorAll(".bed-volume").forEach((el) => {
      el.value = String(Math.round(userScale * 100));
    });
    if (prefs.type) {
      const type = document.querySelector(`input[name="session-type"][value="${prefs.type}"]`);
      if (type) {
        type.checked = true;
        type.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    if (prefs.custom) {
      const custom = document.getElementById("custom-minutes");
      if (custom) {
        custom.value = String(prefs.custom);
        custom.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } else if (prefs.duration != null) {
      const dur = document.querySelector(`input[name="duration"][value="${prefs.duration}"]`);
      if (dur) {
        dur.checked = true;
        dur.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }

  function bind() {
    document.querySelectorAll('input[name="session-type"]').forEach((input) => {
      input.addEventListener("change", () => savePrefs({ type: input.value }));
    });
    document.querySelectorAll('input[name="duration"]').forEach((input) => {
      input.addEventListener("change", () => savePrefs({ duration: input.value, custom: "" }));
    });
    const custom = document.getElementById("custom-minutes");
    if (custom) {
      custom.addEventListener("input", () => {
        const n = Number.parseInt(custom.value, 10);
        savePrefs({ custom: Number.isFinite(n) && n >= 1 ? n : "" });
      });
    }
    document.querySelectorAll(".bed-volume").forEach((el) => {
      el.addEventListener("input", () => setScaleFromSlider(el.value));
    });
    document.querySelectorAll(".sound-chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => setTimeout(relabelHush, 0));
    });
    const begin = document.getElementById("begin-btn");
    if (begin) begin.addEventListener("click", playStartBell);
    if (typeof window.registerStillpointSW === "function") {
      window.registerStillpointSW();
    }
  }

  function init() {
    wrapAudioVolume();
    wrapSynthFade();
    restorePrefs();
    const engine = window.StillpointSound;
    if (engine && typeof engine.setBedScale === "function") engine.setBedScale(userScale);
    applyScale();
    relabelHush();
    bind();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
