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
    constructor() { log.ctx = this; this.sampleRate = 8000; this.currentTime = 10; this.state = "running"; this.destination = { id: "dest" }; }
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
  const fresh = log.gains[log.gains.length - 1];
  assert.notStrictEqual(fresh, bedGain, "fresh gain for the next sit");
  assert.strictEqual(fresh.gain.value, 0, "fresh gain starts silent (no re-peak tick at reset)");
  assert.deepStrictEqual(fresh.gain.calls.slice(-1), [["target", 0.32, 10.12, 0.03]], "then returns to the 0.32 bed level");
});

test("routed bed carries the 0.32 bed level on its gain, el.volume held at 1", () => {
  const { S, log } = load();
  S.setKind("soft");
  const el = { ...fakeEl(), volume: 0.32 };
  S.fadeOutEarly(el);
  const bedGain = log.gains[log.gains.length - 1];
  assert.deepStrictEqual(bedGain.gain.calls.slice(-2, -1), [["set", 0.32, 10]], "fade starts from 0.32, not unity");
  assert.strictEqual(el.volume, 1);
});

test("suspended context (WebKit): awaits resume(), bed keeps playing, then fades", async () => {
  const { S, log } = load();
  S.setKind("soft");
  S.prime();
  const el = fakeEl();
  log.ctx.state = "suspended";
  log.ctx.resume = function () { return Promise.resolve().then(() => { this.state = "running"; }); };
  assert.strictEqual(S.fadeOutEarly(el), true);
  assert.strictEqual(el.paused, false, "no hard cut while resuming");
  assert.strictEqual(S.isFading(), true, "re-entry guard holds while resuming");
  assert.strictEqual(log.media, 0, "not routed until the context runs");
  await wait(0);
  const bedGain = log.gains[log.gains.length - 1];
  assert.strictEqual(log.media, 1);
  assert.deepStrictEqual(bedGain.gain.calls.slice(-1), [["target", 0, 10, 0.3]]);
  assert.strictEqual(el.paused, false);
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

test("early end inside the natural fade never raises the level (master at 0.2)", () => {
  const { S, log } = load();
  S.setKind("white");
  const master = log.gains[0];
  const voice = log.gains[log.gains.length - 1];
  S.setFade(0.2);
  const n = master.gain.calls.length;
  S.fadeOutEarly(null);
  const after = master.gain.calls.slice(n);
  assert.ok(!after.some((c) => c[0] !== "cancel" && c[1] > 0.2), "master not raised: " + JSON.stringify(after));
  assert.deepStrictEqual(voice.gain.calls.slice(-1), [["target", 0, 10, 0.3]]);
});

test("script.js endAudioEarly keeps the faded bed volume and master level", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
  const m = js.match(/function endAudioEarly\(\) \{[\s\S]*?\n  \}\n/);
  assert.ok(m, "endAudioEarly found");
  const MUSIC_VOL = 0.5;
  const soundscape = { volume: MUSIC_VOL * 0.2, paused: false };
  const vols = [soundscape.volume];
  const fades = [];
  const els = { soundscape: new Proxy(soundscape, { set(o, k, v) { o[k] = v; if (k === "volume") vols.push(v); return true; } }) };
  const eng = { setFade(t) { fades.push(t); }, fadeOutEarly() { return true; } };
  const stopSoundscapeFade = () => { els.soundscape.volume = MUSIC_VOL; eng.setFade(1); };
  const run = new Function("els", "engine", "state", "pauseAudio", "stopSoundscapeFade", "MUSIC_VOL",
    m[0] + "\nendAudioEarly();");
  run(els, () => eng, { muted: false, musicEnabled: true }, () => {}, stopSoundscapeFade, MUSIC_VOL);
  assert.ok(vols.every((v) => v <= 0.1 + 1e-9), "bed volume never rises: " + vols);
  assert.ok(fades.every((t) => t <= 0.2), "master never rises: " + fades);
});

test("sound switch / mute during the early fade leaves the level alone", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
  const m = js.match(/function updateSoundscapeVolume\(\) \{[\s\S]*?\n  \}\n/);
  assert.ok(m, "updateSoundscapeVolume found");
  const sb = js.match(/function setBedVolume\(v\) \{[\s\S]*?\n  \}\n/);
  assert.ok(sb, "setBedVolume found");
  const run = new Function("els", "engine", "state", "fadeFactor", "MUSIC_VOL", sb[0] + m[0] + "\nupdateSoundscapeVolume();");
  const go = (fading) => {
    const sets = [];
    const fades = [];
    const soundscape = { _v: 0.1, get volume() { return this._v; }, set volume(v) { this._v = v; sets.push(v); } };
    const eng = { isFading: () => fading, setFade(t) { fades.push(t); } };
    run({ soundscape }, () => eng, { musicEnabled: true, muted: false, isOpen: false, sessionActive: false }, () => 1, 0.5);
    return { sets, fades };
  };
  assert.deepStrictEqual(go(true), { sets: [], fades: [] }, "no .volume reset, no setFade(1) while fading");
  assert.deepStrictEqual(go(false), { sets: [0.5], fades: [1] }, "restores once the fade is over");
});

test("mute then unmute during the early fade never raises the master above 0.2", () => {
  const { S, log } = load();
  S.setKind("white");
  const g = log.gains[0].gain;
  const levels = [];
  const orig = g.setTargetAtTime.bind(g);
  g.setTargetAtTime = (v, t, c) => { orig(v, t, c); g.value = v; levels.push(v); };
  S.setFade(0.2);
  S.fadeOutEarly(null);
  S.setMuted(true);
  S.setMuted(false);
  S.setFade(1);
  assert.ok(levels.length >= 3);
  assert.ok(levels.every((v) => v <= 0.2), "levels: " + levels);
});

test("volume slider scales the routed bed gain live (WebKit ignores el.volume once routed)", async () => {
  const { S, log } = load();
  S.setKind("soft");
  S.setBedScale(0.5);
  const el = { ...fakeEl(), volume: 0.16 }; // premium.js already applied 0.32 × 0.5 to el.volume
  S.fadeOutEarly(el);
  const bedGain = log.gains[log.gains.length - 1];
  assert.deepStrictEqual(bedGain.gain.calls.slice(-2, -1), [["set", 0.16, 10]], "routing carries 0.32 × 0.5, not double-scaled");
  await wait(1700);
  const fresh = log.gains[log.gains.length - 1];
  assert.deepStrictEqual(fresh.gain.calls.slice(-1), [["target", 0.16, 10.12, 0.03]], "fresh gain returns to 0.32 × scale");
  S.setBedScale(0.3);
  assert.deepStrictEqual(fresh.gain.calls.slice(-1), [["target", 0.32 * 0.3, 10, 0.05]], "slider move applies live");
  assert.strictEqual(S.setBedVolume(el, 0.32), true);
  assert.deepStrictEqual(fresh.gain.calls.slice(-1), [["target", 0.32 * 0.3, 10, 0.05]], "setBedVolume keeps the slider scale");
  assert.strictEqual(el.volume, 1);
});
