/* Parkutut Cat Caddy offline cache.
   The app page: network first (always the newest when there is signal), cached copy when offline.
   Course files, elevation, icons and fonts: served from the cache at once and refreshed in the background. */
const CACHE = "parkutut-v1";
const SHELL = ["caddy.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "parkutut-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
const COURSES = ["imperial-karawaci", "pangkalan-jati", "pondok-cabe", "cilangkap"];
const WARM = COURSES.flatMap(c => [`data/${c}.js`, `data/${c}-elevation.json`]);
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
    .then(() => caches.open(CACHE)).then(c => Promise.all(WARM.map(u => fetch(u).then(r => r.ok && c.put(u, r)).catch(() => 0)))));   // every course ready offline
});
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  const page = req.mode === "navigate" || url.pathname.endsWith("/caddy.html");
  const asset = url.pathname.includes("/data/") || /\.(png|webmanifest)$/.test(url.pathname) || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (page) {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put(url.origin + url.pathname, c)); return r; })
      .catch(() => caches.match(url.origin + url.pathname).then(r => r || caches.match("caddy.html"))));
  } else if (asset) {
    e.respondWith(caches.open(CACHE).then(k => k.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") k.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })));
  }
});
