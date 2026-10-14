// Run: node --test tests/
// Loads sw-update.js in a sandbox and checks register→update, visibility throttle, and single listener.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const src = fs.readFileSync(path.join(__dirname, "..", "sw-update.js"), "utf8");

function load() {
  const updateCalls = [];
  const registerCalls = [];
  const listeners = {};
  let registration = {
    update() {
      updateCalls.push("update");
      return Promise.resolve();
    },
  };
  const serviceWorker = {
    register(url, opts) {
      registerCalls.push({ url, opts });
      return Promise.resolve(registration);
    },
    getRegistration() {
      return Promise.resolve(registration);
    },
  };
  const navigator = { serviceWorker };
  const document = {
    visibilityState: "hidden",
    addEventListener(type, fn) {
      (listeners[type] || (listeners[type] = [])).push(fn);
    },
  };
  const window = { navigator, document };
  // Mirror browser globals the helper reads.
  Object.defineProperty(window, "navigator", { value: navigator, writable: true });
  const sandbox = {
    window,
    navigator,
    document,
    Date,
    Promise,
    undefined,
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return {
    registerStillpointSW: sandbox.window.registerStillpointSW,
    updateCalls,
    registerCalls,
    listeners,
    document,
    navigator,
    window: sandbox.window,
    setRegistration(reg) { registration = reg; },
  };
}

test("registerStillpointSW is exported on window", () => {
  const { registerStillpointSW } = load();
  assert.strictEqual(typeof registerStillpointSW, "function");
});

test("register calls register(./sw.js, updateViaCache none) then update()", async () => {
  const { registerStillpointSW, registerCalls, updateCalls } = load();
  registerStillpointSW();
  await Promise.resolve();
  await Promise.resolve();
  assert.strictEqual(registerCalls.length, 1);
  assert.strictEqual(registerCalls[0].url, "./sw.js");
  assert.strictEqual(registerCalls[0].opts.updateViaCache, "none");
  assert.strictEqual(Object.keys(registerCalls[0].opts).join(","), "updateViaCache");
  assert.strictEqual(updateCalls.length, 1);
});

test("no-ops when serviceWorker is missing", () => {
  const srcLocal = fs.readFileSync(path.join(__dirname, "..", "sw-update.js"), "utf8");
  const window = {};
  const navigator = {};
  const document = { addEventListener() { throw new Error("should not bind"); } };
  const sandbox = { window, navigator, document, Date, Promise, undefined };
  vm.createContext(sandbox);
  vm.runInContext(srcLocal, sandbox);
  assert.doesNotThrow(() => sandbox.window.registerStillpointSW());
});

test("visibilitychange binds once across two register calls", () => {
  const { registerStillpointSW, listeners } = load();
  registerStillpointSW();
  registerStillpointSW();
  assert.strictEqual((listeners.visibilitychange || []).length, 1);
});

test("visibility visible triggers update; second call within 60s is throttled", async () => {
  let now = 1_000_000;
  const RealDate = Date;
  const FakeDate = class extends RealDate {
    constructor(...a) { return a.length ? new RealDate(...a) : new RealDate(now); }
    static now() { return now; }
  };

  const updateCalls = [];
  const registration = {
    update() { updateCalls.push(FakeDate.now()); return Promise.resolve(); },
  };
  const serviceWorker = {
    register() { return Promise.resolve(registration); },
    getRegistration() { return Promise.resolve(registration); },
  };
  const listeners = {};
  const document = {
    visibilityState: "hidden",
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
  };
  const navigator = { serviceWorker };
  const window = {};
  const sandbox = { window, navigator, document, Date: FakeDate, Promise, undefined };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);

  sandbox.window.registerStillpointSW();
  await Promise.resolve();
  await Promise.resolve();
  // clear the post-register update
  updateCalls.length = 0;

  document.visibilityState = "visible";
  listeners.visibilitychange[0]();
  await Promise.resolve();
  await Promise.resolve();
  assert.strictEqual(updateCalls.length, 1);

  // 30s later — throttled
  now += 30_000;
  listeners.visibilitychange[0]();
  await Promise.resolve();
  await Promise.resolve();
  assert.strictEqual(updateCalls.length, 1);

  // 60s after first vis update — allowed
  now += 30_000;
  listeners.visibilitychange[0]();
  await Promise.resolve();
  await Promise.resolve();
  assert.strictEqual(updateCalls.length, 2);
});

test("hidden visibility does not call update", async () => {
  const { registerStillpointSW, listeners, document, updateCalls } = load();
  registerStillpointSW();
  await Promise.resolve();
  await Promise.resolve();
  updateCalls.length = 0;
  document.visibilityState = "hidden";
  listeners.visibilitychange[0]();
  await Promise.resolve();
  assert.strictEqual(updateCalls.length, 0);
});

test("update() rejection is swallowed", async () => {
  const updateCalls = [];
  const registration = {
    update() {
      updateCalls.push("update");
      return Promise.reject(new Error("network"));
    },
  };
  const serviceWorker = {
    register() { return Promise.resolve(registration); },
    getRegistration() { return Promise.resolve(registration); },
  };
  const document = { visibilityState: "hidden", addEventListener() {} };
  const navigator = { serviceWorker };
  const window = {};
  const sandbox = { window, navigator, document, Date, Promise, undefined };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  assert.doesNotThrow(() => sandbox.window.registerStillpointSW());
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.strictEqual(updateCalls.length, 1);
});
