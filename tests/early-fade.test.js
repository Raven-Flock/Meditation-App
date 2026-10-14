// Run: node --test tests/
// Early-end fade (Sound Design spec, P1 PR A): per-layer gain, tau 0.30, stop at +1.6 s.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const src = fs.readFileSync(path.join(__dirname, "..", "sounds.js"), "utf8");

function param(value) {
  return {
    value,
    calls: [],
    setValueAtTime(v, t) { this.calls.push(["set", v, t]); },
    setTargetAtTime(v, t, c) { this.calls.push(["target", v, t, c]); },
    linearRampToValueAtTime(v, t) { this.calls.push(["linear", v, t]); },
    cancelScheduledValues(t) { this.calls.push(["cancel", t]); },
  };
}

function load() {
  const log = { sources: [], gains: [], media: 0 };
  class FakeCtx {
    constructor() { this.sampleRate = 8000; this.currentTime = 10; this.state = "running"; this.destination = { id: "dest" }; }
    resume() { return Promise.resolve(); }
    node(extra) { return { connected: true, outs: [], connect(n) { this.outs.push(n); }, disconnect() { this.connected = false; this.outs = []; }, ...extra }; }
    createGain() { const g = this.node({ gain: param(1) }); log.gains.push(g); return g; }
    createBiquadFilter() { return this.node({ frequency: param(0), Q: param(0), type: "" }); }
    createBuffer(ch, n, sr) { const d = new Float32Array(n); return { length: n, sampleRate: sr, getChannelData: () => d }; }
    createBufferSource() {
      const s = this.node({ stopAt: null, start() {}, stop(t) { this.stopAt = t === undefined ? "now" : t; } });
      log.sources.push(s);
      return s;
    }
    createMediaElementSource() { log.media += 1; return this.node({}); }
  }
  const window = { AudioContext: FakeCtx };
  const sandbox = { window, setTimeout, clearTimeout, Math, Float32Array, Set, Promise, Boolean, Number };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return { S: window.StillpointSound, log };
}

function fakeEl() {
  return { paused: false, currentTime: 42, pause() { this.paused = true; } };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("Hush early end: its own gain gets cancel/set/setTarget(0, t, 0.30), sources stop at t+1.6", () => {
  const { S, log } = load();
  S.setKind("white");
  const voice = log.gains[log.gains.length - 1];
  assert.strictEqual(S.fadeOutEarly(null), true);
  assert.deepStrictEqual(voice.gain.calls.slice(-3), [["cancel", 10], ["set", 0.2, 10], ["target", 0, 10, 0.3]]);
  assert.strictEqual(log.sources[0].stopAt, 11.6);
});

test("file bed early end fades its own gain (not master), then pauses and resets", async () => {
  const { S, log } = load();
  S.setKind("soft");
  const el = fakeEl();
  S.fadeOutEarly(el);
  assert.strictEqual(log.media, 1);
  const bedGain = log.gains[log.gains.length - 1];
  assert.notStrictEqual(bedGain, log.gains[0], "not the master gain");
  assert.deepStrictEqual(bedGain.gain.calls.slice(-1), [["target", 0, 10, 0.3]]);
  assert.strictEqual(el.paused, false, "keeps playing during the fade");
  assert.strictEqual(S.isFading(), true);
  await wait(1700);
  assert.strictEqual(el.paused, true);
  assert.strictEqual(el.currentTime, 0);
  assert.strictEqual(S.isFading(), false);
  assert.strictEqual(log.gains[log.gains.length - 1].gain.value, 1, "fresh gain at unity for the next sit");
});

test("re-entry guard: a second early end during a fade does nothing", () => {
  const { S, log } = load();
  S.setKind("white");
  S.fadeOutEarly(null);
  const before = log.gains.map((g) => g.gain.calls.length);
  assert.strictEqual(S.fadeOutEarly(null), false);
  assert.deepStrictEqual(log.gains.map((g) => g.gain.calls.length), before);
});

test("muted: stops with no fade", () => {
  const { S, log } = load();
  S.setKind("white");
  const el = fakeEl();
  S.fadeOutEarly(el, { muted: true });
  assert.strictEqual(el.paused, true);
  assert.strictEqual(S.isFading(), false);
  assert.ok(!log.gains.some((g) => g.gain.calls.some((c) => c[0] === "target" && c[3] === 0.3)));
});

test("new sit mid-fade: old Hush sources hard-stop with a 40 ms ramp, fresh voice gain", () => {
  const { S, log } = load();
  S.setKind("white");
  const oldVoice = log.gains[log.gains.length - 1];
  const oldSrc = log.sources[0];
  S.fadeOutEarly(null);
  S.start("white");
  assert.strictEqual(S.isFading(), false);
  assert.deepStrictEqual(oldVoice.gain.calls.slice(-1), [["target", 0, 10, 0.01]]);
  assert.ok(Math.abs(oldSrc.stopAt - 10.04) < 1e-9);
  const newVoice = log.gains[log.gains.length - 1];
  assert.notStrictEqual(newVoice, oldVoice);
});
