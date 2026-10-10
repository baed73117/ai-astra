// 꼬마 저승사자 키우기 — 앱으로 설치할 때 쓰는 도우미 (서비스 워커, 볼빵 방식)
// · 게임 페이지는 항상 새로 받아 봄 (인터넷이 끊겼을 때만 저장해 둔 것)
// · 그림·소리·랭킹(구글)·기타 요청은 건드리지 않음 (그림은 같은 이름으로 바뀔 수 있어서 브라우저 기본 저장에 맡김)
const CACHE = 'tinyreaper-app-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('tinyreaper-app-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  const url = new URL(req.url); if (url.origin !== self.location.origin) return;
  const home = new URL('./', self.registration.scope).href;
  e.respondWith(fetch(req).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(home, c)).catch(() => {}); }
    return r;
  }).catch(() => caches.match(home).then(r => r || Response.error())));
});
