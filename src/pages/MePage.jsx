// src/pages/MePage.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { auth, storage } from "../firebase";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import "../style.css";

/* ========================== Utilities ========================== */

// iOS / iPadOS detection (includes iPadOS desktop mode)
function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const touchMac = platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || touchMac;
}

/** Add params so Firebase/GCS serves raw bytes and suggests a filename */
function buildAttachmentURL(url, filename) {
  try {
    const u = new URL(url);
    u.searchParams.set("alt", "media"); // raw bytes, no HTML viewer
    u.searchParams.set(
      "response-content-disposition",
      `attachment; filename="${(filename || "download").replace(/"/g, "")}"`
    );
    return u.toString();
  } catch {
    return url;
  }
}

/** Trigger a native browser download (no blobs, no memory) */
function triggerNativeDownload(dlUrl) {
  try {
    const a = document.createElement("a");
    a.href = dlUrl;
    a.target = "_self";
    a.rel = "noopener";
    a.style.position = "fixed";
    a.style.left = "-9999px";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    // Fallback: hidden iframe
    try {
      let frame = document.getElementById("hidden-download-frame");
      if (!frame) {
        frame = document.createElement("iframe");
        frame.id = "hidden-download-frame";
        frame.style.display = "none";
        document.body.appendChild(frame);
      }
      frame.src = dlUrl;
    } catch {
      window.location.href = dlUrl;
    }
  }
}

