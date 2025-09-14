// src/pages/MePage.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { auth, storage } from "../firebase";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import JSZip from "jszip";
import "../style.css";

/** Build a URL that requests raw bytes + attachment header (native download) */
function buildAttachmentURL(url, filename) {
  try {
    const u = new URL(url);
    // Force raw bytes (no HTML viewer)
    u.searchParams.set("alt", "media");
    // Ask GCS/Firebase to send Content-Disposition: attachment
    u.searchParams.set(
      "response-content-disposition",
      `attachment; filename="${(filename || "download").replace(/"/g, "")}"`
    );
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Trigger a native download without reading the file into JS memory.
 * Primary: invisible <a target="_blank"> to the attachment URL
 * Fallback: hidden <iframe> (keeps current page, avoids popups)
 * Optional: previewFirst opens the original URL in a new tab, then starts the download.
 */
async function nativeDownload(
  url,
  filename = "download",
  opts = { previewFirst: false, delayMs: 300 }
) {
  const dlUrl = buildAttachmentURL(url, filename);

  if (opts?.previewFirst) {
    window.open(url, "_blank", "noopener,noreferrer");
    const delay = typeof opts?.delayMs === "number" ? opts.delayMs : 300;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }

  // Try invisible anchor first (lets browser handle download natively)
  try {
    const a = document.createElement("a");
    a.href = dlUrl;
    a.target = "_blank";
    a.rel = "noopener";
    a.style.position = "fixed";
    a.style.left = "-9999px";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  } catch {
    // fall through
  }

  // Fallback: hidden iframe (no memory footprint, good cross-browser behavior)
  try {
    let frame = document.getElementById("hidden-download-frame");
    if (!frame) {
      frame = document.createElement("iframe");
      frame.id = "hidden-download-frame";
      frame.style.display = "none";
      document.body.appendChild(frame);
    }
    frame.src = dlUrl;
    return;
  } catch {
    // Last resort: navigate current tab (not ideal, but guarantees download)
    window.location.href = dlUrl;
  }
}

export default function MePage() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [mediaItems, setMediaItems] = useState([]); // [{id,url,name,type}]
  const [loading, setLoading] = useState(true);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  // ZIP states
  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState({ done: 0, total: 0, label: "" });
  const abortRef = useRef(null);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const extFromUrl = (url) => url.split("?")[0].split(".").pop().toLowerCase();
  const isVideoExt = (ext) => /(mp4|mov|avi|mkv)$/i.test(ext || "");
  const isImageExt = (ext) => /(png|jpg|jpeg|gif|webp)$/i.test(ext || "");
  const isVideoUrl = (url) => isVideoExt(extFromUrl(url));

  // --- Auth subscription: avoids "not logged in" flash after reload ---
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Fetch user's media (runs when user changes and authLoading is done)
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
      setMediaItems(mediaData.filter(Boolean));
    } catch (e) {
      console.error(e);
      setError("Failed to load your private gallery.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return; // wait until we know if there's a user
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

  // --- ZIP ALL (single .zip for mobile-friendly one-tap download) ---
  async function zipAndDownload(items, zipName = "my-gallery.zip") {
    if (!items?.length) return;

    setZipping(true);
    setZipProgress({ done: 0, total: items.length, label: "Preparing..." });

    // Create an AbortController to allow cancellation mid-way
    const controller = new AbortController();
    abortRef.current = controller;

    const toSafeName = (name) =>
      (name || "file").replace(/[\/\\:*?"<>|]+/g, "_");

    try {
      const zip = new JSZip();
      let i = 0;

      for (const item of items) {
        if (controller.signal.aborted) throw new Error("aborted");

        const fileLabel = item.name || `file_${i + 1}`;
        setZipProgress((p) => ({ ...p, label: `Fetching ${fileLabel}...` }));

        // Fetch raw bytes (no preview HTML) and preserve filename
        const url = buildAttachmentURL(item.url, fileLabel);
        const resp = await fetch(url, { mode: "cors", signal: controller.signal });
        if (!resp.ok) throw new Error(`Failed to fetch ${fileLabel}: ${resp.status}`);

        const buf = await resp.arrayBuffer();
        // Keep original name; ensure safe chars
        zip.file(toSafeName(fileLabel), buf);

        i += 1;
        setZipProgress({ done: i, total: items.length, label: `Added ${fileLabel}` });
      }

      setZipProgress((p) => ({ ...p, label: "Compressing..." }));
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });

      // Trigger single download (works on iOS/Android)
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (String(err?.message).toLowerCase().includes("aborted")) {
        // user cancelled — no toast needed
      } else {
        console.error(err);
        alert("Failed to create ZIP. Try again or use the regular Download All.");
      }
    } finally {
      setZipping(false);
      setZipProgress({ done: 0, total: 0, label: "" });
      abortRef.current = null;
    }
  }

  function cancelZip() {
    abortRef.current?.abort();
  }

  // Esc to close modal
  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (e) => e.key === "Escape" && closeModal();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

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

      {/* Actions */}
      {filteredMediaItems.length > 0 && (
        <div style={{ marginTop: 30, textAlign: "center", display: "grid", gap: 12 }}>
          {/* One-tap mobile-friendly ZIP */}
          <button
            type="button"
            className="download-btn"
            disabled={zipping}
            onClick={() => zipAndDownload(filteredMediaItems, "my-gallery.zip")}
          >
            {zipping
              ? `Zipping ${zipProgress.done}/${zipProgress.total}${
                  zipProgress.label ? ` — ${zipProgress.label}` : ""
                }`
              : "Download All as ZIP"}
          </button>

          {/* Optional: cancel while zipping */}
          {zipping && (
            <button
              type="button"
              className="filter-button active"
              onClick={cancelZip}
              style={{ maxWidth: 220, margin: "0 auto" }}
            >
              Cancel
            </button>
          )}

          {/* Your original multi-file downloader (kept for desktop) */}
          <button
            type="button"
            className="download-btn"
            disabled={downloadingAll || zipping}
            onClick={async () => {
              try {
                setDownloadingAll(true);
                for (const item of filteredMediaItems) {
                  await nativeDownload(item.url, item.name, {
                    previewFirst: false,
                  });
                  // Tiny delay helps mobile browsers queue downloads
                  await new Promise((r) => setTimeout(r, 250));
                }
              } finally {
                setDownloadingAll(false);
              }
            }}
          >
            {downloadingAll ? "Downloading..." : "Download All (multiple files)"}
          </button>
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
                onClick={() =>
                  nativeDownload(selectedItem.url, selectedItem.name, {
                    previewFirst: false,
                  })
                }
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
