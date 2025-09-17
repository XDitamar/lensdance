// src/pages/MePage.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { auth, storage } from "../firebase";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import "../style.css";

// ---------------------------------------------------------
// iOS video priming: make mobile preload/paint like desktop
// ---------------------------------------------------------
let __videosPrimed = false;

function isLikelyIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isiOSDevice = /iP(hone|od|ad)/.test(ua) || (/Mac/.test(ua) && typeof window !== "undefined" && "ontouchend" in window);
  return isiOSDevice;
}

function primeIOSVideosOnce() {
  if (__videosPrimed || !isLikelyIOS()) return;
  __videosPrimed = true;
  const vids = document.querySelectorAll('video[data-prime="1"]');
  vids.forEach((v) => {
    try {
      v.muted = true;
      v.playsInline = true;
      const p = v.play();
      if (p && typeof p.then === "function") {
        p.then(() => v.pause()).catch(() => {});
      } else {
        v.pause();
      }
    } catch {}
  });
}

if (typeof window !== "undefined") {
  const handler = () => {
    primeIOSVideosOnce();
    window.removeEventListener("touchstart", handler, true);
    window.removeEventListener("pointerdown", handler, true);
    window.removeEventListener("click", handler, true);
  };
  window.addEventListener("touchstart", handler, true);
  window.addEventListener("pointerdown", handler, true);
  window.addEventListener("click", handler, true);
}

// ---------------------------------------------------------
// Downloads (unchanged)
// ---------------------------------------------------------
function buildAttachmentURL(url, filename) {
  try {
    const u = new URL(url);
    u.searchParams.set("alt", "media");
    u.searchParams.set(
      "response-content-disposition",
      `attachment; filename="${(filename || "download").replace(/"/g, "")}"`
    );
    u.searchParams.set("response-content-type", "application/octet-stream");
    return u.toString();
  } catch {
    return url;
  }
}

async function nativeDownload(url, filename = "download", opts = { prefer: "auto" }) {
  const dlUrl = buildAttachmentURL(url, filename);
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
      } catch {}
    } else {
      try {
        return await blobDownload();
      } catch {}
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
    } catch {}
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
    window.location.href = dlUrl;
  }
}

// ---------------------------------------------------------
// Media utils
// ---------------------------------------------------------
const extFromUrl = (url) => url.split("?")[0].split(".").pop().toLowerCase();
const isVideoExt = (ext) => /(mp4|mov|avi|mkv|webm)$/i.test(ext || "");
const isImageExt = (ext) => /(png|jpg|jpeg|gif|webp|heic|heif|svg)$/i.test(ext || "");
const isVideoUrl = (url) => isVideoExt(extFromUrl(url));

// ---------------------------------------------------------
// LazyMedia with iOS priming-aware preload
// ---------------------------------------------------------
const LazyMedia = React.memo(({ url, alt, isVideo, onClick }) => {
  const [inView, setInView] = useState(false);
  const mediaRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
          if (videoRef.current && isLikelyIOS()) {
            try { videoRef.current.load(); } catch {}
          }
        }
      },
      { root: null, rootMargin: "200px", threshold: 0 }
    );
    if (mediaRef.current) observer.observe(mediaRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={mediaRef}
      className="gallery-item-media-container"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
      {inView ? (
        isVideo ? (
          <video
            ref={videoRef}
            src={url}
            className="gallery-item-media"
            playsInline
            muted
            preload={isLikelyIOS() ? "auto" : "metadata"}
            data-prime="1"
            style={{ background: "#000", objectFit: "cover" }}
          />
        ) : (
          <img src={url} alt={alt} className="gallery-item-media" loading="lazy" />
        )
      ) : (
        <div className="placeholder" />
      )}
    </div>
  );
});

export default function MePage() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mediaItems, setMediaItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [installingAll, setInstallingAll] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

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

      const mediaData = (await Promise.all(mediaPromises)).filter(Boolean);
      setMediaItems(mediaData);
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

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (e) => e.key === "Escape" && closeModal();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

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
            <LazyMedia
              key={m.id}
              url={m.url}
              alt={m.name}
              isVideo={isVideoUrl(m.url)}
              onClick={() => openModal(m)}
            />
          ))
        ) : (
          <p style={{ marginTop: 20, color: "\#666" }}>
            No {filter === "all" ? "" : filter} found in your gallery.
          </p>
        )}
      </div>

      {/* Install All */}
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
        <div className="media-modal" onClick={closeModal} role="dialog" aria-modal="true">
          <div className="media-modal-content" onClick={(e) => e.stopPropagation()}>
            {isVideoUrl(selectedItem.url) ? (
              <video
                src={selectedItem.url}
                controls
                className="modal-media"
                preload="metadata"
                playsInline
                style={{ background: "#000", maxHeight: "80vh", width: "100%" }}
              />
            ) : (
              <img
                src={selectedItem.url}
                alt={selectedItem.name}
                className="modal-media"
                style={{ background: "#111", maxHeight: "80vh", width: "100%", objectFit: "contain" }}
              />
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="download-btn"
                onClick={() => nativeDownload(selectedItem.url, selectedItem.name, { prefer: "auto" })}
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
