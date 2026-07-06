import { ref, listAll, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";

// Shared, session-wide cache of the public gallery ("MainGallery"). It lists
// the folder + resolves every download URL exactly once, then warms the first
// screenful of thumbnails during browser idle time (so the warm-up never
// competes with the page the visitor is actually looking at).

const extFromName = (name = "") => (name.split(".").pop() || "").toLowerCase();
const isVideoExt = (e = "") =>
  ["mp4", "mov", "avi", "mkv", "webm"].includes((e || "").toLowerCase());

const isProduction = () =>
  typeof window !== "undefined" &&
  window.location.hostname !== "localhost" &&
  !window.location.hostname.startsWith("127.");

// Central helper: a resized/WebP version of any Firebase image URL.
// In dev (no /api/image) it returns the original URL.
export function resizedUrl(fullUrl, w = 900, q = 72) {
  if (!fullUrl) return fullUrl;
  return isProduction()
    ? `/api/image?url=${encodeURIComponent(fullUrl)}&w=${w}&q=${q}`
    : fullUrl;
}

let cached = null;
let inflight = null;

export async function getMainGalleryItems() {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    const res = await listAll(ref(storage, "MainGallery"));
    const items = (
      await Promise.all(
        res.items.map(async (r) => {
          if (r.fullPath.includes("/thumbs/")) return null;
          const ext = extFromName(r.name);
          const isVid = isVideoExt(ext);
          const url = await getDownloadURL(r).catch(() => null);
          if (!url) return null;
          return {
            name: r.name,
            fullPath: r.fullPath,
            ext,
            source: "firebase",
            url,                                            // original (download only)
            thumbUrl: isVid ? url : resizedUrl(url, 640, 70),  // small grid tile
            gridUrl: isVid ? url : resizedUrl(url, 1280, 72),  // wide grid tile
            modalUrl: isVid ? url : resizedUrl(url, 1600, 80), // lightbox view
            isVideo: isVid,
          };
        })
      )
    ).filter(Boolean);

    cached = items;
    warmImages(items);
    return items;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

// Warm only the first screenful of thumbnails, during idle time. Warming the
// entire gallery up-front used to compete with the homepage hero for
// bandwidth and downloaded megabytes most visitors never viewed.
const WARM_COUNT = 9;

export function warmImages(items = []) {
  if (typeof window === "undefined") return;
  const toWarm = items.filter((it) => !it.isVideo && it.thumbUrl).slice(0, WARM_COUNT);
  const start = () => {
    for (const it of toWarm) {
      const img = new Image();
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      if ("fetchPriority" in img) img.fetchPriority = "low";
      img.src = it.thumbUrl;
    }
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(start, { timeout: 4000 });
  } else {
    setTimeout(start, 1500);
  }
}
