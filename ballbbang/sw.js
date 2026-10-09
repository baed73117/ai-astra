// 볼빵! 아스트라 — 앱으로 설치할 때 쓰는 도우미 (서비스 워커)
// · 게임 페이지는 항상 새로 받아 봄 (인터넷이 끊겼을 때만 저장해 둔 것)
// · 그림·소리는 주소에 ?v=확인값이 붙어 있어서, 한 번 받으면 저장해 두고 다시 씀 (그림이 바뀌면 확인값이 바뀌어 새로 받음)
// · 랭킹(구글)·기타 요청은 건드리지 않음
const CACHE = 'ballbbang-app-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ballbbang-app-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/(^|\.)google(usercontent)?\.com$/.test(url.hostname)) return;
  const same = url.origin === self.location.origin;
  if (req.mode === 'navigate') {
    if (!same) return;
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(new URL('./', self.registration.scope).href, c)).catch(() => {}); }
      return r;
    }).catch(() => caches.match(new URL('./', self.registration.scope).href).then(r => r || Response.error())));
    return;
  }
  const keep = (same && url.searchParams.has('v')) || url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'fonts.gstatic.com';
  if (!keep) return;
  e.respondWith(caches.open(CACHE).then(async ca => {
    const hit = await ca.match(req);
    if (hit) return hit;
    const r = await fetch(req);
    if (r.ok || r.type === 'opaque') { ca.put(req, r.clone()).then(() => same && trim(ca, url)).catch(() => {}); }   // opaque = 다른 주소의 PixiJS
    return r;
  }).catch(() => fetch(req)));
});

// 같은 파일의 예전 판(?v=가 다른 것)은 지워서 폰 공간을 아낌
async function trim(ca, url) {
  for (const k of await ca.keys()) {
    const u = new URL(k.url);
    if (u.origin === url.origin && u.pathname === url.pathname && u.search !== url.search) await ca.delete(k);
  }
}