/** iOS/iPadOS: fetch -> File -> Web Share (lets user "Save to Files") */
async function shareFileToSystem(blob, filename = "file") {
  try {
    const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
    // @ts-ignore
    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      // @ts-ignore
      await navigator.share({ files: [file], title: filename });
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}

/** Save a Blob via <a download> */
function saveBlobViaAnchor(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

/** Try File System Access API (Chrome/Edge desktop) */
async function saveBlobViaFilePicker(blob, filename) {
  // @ts-ignore
  if (window.showSaveFilePicker) {
    try {
      // @ts-ignore
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch {
      // user canceled or unsupported
    }
  }
  return false;
}

/** Load JSZip from npm (preferred) or from global if user added CDN script */
async function loadJSZip() {
  try {
    const mod = await import("jszip");
    return mod.default || mod;
  } catch {
    if (typeof window !== "undefined" && window.JSZip) {
      return window.JSZip;
    }
    throw new Error(
      "JSZip not found. Run `npm i jszip` or include the CDN script in public/index.html."
    );
  }
}

/** Fetch a URL as Blob (with attachment params) */
async function fetchAsBlob(url, filename) {
  const dlUrl = buildAttachmentURL(url, filename);
  const resp = await fetch(dlUrl, {
    method: "GET",
    mode: "cors",
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.blob();
}

/** Simple concurrency pool for fetching many files */
async function fetchAllWithLimit(items, limit, fetcher, onEach) {
  let index = 0;
  const results = new Array(items.length);
  const worker = async () => {
    while (true) {
      const i = index++;
      if (i >= items.length) break;
      try {
        const r = await fetcher(items[i], i);
        results[i] = r;
        onEach?.(i, null);
      } catch (err) {
        results[i] = null;
        onEach?.(i, err);
      }
    }
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

/* ========================== Component ========================== */

export default function MePage() {
  const [mediaItems, setMediaItems] = useState([]); // [{id,url,name,type}]
  const [loading, setLoading] = useState(true);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [fetchedCount, setFetchedCount] = useState(0);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const user = auth.currentUser;

  const extFromUrl = (url) => url.split("?")[0].split(".").pop().toLowerCase();
  const isVideoExt = (ext) => /(mp4|mov|avi|mkv)$/i.test(ext || "");
  const isImageExt = (ext) => /(png|jpg|jpeg|gif|webp)$/i.test(ext || "");
  const isVideoUrl = (url) => isVideoExt(extFromUrl(url));

  // Fetch user's media
  const fetchMedia = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError("");

      const sanitizedEmail = user.email.replace(/[.#$[\]]/g, "_");
      const userFolderRef = ref(storage, sanitizedEmail);
      const res = await listAll(userFolderRef);

      const mediaPromises = res.items.map(async (itemRef) => {
        if (itemRef.name === ".placeholder") return null;
        const url = await getDownloadURL(itemRef);
        const type = itemRef.name.split(".").pop();
        return { id: itemRef.fullPath, url, name: itemRef.name, type };
      });

      const mediaData = await Promise.all(mediaPromises);
      setMediaItems(mediaData.filter(Boolean));
    } catch (e) {
      console.error(e);
      setError("Failed to load your private gallery.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filteredMediaItems = mediaItems.filter((item) => {
    const ext = (item.type || "").toLowerCase();
    if (filter === "images") return isImageExt(ext);
    if (filter === "videos") return isVideoExt(ext);
    return true;
  });

  const openModal = (item) => {
    setSelectedItem(item);
    setModalOpen(true);
  };
  const closeModal = () => {
    setSelectedItem(null);
    setModalOpen(false);
  };

  // Single-item download (native / iOS share when needed)
  async function downloadSingle(url, filename) {
    if (isIOS()) {
      // On iOS, try the share sheet for a real "Save to Files"
      try {
        const blob = await fetchAsBlob(url, filename);
        const usedShare = await shareFileToSystem(blob, filename);
        if (!usedShare) {
          triggerNativeDownload(buildAttachmentURL(url, filename));
        }
      } catch {
        triggerNativeDownload(buildAttachmentURL(url, filename));
      }
    } else {
      triggerNativeDownload(buildAttachmentURL(url, filename));
    }
  }

  // Save all as a single ZIP (best UX across platforms)
  async function saveAllAsZip(items) {
    if (!items.length) return;

    setZipping(true);
    setZipProgress(0);
    setFetchedCount(0);

    try {
      const JSZip = await loadJSZip();
      const zip = new JSZip();

      // Fetch with small concurrency to avoid overwhelming the browser
      const fetched = await fetchAllWithLimit(
        items,
        3, // concurrency
        async (it) => {
          const blob = await fetchAsBlob(it.url, it.name);
          return { name: it.name, blob };
        },
        (i, err) => {
          setFetchedCount((c) => c + 1);
        }
      );

      // Add to zip (use STORE for media to save CPU; JPEG/MP4 don't compress well)
      fetched.forEach((entry, idx) => {
        if (!entry) return; // skip failed
        zip.file(entry.name, entry.blob, {
          binary: true,
          compression: "STORE",
        });
      });

      const suggestedName = `MyGallery-${new Date()
        .toISOString()
        .replace(/[:.]/g, "")
        .replace("T", "_")
        .slice(0, 15)}.zip`;

      const zipBlob = await zip.generateAsync(
        { type: "blob", streamFiles: true, compression: "STORE" },
        (meta) => setZipProgress(Math.round(meta.percent))
      );

      // Prefer native file picker on desktop
      const usedFS = await saveBlobViaFilePicker(zipBlob, suggestedName);
      if (usedFS) return;

      // iOS/iPadOS: Share sheet (Save to Files)
      if (isIOS()) {
        const usedShare = await shareFileToSystem(zipBlob, suggestedName);
        if (usedShare) return;
      }

      // Fallback: <a download>
      saveBlobViaAnchor(zipBlob, suggestedName);
    } catch (err) {
      console.error("ZIP error:", err);
      alert(
        "Couldn't create the ZIP. If your gallery is very large, try downloading items in smaller batches."
      );
    } finally {
      setZipping(false);
      setZipProgress(0);
      setFetchedCount(0);
    }
  }

  // ---------- UI guards ----------
  if (loading) {
    return (
      <div className="container" style={{ textAlign: "center" }}>
        <p>Loading your gallery...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="container" style={{ textAlign: "center" }}>
        <h2 className="section-title">My Gallery</h2>
        <p>You're not logged in.</p>
        <Link className="auth-primary" to="/login">
          Log in to view your pics
        </Link>
      </main>
    );
  }

  if (error) {
    return (
      <main className="container" style={{ textAlign: "center" }}>
        <h2 className="section-title">My Gallery</h2>
        <p>{error}</p>
      </main>
    );
  }

  // ---------- Page ----------
  return (
    <main className="container">
      <h2 className="section-title">My Gallery</h2>

      {/* Filter */}
      <div className="gallery-buttons">
        <button onClick={() => setFilter("all")} className="filter-button">
          All
        </button>
        <button onClick={() => setFilter("images")} className="filter-button">
          Images
        </button>
        <button onClick={() => setFilter("videos")} className="filter-button">
          Videos
        </button>
      </div>

      {/* Grid */}
      <div className="gallery-grid">
        {filteredMediaItems.length > 0 ? (
          filteredMediaItems.map((m) => (
            <div
              key={m.id}
              className="gallery-item"
              onClick={() => openModal(m)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && openModal(m)}
            >
              {isVideoUrl(m.url) ? (
                <video src={m.url} className="gallery-item-media" playsInline muted />
              ) : (
                <img src={m.url} alt={m.name} className="gallery-item-media" />
              )}
            </div>
          ))
        ) : (
          <p style={{ marginTop: 20, color: "#666" }}>
            No {filter === "all" ? "" : filter} found in your gallery.
          </p>
        )}
      </div>

      {/* Bulk actions */}
      {filteredMediaItems.length > 0 && (
        <div style={{ marginTop: 30, textAlign: "center" }}>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="download-btn"
              disabled={downloadingAll || zipping}
              onClick={async () => {
                // Native per-file downloads (desktop auto-save; iOS shows viewer for images)
                try {
                  setDownloadingAll(true);
                  for (const item of filteredMediaItems) {
                    await downloadSingle(item.url, item.name);
                    await new Promise((r) => setTimeout(r, 200)); // spacing
                  }
                } finally {
                  setDownloadingAll(false);
                }
              }}
            >
              {downloadingAll ? "Downloading…" : "Download Each"}
            </button>

            <button
              type="button"
              className="download-btn"
              disabled={zipping || downloadingAll}
              onClick={() => saveAllAsZip(filteredMediaItems)}
            >
              {zipping ? `Preparing ZIP… ${zipProgress}%` : "Save All as ZIP"}
            </button>
          </div>

          {(zipping || fetchedCount > 0) && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
              {zipping ? `Zipping: ${zipProgress}%` : null}
              {fetchedCount > 0 && !zipping
                ? `Fetched ${fetchedCount}/${filteredMediaItems.length}`
                : null}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {modalOpen && selectedItem && (
        <div
          className="media-modal"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="media-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            {isVideoUrl(selectedItem.url) ? (
              <video src={selectedItem.url} controls className="modal-media" />
            ) : (
              <img
                src={selectedItem.url}
                alt={selectedItem.name}
                className="modal-media"
              />
            )}

            {/* Actions */}
            <div className="modal-actions">
              <button
                type="button"
                className="download-btn"
                onClick={() => downloadSingle(selectedItem.url, selectedItem.name)}
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
