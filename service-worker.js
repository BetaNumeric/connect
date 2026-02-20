const CACHE_NAME = "connect-v40";
const REMOTE_CACHE_ORIGINS = new Set(["https://cdn.jsdelivr.net"]);

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./a2hs.js",
  "./sketch.js",
  "./data/icon_32.png",
  "./data/icon_192.png",
  "./data/icon_512.png",
  "./data/levels/index.json",
  "./data/levels/levels-data.js",
  "https://cdn.jsdelivr.net/npm/p5@1.9.4/lib/p5.min.js",
  "https://cdn.jsdelivr.net/npm/planck-js@0.3.31/dist/planck.min.js"
];

const toAbsoluteUrl = (path) => new URL(path, self.location).toString();

async function cacheUrls(cache, urls) {
  await Promise.allSettled(
    urls.map(async (url) => {
      const absoluteUrl = toAbsoluteUrl(url);
      const request = new Request(absoluteUrl, { cache: "no-store" });
      const response = await fetch(request);
      if (!response || !response.ok) return;
      await cache.put(request, response);
    })
  );
}

function resolveLevelPath(entry) {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return "";
  return String(entry.file ?? entry.path ?? entry.name ?? "");
}

function toLevelAssetUrl(entry) {
  const rawPath = resolveLevelPath(entry).trim();
  if (!rawPath) return null;
  if (/^(https?:)?\/\//i.test(rawPath) || rawPath.startsWith("/")) return rawPath;
  return `./data/levels/${rawPath}`;
}

async function getLevelAssetUrls() {
  try {
    const indexResponse = await fetch(toAbsoluteUrl("./data/levels/index.json"), { cache: "no-store" });
    if (!indexResponse.ok) return [];
    const indexJson = await indexResponse.json();
    const levels = Array.isArray(indexJson?.levels) ? indexJson.levels : [];
    return levels.map(toLevelAssetUrl).filter(Boolean);
  } catch (_err) {
    return [];
  }
}

function shouldCache(url) {
  if (url.origin === self.location.origin) return true;
  return REMOTE_CACHE_ORIGINS.has(url.origin);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const levelAssets = await getLevelAssetUrls();
      await cacheUrls(cache, [...CORE_ASSETS, ...levelAssets]);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.protocol !== "http:" && requestUrl.protocol !== "https:") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response && response.ok && shouldCache(requestUrl)) {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch (err) {
        if (request.mode === "navigate") {
          const appShell = await cache.match(toAbsoluteUrl("./index.html"));
          if (appShell) return appShell;
        }
        throw err;
      }
    })()
  );
});
