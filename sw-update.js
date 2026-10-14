// Shared service-worker registration + update checks for script.js and premium.js.
// Kept outside those IIFEs so both call sites share one visibility listener.
(() => {
  "use strict";

  const SW_URL = "./sw.js";
  const THROTTLE_MS = 60000;
  const VIS_FLAG = "__stillpointSwVisHook";
  const LAST_KEY = "__stillpointSwLastVisUpdate";

  function registerStillpointSW() {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register(SW_URL, { updateViaCache: "none" })
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {});

    if (window[VIS_FLAG]) return;
    window[VIS_FLAG] = true;
    window[LAST_KEY] = 0;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      if (!("serviceWorker" in navigator)) return;
      const now = Date.now();
      if (now - (window[LAST_KEY] || 0) < THROTTLE_MS) return;
      window[LAST_KEY] = now;
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => (reg ? reg.update() : undefined))
        .catch(() => {});
    });
  }

  window.registerStillpointSW = registerStillpointSW;
})();
