// src/lib/fetchMedia.js
//
// One way to get the BYTES of a photo, used by both the zip path and the
// phone's share sheet.
//
// The direct link is tried first: it is one hop, and it costs the deployment
// nothing. It only works if the bucket carries a CORS policy, which ours does
// not yet — so on the first refusal this falls back to /api/file, which
// fetches the same URL server-side and returns it from our own domain, where
// the browser needs no permission at all.
//
// The choice is remembered for the rest of the page's life. Ninety photographs
// should not each discover the same refusal.

let preferProxy = null; // null = not yet known, true = direct is refused

const isLocalhost = () =>
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname.startsWith("127."));

const proxied = (url) => `/api/file?url=${encodeURIComponent(url)}`;

/**
 * @returns {Promise<Blob>} the file's bytes
 * @throws if neither route can produce them
 */
export async function fetchMediaBlob(url) {
  // `npm start` serves no /api at all, so there is nothing to fall back to.
  const canProxy = !isLocalhost();

  if (preferProxy !== true) {
    try {
      const res = await fetch(url, { credentials: "omit" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      preferProxy = false;
      return await res.blob();
    } catch (err) {
      if (!canProxy) throw err;
      // A CORS refusal arrives as an opaque "Failed to fetch" with no detail,
      // so there is nothing to inspect — the only way to tell it apart from a
      // real network failure is to try the other route.
      preferProxy = true;
    }
  }

  const res = await fetch(proxied(url), { credentials: "omit" });
  if (!res.ok) throw new Error(`proxy HTTP ${res.status}`);
  return res.blob();
}
