// src/pages/MePage.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { auth, storage } from "../firebase";
import { ref, listAll, getDownloadURL } from "firebase/storage";
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
async function nativeDownload(url, filename = "download", opts = { previewFirst: false, delayMs: 300 }) {
  const dlUrl = buildAttachmentURL(url, filename);

  if (opts?.previewFirst) {
    // Open the view URL (usually renders in a tab)...
    window.open(url, "_blank", "noopener,noreferrer");
    // ...then kick off the real download shortly after.
    const delay = typeof opts?.delayMs === "number" ? opts.delayMs : 300;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }

  // Try invisible anchor first (lets browser handle download natively)
  try {
    const a = document.createElement("a");
    a.href = dlUrl;
    a.target = "_blank";
    a.rel = "noopener";
    // Note: download attribute is ignored cross-origin; we rely on the header instead
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
  const [mediaItems, setMediaItems] = useState([]); // [{id,url,name,type}]
  const [loading, setLoading] = useState(true);
  const [downloadingAll, setDownloadingAll] = useState(false);
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

  // Esc to close
  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (e) => e.key === "Escape" && closeModal();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

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

      {/* Download All */}
      {filteredMediaItems.length > 0 && (
        <div style={{ marginTop: 30, textAlign: "center" }}>
          <button
            type="button"
            className="download-btn"
            disabled={downloadingAll}
            onClick={async () => {
              try {
                setDownloadingAll(true);
                for (const item of filteredMediaItems) {
                  // Open direct native download (no blobs, no memory)
                  await nativeDownload(item.url, item.name, { previewFirst: false });
                  // Gentle spacing; many browsers queue 1 download at a time
                  await new Promise((r) => setTimeout(r, 250));
                }
              } finally {
                setDownloadingAll(false);
              }
            }}
          >
            {downloadingAll ? "Downloading..." : "Download All"}
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
                  // If you want a preview tab first, flip previewFirst to true:
                  // nativeDownload(selectedItem.url, selectedItem.name, { previewFirst: true, delayMs: 400 })
                  nativeDownload(selectedItem.url, selectedItem.name, { previewFirst: false })
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
