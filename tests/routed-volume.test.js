// Run: node --test tests/
// premium.js slider + sounds.js routed bed, in an engine that still honours el.volume once
// routed (Chromium). Only the bed gain may carry the slider scale: 30% → 0.3×, not 0.09×.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const soundsSrc = fs.readFileSync(path.join(root, "sounds.js"), "utf8");
const premiumSrc = fs.readFileSync(path.join(root, "premium.js"), "utf8");

function param(value) {
  return {
    value,
    setValueAtTime(v) { this.value = v; },
    setTargetAtTime(v) { this.value = v; },
    linearRampToValueAtTime(v) { this.value = v; },
    cancelScheduledValues() {},
  };
}

function setup() {
  const log = { gains: [] };
  class FakeCtx {
    constructor() { this.sampleRate = 8000; this.currentTime = 10; this.state = "running"; this.destination = {}; }
    resume() { return Promise.resolve(); }
    node(extra) { return { connect() {}, disconnect() {}, ...extra }; }
    createGain() { const g = this.node({ gain: param(1) }); log.gains.push(g); return g; }
    createBiquadFilter() { return this.node({ frequency: param(0), Q: param(0), type: "" }); }
    createBuffer(ch, n, sr) { const d = new Float32Array(n); return { length: n, sampleRate: sr, getChannelData: () => d }; }
    createBufferSource() { return this.node({ start() {}, stop() {} }); }
    createMediaElementSource() { return this.node({}); }
  }
  class HTMLMediaElement {}
  Object.defineProperty(HTMLMediaElement.prototype, "volume", {
    configurable: true,
    get() { return this._v === undefined ? 1 : this._v; },
    set(v) { this._v = v; },
  });
  const el = Object.assign(new HTMLMediaElement(), { paused: false, currentTime: 42, pause() { this.paused = true; } });
  const listeners = [];
  const slider = { value: "100", addEventListener(t, f) { if (t === "input") listeners.push(f); } };
  const store = {};
  const document = {
    readyState: "complete",
    getElementById: (id) => (id === "soundscape" ? el : null),
    querySelectorAll: (q) => (q === ".bed-volume" ? [slider] : []),
    querySelector: () => null,
    addEventListener() {},
  };
  const window = { AudioContext: FakeCtx };
  const sandbox = {
    window, document, HTMLMediaElement, setTimeout, clearTimeout, Math, Float32Array, Set, Promise, Boolean, Number, JSON, String, Object,
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
  };
  vm.createContext(sandbox);
  vm.runInContext(soundsSrc, sandbox);
  vm.runInContext(premiumSrc, sandbox);
  const S = window.StillpointSound;
  const move = (pct) => { slider.value = String(pct); listeners.forEach((f) => f()); };
  const bed = () => log.gains[log.gains.length - 1].gain.value;
  // Chromium: routed output = raw el.volume × bed gain
  const level = () => el._v * bed();
  return { S, el, move, bed, level };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test("Chromium-style routed bed: 30% slider plays at 0.3× of the bed level, not 0.09×", async () => {
  const { S, el, move, level } = setup();
  S.setKind("soft");
  el.volume = 0.32;            // script.js bed level, unrouted
  move(30);
  near(el._v, 0.32 * 0.3, "unrouted: el.volume carries the scale");
  S.fadeOutEarly(el);          // routes the bed
  near(el._v, 1, "routed: raw el.volume held at 1");
  await wait(1700);
  near(level(), 0.32 * 0.3, "after reset");
  assert.strictEqual(S.setBedVolume(el, 0.32), true);  // script.js setBedVolume → el.volume = 1
  near(el._v, 1, "wrapper does not scale the routed el.volume = 1");
  near(level(), 0.32 * 0.3, "0.3×, not 0.09×");
  move(100);
  near(level(), 0.32, "100% → 1×");
  el.volume = 0.5;             // any later direct write is held at 1 while routed
  near(el._v, 1, "direct write ignored while routed");
});

test("Chromium-style routed bed: slider move during the early fade is held", async () => {
  const { S, el, move, bed } = setup();
  S.setKind("soft");
  el.volume = 0.32;
  move(50);
  S.fadeOutEarly(el);
  await wait(1700);
  el.paused = false;           // next sit plays the bed again
  S.fadeOutEarly(el);          // second early end: fade on an already-routed bed
  const during = bed();
  move(30);
  near(el._v, 1, "el.volume not bumped during the fade");
  near(bed(), during, "gain left on its fade");
  await wait(1700);
  near(el._v * bed(), 0.32 * 0.3, "after the fade the new scale applies");
});
