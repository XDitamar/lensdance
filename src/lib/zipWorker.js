/* eslint-disable no-restricted-globals */
// src/lib/zipWorker.js
//
// Builds the archive off the main thread.
//
// This exists because doing it in the page froze the tab. Packing walks every
// byte of every file to checksum it, and with a competition's worth of
// full-resolution photographs — or a single video — that is long enough that
// the page stops painting, the progress counter stops counting, and the
// browser offers to kill the tab. The work is the same here; it just happens
// somewhere that is allowed to block.
//
// Blobs are passed in and out by reference rather than copied: a structured
// clone of a Blob hands over the backing store, so a 400 MB archive does not
// become 800 MB in transit.

import JSZip from "jszip";

self.onmessage = async (e) => {
  const { files } = e.data || {};
  try {
    const zip = new JSZip();
    for (const f of files || []) zip.file(f.name, f.blob);

    // STORE, not deflate: JPEG and MP4 are already compressed, so deflating
    // them spends real time to save a percent or two.
    const blob = await zip.generateAsync(
      { type: "blob", compression: "STORE" },
      (meta) => self.postMessage({ type: "progress", percent: meta.percent })
    );

    self.postMessage({ type: "done", blob });
  } catch (err) {
    self.postMessage({ type: "error", error: err?.message || "zip failed" });
  }
};
