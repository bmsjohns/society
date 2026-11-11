// Prologue Society Scan service worker: keeps the app shell, fonts and artwork available
// offline. API calls are never cached here; the app caches member results itself.
const CACHE = "ps-shell-v1";
const SHELL = ["/", "/scan", "/lookup", "/recent", "/fonts/Karla-Regular.ttf", "/fonts/Karla-SemiBold.ttf",
  "/fonts/NewSpirit-Regular.otf", "/brand/prologue-white.svg", "/brand/prologue-red.svg", "/brand/p-mark-red.svg",
  "/brand/pigeon-coffee-line.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  const isAsset = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/brand/");
  if (isAsset) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    })));
    return;
  }
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || caches.match("/scan"))));
  }
});
