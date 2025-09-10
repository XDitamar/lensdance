// src/pages/MePage.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { auth, storage } from "../firebase";
import { ref, listAll, getDownloadURL, getBlob } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import "../style.css";

/** Build a URL that requests raw bytes + attachment header (native download for single files) */
function buildAttachmentURL(url, filename) {
  try {
    const u = new URL(url);
    u.searchParams.set("alt", "media");
    u.searchParams.set(
      "response-content-disposition",
      `attachment; filename="${(filename || "download").replace(/"/g, "")}"`
    );
    return u.toString();
  } catch {
    return url;
  }
}

/** Trigger a native download without loading into JS memory (good for single files) */
async function nativeDownload(url, filename = "download") {
  const dlUrl = buildAttachmentURL(url, filename);
  try {
    const a = document.createElement("a");
    a.href = dlUrl;
    a.target = "_self"; // single download per click works best with _self on mobile
    a.rel = "noopener";
    a.style.position = "fixed";
    a.style.left = "-9999px";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
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

/** Detect iOS/iPadOS (incl. iPad desktop mode) */
function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const touchMac = platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || touchMac;
}

/** Save a Blob via <a download> */
function saveBlobViaAnchor(blob, filename = "download") {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Try modern File System Access API (desktop Chrome/Edge) */
async function saveBlobViaFilePicker(blob, filename) {
  // @ts-ignore
  if (window.showSaveFilePicker) {
    try {
      // @ts-ignore
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "Archive", accept: { "application/zip": [".zip"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch { /* user cancelled */ }
  }
  return false;
}

/** Deduplicate filenames inside the zip: foo.jpg, foo (1).jpg, ... */
function withUniqueZipNames(items) {
  const used = new Set();
  return items.map((it) => {
    const name = it.name || "file";
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let candidate = name;
    let i = 1;
    while (used.has(candidate)) {
      candidate = `${base} (${i++})${ext}`;
    }
    used.add(candidate);
    return { ...it, zipName: candidate };
  });
}

export default function MePage() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [mediaItems, setMediaItems] = useState([]); // [{id(fullPath),url,name,type}]
  const [loading, setLoading] = useState(true);

  const [downloadingAll, setDownloadingAll] = useState(false); // per-file path
  const [zipping, setZipping] = useState(false);               // zip path
  const [zipProgress, setZipProgress] = useState({ filesDone: 0, filesTotal: 0, percent: 0 });

  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const extFromUrl = (url) => url.split("?")[0].split(".").pop().toLowerCase();
  const isVideoExt = (ext) => /(mp4|mov|avi|mkv)$/i.test(ext || "");
  const isImageExt = (ext) => /(png|jpg|jpeg|gif|webp)$/i.test(ext || "");
  const isVideoUrl = (url) => isVideoExt(extFromUrl(url));

  // Auth subscription
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Load user's media
  const fetchMedia = async (u) => {
    if (!u) {
      setMediaItems([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError("");

      const email = u.email || "";
      const sanitizedEmail = email.replace(/[.#$[\]]/g, "_");
      const userFolderRef = ref(storage, sanitizedEmail);
      const res = await listAll(userFolderRef);

      const mediaPromises = res.items.map(async (itemRef) => {
        if (itemRef.name === ".placeholder") return null;
        const url = await getDownloadURL(itemRef);
        const type = itemRef.name.split(".").pop();
        return { id: itemRef.fullPath, url, name: itemRef.name, type };
      });

      const mediaData = await Promise.all(mediaPromises);
      if (isMounted.current) setMediaItems(mediaData.filter(Boolean));
    } catch (e) {
      console.error(e);
      setError("Failed to load your private gallery.");
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    fetchMedia(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const filteredMediaItems = useMemo(
    () =>
      mediaItems.filter((item) => {
        const ext = (item.type || "").toLowerCase();
        if (filter === "images") return isImageExt(ext);
        if (filter === "videos") return isVideoExt(ext);
        return true;
      }),
    [mediaItems, filter]
  );

  const openModal = (item) => {
    setSelectedItem(item);
    setModalOpen(true);
  };
  const closeModal = () => {
    setSelectedItem(null);
    setModalOpen(false);
  };

  /** Download all as one ZIP (recommended for mobile) */
  const downloadAllAsZip = async () => {
    if (!filteredMediaItems.length) return;

    try {
      setZipping(true);
      setZipProgress({ filesDone: 0, filesTotal: filteredMediaItems.length, percent: 0 });

      // Lazy-load JSZip only when needed
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      // Using STORE (no compression) = faster & safer on mobile for JPEG/MP4
      const items = withUniqueZipNames(filteredMediaItems);

      let done = 0;
      for (const it of items) {
        // Get bytes via Firebase SDK to avoid CORS issues
        const blob = await getBlob(ref(storage, it.id));
        zip.file(it.zipName, blob, { binary: true });

        done++;
        setZipProgress((p) => ({ ...p, filesDone: done }));
        // yield to UI a bit on big batches
        if (done % 5 === 0) await new Promise((r) => setTimeout(r, 0));
      }

      const zipBlob = await zip.generateAsync(
        { type: "blob", compression: "STORE", streamFiles: true },
        (meta) => {
          setZipProgress((p) => ({ ...p, percent: Math.round(meta.percent) }));
        }
      );

      const zipNameBase =
        (user?.email ? user.email.split("@")[0] : "gallery") +
        "-" +
        new Date().toISOString().slice(0, 10);

      // Try modern Save-As (desktop), fallback to <a download>
      const usedPicker = await saveBlobViaFilePicker(zipBlob, `${zipNameBase}.zip`);
      if (!usedPicker) saveBlobViaAnchor(zipBlob, `${zipNameBase}.zip`);
    } catch (e) {
      console.error("ZIP failed:", e);
      alert("Couldn't build ZIP. Try fewer files or smaller videos.");
    } finally {
      if (isMounted.current) {
        setZipping(false);
        setZipProgress({ filesDone: 0, filesTotal: 0, percent: 0 });
      }
    }
  };

  // ---------- UI guards ----------
  if (authLoading || loading) {
    return (
      <div className="container" style={{ textAlign: "center" }}>
        <p>{authLoading ? "Checking login..." : "Loading your gallery..."}</p>
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
        <button
          onClick={() => setFilter("all")}
          className={`filter-button ${filter === "all" ? "active" : ""}`}
        >
          All
        </button>
        <button
          onClick={() => setFilter("images")}
          className={`filter-button ${filter === "images" ? "active" : ""}`}
        >
          Images
        </button>
        <button
          onClick={() => setFilter("videos")}
          className={`filter-button ${filter === "videos" ? "active" : ""}`}
        >
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
                <video
                  src={m.url}
                  className="gallery-item-media"
                  playsInline
                  muted
                />
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
            {/* Recommended for mobile: one file download */}
            <button
              type="button"
              className="download-btn"
              disabled={zipping}
              onClick={downloadAllAsZip}
              title="Build a single ZIP with all files (best on mobile)"
            >
              {zipping
                ? `Preparing ZIP… ${zipProgress.filesDone}/${zipProgress.filesTotal} (${zipProgress.percent}%)`
                : "Download All (ZIP)"}
            </button>

            {/* Optional: per-file downloads (works best on desktop/Android) */}
            <button
              type="button"
              className="secondary-btn"
              disabled={downloadingAll || zipping}
              onClick={async () => {
                try {
                  setDownloadingAll(true);
                  // Note: many mobile browsers allow only one download per click.
                  for (const item of filteredMediaItems) {
                    await nativeDownload(item.url, item.name);
                    await new Promise((r) => setTimeout(r, 300));
                  }
                } finally {
                  setDownloadingAll(false);
                }
              }}
            >
              {downloadingAll ? "Downloading…" : "Download Each"}
            </button>
          </div>

          {zipping && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
              Large albums can take a bit — keep this tab open.
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
                onClick={() => nativeDownload(selectedItem.url, selectedItem.name)}
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
