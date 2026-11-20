// Cote IDE 서비스 워커: 한 번 받은 실행 환경(Python·Java·SQLite)과 편집기 파일을 저장해 두고
// 다음 방문부터 바로 쓴다. 페이지(index.html)는 항상 새로 받고, 인터넷이 없을 때만 저장본을 쓴다.
// 사이트를 다시 빌드하면 CACHE 이름이 바뀌어 예전 저장본은 지워진다.
const CACHE = "cote-f9fb119778a2";
const RUNTIME = /\/(py|java|sql)\/[^/]+$/;
const CDN = /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/(monaco-editor|sql\.js)\/[\d.]+\//;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("cote-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if ((sameOrigin && RUNTIME.test(url.pathname)) || CDN.test(req.url)) {
    e.respondWith(cacheFirst(req));
  } else if (sameOrigin && (req.mode === "navigate" || url.pathname.endsWith("/index.html"))) {
    e.respondWith(networkFirst(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  // 버전이 고정된 CDN 스크립트는 응답 내용을 볼 수 없는(opaque) 형태여도 그대로 저장해 둔다
  if (res.ok || res.type === "opaque") cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}
