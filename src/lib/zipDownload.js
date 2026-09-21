// src/lib/zipDownload.js
//
// ─────────────────────────────────────────────────────────────────────────────
// "DOWNLOAD EVERYTHING" AS ONE FILE INSTEAD OF A HUNDRED
// ─────────────────────────────────────────────────────────────────────────────
//
// Downloading a gallery used to mean firing one browser download per photo.
// With a handful of pictures that is invisible; with a hundred it is a browser
// asking "this site wants to download multiple files" and then a hundred
// separate saves trickling in behind a 350ms delay each — over half a minute of
// nothing happening, and a Downloads folder the client has to sort by hand.
//
// So the files are fetched here and handed over as a zip.
//
// ── SPLIT INTO PARTS ───────────────────────────────────────────────────────
// A zip is built in memory before it can be saved, so the whole part sits in
// RAM twice for a moment: once as the fetched blobs, once as the archive. A
// phone will not survive that with 100 full-resolution photographs, and the
// failure is a silently killed tab. Files are therefore packed until a part
// reaches PART_BUDGET_BYTES and then that part is saved and released before
// the next one starts. An ordinary booking is a single file; only a very large
// gallery becomes "part 1 of 3", which is still three saves instead of a
// hundred.
//
// ── NO COMPRESSION ─────────────────────────────────────────────────────────
// JPEG and MP4 are already compressed; running deflate over them costs seconds
// of CPU and memory per file to save a percent or two. STORE just packs them.
//
// ── REQUIRES CORS ON THE BUCKET ────────────────────────────────────────────
// Reading a file's bytes with fetch() needs the bucket's permission, which an
// <img> tag does not: the gallery can display every photograph perfectly while
// every fetch of the same URL is refused. Without a CORS policy this produces
// an empty archive, which is why MePage falls back to one-download-per-file
// when nothing comes through.
//
// Enabling it is one command, run once, by someone with access to the project:
//
//   cat > cors.json <<'JSON'
//   [{ "origin": ["https://www.lens-dance.com", "https://lens-dance.com",
//                 "http://localhost:3000"],
//      "method": ["GET"],
//      "responseHeader": ["Content-Type", "Content-Length", "Content-Disposition"],
//      "maxAgeSeconds": 3600 }]
//   JSON
//   gcloud storage buckets update gs://lensdance-8d29c.firebasestorage.app \
//     --cors-file=cors.json
//
// GET only, and only from our own origins — this grants reading, and only to
// pages served from the site.

import JSZip from "jszip";
import { saveAs } from "file-saver";
import { fetchMediaBlob } from "./fetchMedia";

/** Pack until a part reaches this, then save it and start the next. */
const PART_BUDGET_BYTES = 100 * 1024 * 1024;

/** How many files are fetched at once. */
const CONCURRENCY = 4;

/**
 * Pack a set of blobs into one archive, in a worker when the browser allows.
 *
 * The worker is not an optimisation — packing in the page froze the tab hard
 * enough that Chrome offered to kill it, because checksumming every byte of a
 * gallery is seconds of uninterrupted work. If the worker cannot be created
 * (an old browser, a blocked module worker) this falls back to doing it here:
 * a frozen tab that finishes beats a download that never starts.
 */
async function packToBlob(files, onPercent) {
  try {
    const worker = new Worker(new URL("./zipWorker.js", import.meta.url));
    return await new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        const d = e.data || {};
        if (d.type === "progress") { onPercent?.(d.percent); return; }
        worker.terminate();
        if (d.type === "done") resolve(d.blob);
        else reject(new Error(d.error || "zip failed"));
      };
      worker.onerror = (err) => { worker.terminate(); reject(err); };
      worker.postMessage({ files });
    });
  } catch (err) {
    console.warn("Zip worker unavailable, packing in page:", err?.message || err);
    const zip = new JSZip();
    for (const f of files) zip.file(f.name, f.blob);
    return zip.generateAsync({ type: "blob", compression: "STORE" });
  }
}

/* Direct when the bucket allows it, through /api/file when it does not —
   see src/lib/fetchMedia.js. */
const fetchBlob = (url) => fetchMediaBlob(url);

/** "photo.jpg" taken twice becomes "photo.jpg" and "photo (2).jpg". */
function uniqueName(name, used) {
  if (!used.has(name)) { used.add(name); return name; }
  const dot = name.lastIndexOf(".");
  const stem = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? "" : name.slice(dot);
  let n = 2;
  let candidate = `${stem} (${n})${ext}`;
  while (used.has(candidate)) { n += 1; candidate = `${stem} (${n})${ext}`; }
  used.add(candidate);
  return candidate;
}

/**
 * Fetch every item and save them as one zip (or as few as memory allows).
 *
 * @param {Array<{url: string, name: string}>} items
 * @param {{ baseName?: string, onProgress?: (p: {done:number,total:number,phase:string}) => void,
 *           onItemDone?: (item: any) => void }} opts
 * @returns {Promise<{ parts: number, failed: Array<{name: string, error: string}> }>}
 *
 * Never throws for a single bad file: one photo that will not fetch must not
 * cost the client the other ninety-nine. Failures come back in the result so
 * the caller can say which ones are missing.
 */
export async function downloadAsZip(items, opts = {}) {
  const { baseName = "gallery", onProgress, onItemDone } = opts;
  const list = (items || []).filter((i) => i && i.url);
  const total = list.length;
  const failed = [];
  const used = new Set();

  let part = [];          // { name, blob } waiting to be packed
  let partBytes = 0;
  let partCount = 0;
  let done = 0;

  const report = (phase) => onProgress?.({ done, total, phase });

  const savePart = async (isLast) => {
    if (part.length === 0) return;
    partCount += 1;
    report("packing");
    const files = part;
    // Released before packing starts so the originals are not held twice
    // while the archive is built.
    part = [];
    partBytes = 0;
    const blob = await packToBlob(files, () => report("packing"));
    // Named "…-1.zip" only when there is going to be more than one, so the
    // common case does not look like a fragment of something missing.
    const name = isLast && partCount === 1 ? `${baseName}.zip` : `${baseName}-${partCount}.zip`;
    saveAs(blob, name);
  };

  // Fetch in small waves rather than all at once: a hundred parallel requests
  // to Storage is how a phone runs out of sockets and memory at the same time.
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const wave = list.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      wave.map(async (item) => {
        try {
          return { item, blob: await fetchBlob(item.url) };
        } catch (err) {
          failed.push({ name: item.name || "", error: err.message });
          return null;
        }
      })
    );

    for (const r of results) {
      if (!r) { done += 1; report("fetching"); continue; }
      part.push({
        name: uniqueName(r.item.name || `photo-${done + 1}.jpg`, used),
        blob: r.blob,
      });
      partBytes += r.blob.size;
      done += 1;
      onItemDone?.(r.item);
      report("fetching");

      if (partBytes >= PART_BUDGET_BYTES) {
        // eslint-disable-next-line no-await-in-loop
        await savePart(false);
      }
    }
  }

  await savePart(true);
  report("done");
  return { parts: partCount, failed };
}
