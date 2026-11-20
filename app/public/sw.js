// App 外壳离线缓存。构建时由 vite.config.ts 注入文件列表和版本号。
// 注意：课程音频和录音存在 IndexedDB，不经过这里，也不会上传。
const VERSION = '__VERSION__';
const CACHE = `shell-${VERSION}`;
const PRECACHE = self.__PRECACHE__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // 页面导航：网络优先（拿到新版本），断网时回退到缓存的外壳
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./', { cacheName: CACHE, ignoreVary: true })));
    return;
  }
  // 静态资源：缓存优先。ignoreVary：Vite 产物带 crossorigin，请求会多一个 Origin 头，
  // 服务器若返回 Vary: Origin，默认匹配会失败、导致离线时 JS/CSS 加载不出来
  e.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req)));
});
