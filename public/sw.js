/* eslint-env serviceworker */
/* global self, caches, fetch, Headers, Response */
/* ============================================================
 * Service Worker – Image Cache for LensDance
 * כל תמונה מ-Firebase Storage נשמרת ב-Cache Storage
 * בפעם הבאה נטענת מהדיסק המקומי ב-0ms
 * ============================================================ */

const CACHE_NAME = "lensdance-images-v1";

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

  // רק תמונות מ-Firebase Storage או /api/image
  const isFirebaseImage =
    url.includes("firebasestorage.googleapis.com") &&
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
