// App 外壳离线缓存。构建时由 vite.config.ts 注入文件列表和版本号。
// 注意：课程音频和录音存在 IndexedDB，不经过这里，也不会上传。
const VERSION = '__VERSION__';
const CACHE = `shell-${VERSION}`;
const PRECACHE = self.__PRECACHE__;
// 内置公开内容（词典分片、音标、样例课）：用到时才缓存，不随版本号清空
const CONTENT_CACHE = 'content-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== CONTENT_CACHE).map((k) => caches.delete(k))))
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
  const path = new URL(req.url).pathname;
  // 内置样例课（版本号 + 课程包）：网络优先，保证拿到的版本号和课程包是同一版；断网时用缓存
  if (path.includes('/content/sentences/')) {
    e.respondWith(
      caches.open(CONTENT_CACHE).then((c) =>
        fetch(req)
          .then((res) => {
            if (res.ok) c.put(req, res.clone());
            return res;
          })
          .catch(() => c.match(req, { ignoreVary: true })),
      ),
    );
    return;
  }
  // 其它内置内容：先用缓存（离线可用），同时在后台更新，下次打开就是新内容
  if (path.includes('/content/')) {
    e.respondWith(
      caches.open(CONTENT_CACHE).then(async (c) => {
        const hit = await c.match(req, { ignoreVary: true });
        const net = fetch(req)
          .then((res) => {
            if (res.ok) c.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        if (hit) {
          e.waitUntil(net);
          return hit;
        }
        return net;
      }),
    );
    return;
  }
  // 静态资源：缓存优先。ignoreVary：Vite 产物带 crossorigin，请求会多一个 Origin 头，
  // 服务器若返回 Vary: Origin，默认匹配会失败、导致离线时 JS/CSS 加载不出来
  e.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req)));
});
