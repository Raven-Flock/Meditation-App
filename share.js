// Share Stillpoint (P1 B). Web Share with a clipboard fallback; fixed copy, no stats.
(() => {
  "use strict";

  const URL_ = "https://raven-flock.github.io/Meditation-App/";
  const TEXT = "Stillpoint, a quiet place to sit. Raven Flock — Consider the ravens.";

  function track(method) {
    try {
      if (window.posthog && typeof window.posthog.capture === "function") {
        window.posthog.capture("share_tap", { method });
      }
    } catch {}
  }

  function init() {
    const btn = document.getElementById("share-btn");
    const status = document.getElementById("share-status");
    if (!btn) return;
    const canShare = typeof navigator.share === "function";
    const canCopy = Boolean(navigator.clipboard && navigator.clipboard.writeText);
    if (!canShare && !canCopy) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    btn.addEventListener("click", async () => {
      if (status) status.textContent = "";
      if (canShare) {
        try {
          await navigator.share({ title: "Stillpoint", text: TEXT, url: URL_ });
          track("web_share");
          return;
        } catch (err) {
          if (err && err.name === "AbortError") return;
          if (!canCopy) return;
        }
      }
      try {
        await navigator.clipboard.writeText(`${TEXT} ${URL_}`);
        track("clipboard");
        if (status) status.textContent = "Link copied.";
      } catch {
        btn.hidden = true;
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
