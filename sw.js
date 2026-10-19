const CACHE = "stillpoint-v29";
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./brand.css",
  "./premium.css",
  "./sounds.js",
  "./script.js",
  "./premium.js",
  "./sw-update.js",
  "./manifest.json",
  "./favicon-32.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-192-maskable.png",
  "./icon-512-maskable.png",
  "./apple-touch-icon.png",
  "./brand/logo-a.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" })));
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      self.clients.claim();
    })()
  );
});

// Beds whose network fetch + cache.put is still in flight, keyed by URL without query.
// lazyCacheAudio's cache.add waits on these instead of downloading the bed a second time.
const pending = new Map();

// Parse a single "bytes=" Range header against a body of `size` bytes.
// Returns {start, end} (inclusive), null if unsatisfiable (416), or undefined if the
// header isn't a single byte range we understand (then the full body is served, per RFC 9110).
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/i.exec(String(header || "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return undefined;
  let start;
  let end = size - 1;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix === 0) return null;
    start = Math.max(0, size - suffix);
  } else {
    start = Number(m[1]);
    if (m[2] !== "") {
      if (Number(m[2]) < start) return undefined;
      end = Math.min(Number(m[2]), size - 1);
    }
  }
  if (start >= size) return null;
  return { start, end };
}

// Serve a Range request from a cached full response. WebKit/Safari need a real 206 for media.
async function rangeResponse(cached, header) {
  const blob = await cached.blob();
  const size = blob.size;
  const range = parseRange(header, size);
  const type = cached.headers.get("Content-Type") || blob.type || "application/octet-stream";
  if (range === undefined) {
    return new Response(blob, { status: 200, headers: { "Content-Type": type, "Content-Length": String(size), "Accept-Ranges": "bytes" } });
  }
  if (range === null) {
    return new Response(null, { status: 416, statusText: "Range Not Satisfiable", headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" } });
  }
  const { start, end } = range;
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": type,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const bed = sameOrigin && (url.pathname.includes("/audio/") || request.destination === "audio" || request.destination === "video");
  const range = bed ? request.headers.get("Range") : null;
  const key = url.origin + url.pathname;
  // GitHub Pages sends Vary: Accept-Encoding and media requests send Accept-Encoding: identity,
  // so bed lookups must ignore Vary or they miss offline. ignoreSearch stays: shell assets are
  // precached without ?v= and requested with it.
  const matchOpts = { ignoreSearch: true, ignoreVary: bed };
  event.respondWith(
    (async () => {
      let cached = await caches.match(request, matchOpts);
      if (!cached && bed && !range && pending.has(key)) {
        await pending.get(key);
        cached = await caches.match(request, matchOpts);
      }
      if (cached) {
        if (!range) return cached;
        try {
          return await rangeResponse(cached, range);
        } catch {
          return fetch(request);
        }
      }
      // Uncached partial request (e.g. Safari's bytes=N-): let the network answer the Range itself.
      // An open-ended bytes=0- (Chromium's first media request) takes the full fetch below, which
      // also stores the bed, so the page's lazyCacheAudio doesn't download it again.
      if (range && !/^bytes=0-$/i.test(range.trim())) return fetch(request);
      try {
        const response = await fetch(bed ? new Request(request.url, { cache: "reload", credentials: "same-origin" }) : request);
        if (response && response.ok && response.status !== 206 && sameOrigin) {
          const copy = response.clone();
          const put = caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          if (bed) {
            pending.set(key, put);
            put.then(() => pending.delete(key));
          }
          event.waitUntil(put);
          // Answer the bytes=0- request with a 206 covering the whole body (Safari wants 206 for media).
          const len = Number(response.headers.get("Content-Length"));
          if (range && response.status === 200 && len > 0 && !response.headers.get("Content-Encoding")) {
            return new Response(response.body, {
              status: 206,
              statusText: "Partial Content",
              headers: {
                "Content-Type": response.headers.get("Content-Type") || "application/octet-stream",
                "Content-Length": String(len),
                "Content-Range": `bytes 0-${len - 1}/${len}`,
                "Accept-Ranges": "bytes",
              },
            });
          }
        }
        return response;
      } catch (err) {
        if (request.mode === "navigate") {
          const fallback = await caches.match("./index.html");
          if (fallback) return fallback;
        }
        throw err;
      }
    })()
  );
});
