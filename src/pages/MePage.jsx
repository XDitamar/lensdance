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
    // Force raw bytes (no HTML viewer)
    u.searchParams.set("alt", "media");
    // Ask GCS/Firebase to send Content-Disposition: attachment
    u.searchParams.set(
      "response-content-disposition",
      `attachment; filename="${(filename || "download").replace(/"/g, "")}"`
    );
    // Hint a binary type to nudge browsers away from previewing
    u.searchParams.set("response-content-type", "application/octet-stream");
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Trigger a native download. Prefers iframe for large videos, Blob for images.
 * Fallbacks: anchor[download] → navigate current tab.
 */
async function nativeDownload(
  url,
  filename = "download",
  opts = { prefer: "auto" } // "auto" | "iframe" | "anchor" | "blob"
) {
  const dlUrl = buildAttachmentURL(url, filename);

  // Helper: blob download (reads into memory; good for images/docs)
  const blobDownload = async () => {
    const res = await fetch(dlUrl, { credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = objectUrl;
      a.setAttribute("download", filename || "download");
      a.style.position = "fixed";
      a.style.left = "-9999px";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  if (opts?.prefer === "blob") return blobDownload();

  if (!opts || opts.prefer === "auto") {
    const ext = (url.split("?")[0].split(".").pop() || "").toLowerCase();
    const isVideo = /(mp4|mov|avi|mkv|webm)$/i.test(ext);
    if (isVideo) {
      // Hidden iframe is friendlier for large media
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
        // fall through to anchor
      }
    } else {
      // Prefer Blob for images so they save instead of opening a new tab
      try {
        return await blobDownload();
      } catch {
        // fall through to anchor
      }
    }
  }

  if (opts?.prefer === "iframe") {
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
      // ignore and fall through
    }
  }

  try {
    const a = document.createElement("a");
    a.href = dlUrl;
    a.setAttribute("download", filename || "download");
    a.rel = "noopener";
    a.style.position = "fixed";
    a.style.left = "-9999px";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  } catch {
    window.location.href = dlUrl; // last resort
  }
}

export default function MePage() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [mediaItems, setMediaItems] = useState([]); // [{id,url,name,type}]
  const [loading, setLoading] = useState(true);
  const [installingAll, setInstallingAll] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const extFromUrl = (url) => url.split("?")[0].split(".").pop().toLowerCase();
  const isVideoExt = (ext) => /(mp4|mov|avi|mkv|webm)$/i.test(ext || "");
  const isImageExt = (ext) => /(png|jpg|jpeg|gif|webp|heic|heif|svg)$/i.test(ext || "");
  const isVideoUrl = (url) => isVideoExt(extFromUrl(url));

  // Video MIME helper for <link rel="preload">
  const mimeFromExt = (ext) => {
    switch ((ext || "").toLowerCase()) {
      case "mp4":
        return "video/mp4";
      case "webm":
        return "video/webm";
      case "mov":
        return "video/quicktime";
      case "avi":
        return "video/x-msvideo";
      case "mkv":
        return "video/x-matroska";
      default:
        return "video/mp4";
    }
  };

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

  // Preload: preconnect + preload first few videos' metadata to avoid white flash
  useEffect(() => {
    // One-time preconnect
    const preconnectHref = "https://firebasestorage.googleapis.com";
    if (!document.querySelector(`link[rel="preconnect"][href="${preconnectHref}"]`)) {
      const pc = document.createElement("link");
      pc.rel = "preconnect";
      pc.href = preconnectHref;
      pc.crossOrigin = "anonymous";
      document.head.appendChild(pc);
    }

    // Preload up to N videos
    const MAX_PRELOAD = 8;
    const links = [];
    const toPreload = mediaItems
      .filter((m) => isVideoExt((m.type || "").toLowerCase()))
      .slice(0, MAX_PRELOAD);

    toPreload.forEach((m) => {
      const ext = (m.type || "").toLowerCase();
      const l = document.createElement("link");
      l.rel = "preload";
      l.as = "video";
      l.href = m.url;
      l.type = mimeFromExt(ext);
      document.head.appendChild(l);
      links.push(l);
    });

    return () => {
      links.forEach((l) => l.remove());
    };
  }, [mediaItems]);

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

  // Esc to close
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
                  preload="metadata"
                  onLoadedData={(e) => e.currentTarget.classList.add("loaded")}
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

      {/* Install All (downloads all types: images + videos) */}
      {filteredMediaItems.length > 0 && (
        <div style={{ marginTop: 30, textAlign: "center" }}>
          <button
            type="button"
            className="download-btn"
            disabled={installingAll}
            onClick={async () => {
              setInstallingAll(true);
              try {
                for (const item of filteredMediaItems) {
                  await nativeDownload(item.url, item.name, { prefer: "auto" });
                  // small delay so browsers don't collapse multiple downloads
                  await new Promise((r) => setTimeout(r, 400));
                }
              } finally {
                setInstallingAll(false);
              }
            }}
          >
            {installingAll ? "Installing..." : "Install All"}
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
              <video
                src={selectedItem.url}
                controls
                className="modal-media"
                preload="metadata"
              />
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
                    prefer: "auto",
                  })
                }
              >
                Install
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
