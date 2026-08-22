/* eslint-env serviceworker */
/* global self, caches, fetch, Headers, Response */
/* ============================================================
 * Service Worker – Image Cache for LensDance
 * כל תמונה מ-Firebase Storage נשמרת ב-Cache Storage
 * בפעם הבאה נטענת מהדיסק המקומי ב-0ms
 * ============================================================ */

// v3: the fetch filter used to swallow Storage LIST responses as well as image
// downloads, so a gallery kept showing its old contents long after the photos
// were replaced. Bumping the name evicts every stale v2 entry on activate.
const CACHE_NAME = "lensdance-images-v3";

// כמה זמן לשמור תמונה (7 ימים)
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// כמה תמונות מקסימום בcache
const MAX_ENTRIES = 300;

/* ---------- Install ---------- */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

/* ---------- Activate ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ---------- Fetch – Cache First for images ---------- */
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // רק GET
  if (event.request.method !== "GET") return;

  /* Only ever cache the bytes of a single image.
   *
   * This used to match ANY firebasestorage.googleapis.com URL, which also
   * caught the two calls that ask Storage what a folder CONTAINS:
   *   .../o?prefix=MainGallery%2F&delimiter=%2F   (listAll)
   *   .../o/<path>                                (metadata, no alt=media)
   * Those were served cache-first for 7 days, so after the gallery was
   * replaced visitors kept getting the previous directory listing — the app
   * asked for the new photos and the worker answered with the old ones, and
   * the admin's delete loop tried to remove files that no longer existed.
   *
   * A real image download always carries `alt=media`, so require it. Listings
   * and metadata now go straight to the network and stay fresh. */
  const isFirebaseImage =
    url.includes("firebasestorage.googleapis.com") &&
    url.includes("alt=media") &&
    !url.includes(".mp4") &&
    !url.includes(".mov") &&
    !url.includes(".avi") &&
    !url.includes(".webm") &&
    !url.includes(".mkv");

  const isApiImage = url.includes("/api/image");

  if (!isFirebaseImage && !isApiImage) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // נסה מה-cache קודם
      const cached = await cache.match(event.request);
      if (cached) {
        // בדוק גיל
        const dateHeader = cached.headers.get("sw-cached-at");
        if (dateHeader) {
          const age = Date.now() - parseInt(dateHeader, 10);
          if (age < MAX_AGE_MS) {
            return cached; // Cache hit!
          }
        } else {
          return cached; // אין תאריך - תחזיר בכל מקרה
        }
      }

      // Fetch מהרשת
      try {
        const response = await fetch(event.request);
        if (response.ok && response.status === 200) {
          // שמור ב-cache עם timestamp
          const responseToCache = new Response(await response.clone().arrayBuffer(), {
            status: response.status,
            statusText: response.statusText,
            headers: (() => {
              const h = new Headers(response.headers);
              h.set("sw-cached-at", Date.now().toString());
              return h;
            })(),
          });

          cache.put(event.request, responseToCache);

          // נקה entries ישנים אם יש יותר מדי
          trimCache(cache, MAX_ENTRIES);
        }
        return response;
      } catch (err) {
        // אם הרשת נכשלה ויש cache ישן - תחזיר אותו
        if (cached) return cached;
        throw err;
      }
    })
  );
});

/* ---------- Trim cache ---------- */
async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    // מחק את הישנים ביותר
    const toDelete = keys.slice(0, keys.length - maxEntries);
    await Promise.all(toDelete.map((k) => cache.delete(k)));
  }
}

/* ---------- Message: WARM_CACHE ---------- */
self.addEventListener("message", (event) => {
  if (event.data?.type === "WARM_CACHE") {
    const urls = event.data.urls || [];
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of urls) {
        const cached = await cache.match(url);
        if (!cached) {
          try {
            const res = await fetch(url);
            if (res.ok) {
              const responseToCache = new Response(await res.clone().arrayBuffer(), {
                status: res.status,
                statusText: res.statusText,
                headers: (() => {
                  const h = new Headers(res.headers);
                  h.set("sw-cached-at", Date.now().toString());
                  return h;
                })(),
              });
              cache.put(url, responseToCache);
            }
          } catch {}
        }
      }
    });
  }
});
