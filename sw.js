// sw.js — 오프라인에서도 사이트가 열리게 하는 작은 서비스 워커
// 항상 인터넷에서 최신 파일을 먼저 받고, 안 되면 저장해 둔 파일을 써요.
const CACHE = "revide-v1";
const SHELL = ["./", "./index.html", "./config.js", "./manifest.webmanifest",
  "./js/app.js", "./js/store.js", "./js/classify.js", "./js/markdown.js", "./icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html")))
  );
});
