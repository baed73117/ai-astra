// 예전 웹판의 앱 도우미(서비스 워커)를 지우는 파일 — 유니티판으로 바뀌면서 필요 없어짐 (브라우저가 이 파일을 새로 받으면 스스로 정리하고 사라짐)
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('tinyreaper-') === 0; }).map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.registration.unregister(); })
    .then(function () { return self.clients.matchAll(); })
    .then(function (cs) { cs.forEach(function (c) { try { c.navigate(c.url); } catch (e) { } }); }));
});
