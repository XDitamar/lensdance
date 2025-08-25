// src/pages/MePage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { auth, storage } from "../firebase";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
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

// Heuristic: iOS Safari check
const isIOS = () => /iP(hone|ad|od)/i.test(navigator.userAgent);
// Slightly larger gaps for videos; iOS is pickier with timing
const delayFor = (nameOrUrl) => {
  const ext = (nameOrUrl.split("?")[0].split(".").pop() || "").toLowerCase();
  if (/(mp4|mov|avi|mkv)/.test(ext)) return 1600;
  return 1250;
};

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

  // Modal (preview)
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  // Guided download (mobile/iOS) state
  const [guidedOpen, setGuidedOpen] = useState(false);
  const [dlQueue, setDlQueue] = useState([]); // array of items
  const [dlIndex, setDlIndex] = useState(0); // current index in queue
  const startedCountRef = useRef(0); // how many we *think* started automatically

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

  // Preview modal
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

  // Guided download controls (mobile/iOS)
  const startGuidedDownload = async (items, startAtIndex = 0) => {
    setDlQueue(items);
    setDlIndex(startAtIndex);

    // Open modal first so the next taps are clearly user gestures
    setGuidedOpen(true);

    // If we start at the beginning, we can optionally kick the first download
    // right away (consuming the current tap). But since we're switching here
    // after an auto attempt, we usually resume from 'startAtIndex'.
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
              const items = filteredMediaItems;
              if (!items.length) return;

              // Desktop / non-iOS: automatic sequential downloads (as before)
              if (!isIOS()) {
                try {
                  setDownloadingAll(true);
                  for (const item of items) {
                    await nativeDownload(item.url, item.name, { previewFirst: false });
                    await new Promise((r) => setTimeout(r, 250));
                  }
                } finally {
                  setDownloadingAll(false);
                }
                return;
              }

              // iOS path: best-effort auto with generous spacing, then fallback
              startedCountRef.current = 0;
              setDownloadingAll(true);

              // 1) Use the tap to start the first download (this usually works)
              await nativeDownload(items[0].url, items[0].name, { previewFirst: false });
              startedCountRef.current++;

              // 2) Try to continue automatically with spacing; if blocked, we'll fall back
              for (let i = 1; i < items.length; i++) {
                try {
                  await new Promise((r) => setTimeout(r, delayFor(items[i].name || items[i].url)));
                  await nativeDownload(items[i].url, items[i].name, { previewFirst: false });
                  startedCountRef.current++;
                } catch {
                  break; // stop trying; we'll switch to guided
                }
              }

              setDownloadingAll(false);

              // 3) If not all started, switch to guided flow to finish with taps
              if (startedCountRef.current < items.length) {
                await startGuidedDownload(items, startedCountRef.current);
              }
            }}
          >
            {downloadingAll ? "Downloading..." : "Download All"}
          </button>
          {isIOS() && filteredMediaItems.length > 1 && (
            <p style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
              iOS may require extra taps. If auto-stops, you'll see a "Download next" button.
            </p>
          )}
        </div>
      )}

      {/* Guided Download Modal (mobile/iOS fallback) */}
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
