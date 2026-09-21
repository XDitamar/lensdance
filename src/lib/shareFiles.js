// src/lib/shareFiles.js
//
// ─────────────────────────────────────────────────────────────────────────────
// PUTTING A GALLERY INTO SOMEBODY'S PHONE, IN ONE TAP
// ─────────────────────────────────────────────────────────────────────────────
//
// A rider on an iPhone does not want a zip. It lands in Files, not in Photos;
// it has to be unpacked; and then every picture still has to be saved one at a
// time. The thing they actually asked for — "my photos, on my phone" — is one
// share sheet with "Save 24 Images" on it.
//
// That is what the Web Share API does when it is handed File objects. iOS
// Safari and Android Chrome both support it, the sheet is the operating
// system's own, and one tap on "Save Images" writes the lot to the camera roll.
// One approval for the whole gallery instead of one per photo.
//
// ── WHY THE FILES ARE FETCHED BEFORE THE SHEET OPENS ───────────────────────
// navigator.share() has to be called from a user gesture, and downloading
// twenty photographs takes long enough that Safari no longer counts the
// original tap. So the work is split in two: the first tap fetches (with a
// counter, because it is not instant), and a second, deliberate tap opens the
// sheet. Two taps, one approval — still far better than a hundred prompts.
//
// ── BATCHES ────────────────────────────────────────────────────────────────
// A share sheet holding a hundred full-resolution photographs is refused on
// iOS, and somewhere below that it simply hangs. They go in batches instead,
// and the client is told which batch they are on, because an unexplained
// second sheet looks like something went wrong.
//
// ── READING THE BYTES ──────────────────────────────────────────────────────
// Building a File means reading a Storage file's bytes, which the browser is
// refused unless the bucket carries a CORS policy. Rather than depend on that,
// fetching goes through src/lib/fetchMedia.js: direct when it is allowed, and
// otherwise through /api/file, which fetches the same URL server-side so the
// bytes arrive from our own domain.

import { fetchMediaBlob } from "./fetchMedia";

/** As many photos as a share sheet takes without complaining. */
export const SHARE_BATCH = 12;

/** Can this browser share actual files (not just a link)? */
export function canShareFiles() {
  try {
    if (typeof navigator === "undefined" || !navigator.share || !navigator.canShare) return false;
    // Probed with a real file: `navigator.share` exists on desktop Chrome too,
    // where sharing files is usually refused, and the only honest way to ask
    // is to ask about a file.
    const probe = new File([new Blob(["x"], { type: "image/jpeg" })], "probe.jpg", {
      type: "image/jpeg",
    });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** Worth offering at all? A phone, with more than one picture to save. */
export const shouldOfferShare = (count) => count > 1 && canShareFiles();

/**
 * Download the selected media and hand it back as File objects.
 *
 * Failures are collected rather than thrown: one photo that will not fetch
 * must not cost the client the rest of the gallery.
 */
export async function fetchAsFiles(items, { onProgress } = {}) {
  const list = (items || []).filter((i) => i && i.url);
  const files = [];
  const failed = [];
  let done = 0;

  // Four at a time. A phone asked for twenty parallel downloads of 8 MB
  // photographs runs out of memory before it runs out of patience.
  for (let i = 0; i < list.length; i += 4) {
    const wave = list.slice(i, i + 4);
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(
      wave.map(async (item) => {
        try {
          // Direct when the bucket allows it, through /api/file when it does
          // not — see src/lib/fetchMedia.js.
          const blob = await fetchMediaBlob(item.url);
          return { item, file: new File([blob], item.name || "photo.jpg", { type: blob.type }) };
        } catch (err) {
          failed.push({ name: item.name || "", error: err.message });
          return null;
        }
      })
    );
    for (const r of results) {
      done += 1;
      if (r) files.push(r.file);
      onProgress?.({ done, total: list.length, phase: "fetching" });
    }
  }

  return { files, failed };
}

/** Split into sheet-sized groups. */
export function batches(files, size = SHARE_BATCH) {
  const out = [];
  for (let i = 0; i < files.length; i += size) out.push(files.slice(i, i + size));
  return out;
}

/**
 * Open the system share sheet for one batch.
 *
 * @returns {Promise<"shared"|"cancelled"|"failed">}
 *
 * A cancelled sheet is not an error — the client changed their mind, and
 * telling them something went wrong would be a lie. It is reported separately
 * so the caller can stop quietly instead of pushing the next batch at someone
 * who just dismissed one.
 */
export async function shareBatch(files, { title } = {}) {
  try {
    await navigator.share({ files, title });
    return "shared";
  } catch (err) {
    if (err?.name === "AbortError") return "cancelled";
    console.warn("Share failed:", err?.name, err?.message);
    return "failed";
  }
}
