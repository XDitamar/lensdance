// src/pages/MePage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { auth, storage } from "../firebase";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import "../style.css";

/** Build a URL that requests raw bytes + attachment header (native download) */
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

/** Trigger a native download without reading the file into JS memory. */
async function nativeDownload(url, filename = "download", opts = { previewFirst: false, delayMs: 300 }) {
  const dlUrl = buildAttachmentURL(url, filename);

  if (opts?.previewFirst) {
    window.open(url, "_blank", "noopener,noreferrer");
    const delay = typeof opts?.delayMs === "number" ? opts.delayMs : 300;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }

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
  } catch {}

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
    window.location.href = dlUrl;
  }
}

export default function MePage() {
  // --- Auth state (prevents "not logged in" flash on reload) ---
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // --- Gallery state ---
  const [mediaItems, setMediaItems] = useState([]); // [{id,url,name,type}]
  const [loading, setLoading] = useState(true);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  // Mobile guided download state
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const [guidedOpen, setGuidedOpen] = useState(false);
  const [dlQueue, setDlQueue] = useState([]); // array of items
  const [dlIndex, setDlIndex] = useState(0); // current index in queue

  const extFromUrl = (url) => url.split("?")[0].split(".").pop().toLowerCase();
  const isVideoExt = (ext) => /(mp4|mov|avi|mkv)$/i.test(ext || "");
  const isImageExt = (ext) => /(png|jpg|jpeg|gif|webp)$/i.test(ext || "");
  const isVideoUrl = (url) => isVideoExt(extFromUrl(url));

  // Fetch user's media
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

  // Modal controls
  const openModal = (item) => {
    setSelectedItem(item);
    setModalOpen(true);
  };
  const closeModal = () => {
    setSelectedItem(null);
    setModalOpen(false);
  };
  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (e) => e.key === "Escape" && closeModal();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  // Guided download controls (mobile)
  const startGuidedDownload = async (items) => {
    // Save the queue and start at 0
    setDlQueue(items);
    setDlIndex(0);
    setGuidedOpen(true);

    // Use the current tap to trigger the first download immediately
    if (items.length > 0) {
      await nativeDownload(items[0].url, items[0].name, { previewFirst: false });
      setDlIndex(1);
    }
  };

  const downloadNextInQueue = async () => {
    const i = dlIndex;
    if (i >= dlQueue.length) {
      // done
      setGuidedOpen(false);
      setDlQueue([]);
      setDlIndex(0);
      return;
    }
    const item = dlQueue[i];
    await nativeDownload(item.url, item.name, { previewFirst: false });
    setDlIndex(i + 1);
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

      {/* Download All */}
      {filteredMediaItems.length > 0 && (
        <div style={{ marginTop: 30, textAlign: "center" }}>
          <button
            type="button"
            className="download-btn"
            disabled={downloadingAll}
            onClick={async () => {
              if (isMobile) {
                // Guided flow for mobile: first download now (this tap),
                // then show "Download next" button for subsequent files.
                await startGuidedDownload(filteredMediaItems);
                return;
              }

              // Desktop: automatic sequential downloads
              try {
                setDownloadingAll(true);
                for (const item of filteredMediaItems) {
                  await nativeDownload(item.url, item.name, { previewFirst: false });
                  await new Promise((r) => setTimeout(r, 250));
                }
              } finally {
                setDownloadingAll(false);
              }
            }}
          >
            {downloadingAll ? "Downloading..." : "Download All"}
          </button>
          {isMobile && filteredMediaItems.length > 1 && (
            <p style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
              On mobile, tap "Download next" to continue (one tap per file).
            </p>
          )}
        </div>
      )}

      {/* Guided Download Modal (mobile only) */}
      {guidedOpen && (
        <div
          className="media-modal"
          onClick={() => {}}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="media-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ textAlign: "center" }}
          >
            <h3 style={{ marginBottom: 8 }}>Download All</h3>
            <p style={{ marginBottom: 16, color: "#666" }}>
              {dlIndex >= dlQueue.length
                ? "All files downloaded."
                : `Downloaded ${dlIndex} of ${dlQueue.length}.`}
            </p>

            <div className="modal-actions" style={{ gap: 12, justifyContent: "center" }}>
              {dlIndex < dlQueue.length ? (
                <button
                  type="button"
                  className="download-btn"
                  onClick={downloadNextInQueue}
                >
                  Download next ({dlIndex + 1}/{dlQueue.length})
                </button>
              ) : (
                <button
                  type="button"
                  className="download-btn"
                  onClick={() => setGuidedOpen(false)}
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
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
