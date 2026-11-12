// Farbaek's service worker: the offline page and the device page when there's
// no network, and notifications. It keeps only pages with nothing personal in
// them (the offline page, and the device page, which reads the browser's own
// storage), the logo and icons, and Next.js's built files, whose names change
// with their contents. Never a page with anyone's data, and it opens only
// Farbaek's own addresses (ADR 0079, ADR 0192).
const CACHE = "farbaek-offline-v2";
const STATIC = "farbaek-static-v1";
const OFFLINE_URL = "/offline";
const DEVICE_URL = "/device";
const STATIC_LIMIT = 400;
const STATIC_PATH = /^\/_next\/static\//;

// The built files a page names, so the device page works offline straight after installing.
const builtFiles = (html) => [...new Set(html.match(/\/_next\/static\/[^"'\s)\\<>]+/g) || [])];

// The device page and the built files it names live in the offline cache, which is never trimmed, so
// however many other built files pile up, the device page still opens with no connection. A new
// version of the page replaces the kept one only once every file it names is kept too (a flaky
// connection keeps the old, whole version); then the files only the old version named are let go.
async function keepDevicePage(response) {
  if (!response || !response.ok || response.redirected || response.type !== "basic") return;
  const html = await response.clone().text();
  const files = builtFiles(html);
  const cache = await caches.open(CACHE);
  const landed = await Promise.all(
    files.map((path) =>
      cache
        .match(path)
        .then((hit) => hit || caches.match(path).then((elsewhere) => (elsewhere ? cache.put(path, elsewhere) : cache.add(path))))
        .then(() => true)
        .catch(() => false),
    ),
  );
  if (landed.includes(false)) return;
  await cache.put(DEVICE_URL, response);
  const named = new Set(files.map((path) => new URL(path, self.location.origin).href));
  const keys = await cache.keys();
  await Promise.all(keys.filter((key) => STATIC_PATH.test(new URL(key.url).pathname) && !named.has(key.url)).map((key) => cache.delete(key)));
}

async function trimStatic() {
  const cache = await caches.open(STATIC);
  const keys = await cache.keys();
  // Oldest first: the cache lists entries in the order they were added.
  await Promise.all(keys.slice(0, Math.max(0, keys.length - STATIC_LIMIT)).map((key) => cache.delete(key)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/brand/farbaek-app-192.png", "/brand/farbaek-logo.webp"]))
      // The device page is a bonus: an install never fails for it.
      .then(() => fetch(DEVICE_URL, { credentials: "omit" }).then(keepDevicePage).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== STATIC).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Built files never change under the same name: from the cache when it has them, kept when it doesn't.
  if (STATIC_PATH.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok && response.type === "basic") {
              const copy = response.clone();
              event.waitUntil(
                caches
                  .open(STATIC)
                  .then((cache) => cache.put(request, copy))
                  .then(trimStatic),
              );
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode !== "navigate") return;
  // The device page: from the network when there is one (and kept fresh), else the kept copy. A server
  // error falls back to the kept copy too, since the page needs nothing from the server.
  if (url.pathname === DEVICE_URL) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status >= 500) return caches.match(DEVICE_URL).then((hit) => hit || response);
          event.waitUntil(keepDevicePage(response.clone()).catch(() => undefined));
          return response;
        })
        .catch(() => caches.match(DEVICE_URL).then((hit) => hit || caches.match(OFFLINE_URL))),
    );
    return;
  }
  // Every other page comes from the network as always; only when it fails does the offline page show.
  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
});

const ownPath = (value) => (typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/app");

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Farbaek";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      icon: "/brand/farbaek-app-192.png",
      badge: "/brand/farbaek-icon-48.png",
      data: { url: ownPath(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(ownPath(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) if (w.url === url && "focus" in w) return w.focus();
      return self.clients.openWindow(url);
    }),
  );
});
