import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { auth, storage } from "../firebase";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import "../style.css";

/* ---------------------------------------------
 *   iOS video priming
 * ---------------------------------------------- */
let __videosPrimed = false;
function isLikelyIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isiOSDevice =
    /iP(hone|od|ad)/.test(ua) ||
    (/Mac/.test(ua) && typeof window !== "undefined" && "ontouchend" in window);
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

/* ---------------------------------------------
 *   Downloads
 * ---------------------------------------------- */
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

/* ---------------------------------------------
 *   Media utils
 * ---------------------------------------------- */
const extFromUrl = (url) => url.split("?")[0].split(".").pop().toLowerCase();
const isVideoExt = (ext) => /(mp4|mov|avi|mkv|webm)$/i.test(ext || "");
const isImageExt = (ext) => /(png|jpg|jpeg|gif|webp|heic|heif|svg)$/i.test(ext || "");
const isVideoUrl = (url) => isVideoExt(extFromUrl(url));

/* ---------------------------------------------
 *   Orientation inference
 * ---------------------------------------------- */
function getImageSize(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}
function getVideoSize(url) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    const done = () =>
      resolve({
        width: v.videoWidth || 0,
        height: v.videoHeight || 0,
      });
    v.onloadedmetadata = done;
    v.onerror = done;
    v.src = url;
  });
}
async function inferVariantForUrl(url, isVideo) {
  try {
    const { width, height } = isVideo ? await getVideoSize(url) : await getImageSize(url);
    if (!width || !height) return "wide";
    return width >= height ? "wide" : "half";
  } catch {
    return "wide";
  }
}

/* ---------------------------------------------
 *   LazyMedia - MODIFIED FOR LQIP
 * ---------------------------------------------- */
const LazyMedia = React.memo(({ url, alt, isVideo, onClick, variant = "half", lqipUrl }) => {
  const [inView, setInView] = useState(false);
  const [loaded, setLoaded] = useState(false); // New state to track if high-res image is loaded
  const mediaRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
          if (videoRef.current && isLikelyIOS()) {
            try {
              videoRef.current.load();
            } catch {}
          }
        }
      },
      { root: null, rootMargin: "200px", threshold: 0 }
    );
    if (mediaRef.current) observer.observe(mediaRef.current);
    return () => observer.disconnect();
  }, []);

  const handleImageLoad = useCallback(() => {
    setLoaded(true);
  }, []);

  return (
    <div
      ref={mediaRef}
      className={`tile ${variant}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
      style={{ position: 'relative', overflow: 'hidden' }} // Added styles for overlay
    >
      {inView ? (
        isVideo ? (
          // Video rendering logic (remains the same)
          <video
            ref={videoRef}
            src={url}
            className="tile-media"
            playsInline
            muted
            preload={isLikelyIOS() ? "auto" : "metadata"}
            data-prime="1"
          />
        ) : (
          // Image rendering logic - using LQIP (Blur-up)
          <>
            {/* 1. Low-Quality Placeholder (LQIP) - Loads instantly, blurred */}
            {!loaded && lqipUrl && (
              <img
                src={lqipUrl}
                alt={`Placeholder for ${alt}`}
                className="tile-media lqip"
                aria-hidden="true"
                style={{
                  filter: 'blur(10px)',
                  transition: 'opacity 0.5s',
                  opacity: 1,
                  // Ensure LQIP covers the tile
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            )}

            {/* 2. High-Resolution Image - Fades in on load */}
            <img
              src={url}
              alt={alt}
              className="tile-media"
              loading="lazy"
              onLoad={handleImageLoad}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transition: 'opacity 0.5s',
                opacity: loaded ? 1 : 0, // Fade in when loaded
              }}
            />
          </>
        )
      ) : (
        // Initial placeholder before IntersectionObserver triggers
        <div className="placeholder" />
      )}
    </div>
  );
});

/* ---------------------------------------------
 *   Page
 * ---------------------------------------------- */
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

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

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

      const baseItemsPromises = res.items.map(async (itemRef) => {
        if (itemRef.name === ".placeholder") return null;
        const url = await getDownloadURL(itemRef);
        const type = itemRef.name.split(".").pop();
        const isVid = isVideoExt((type || "").toLowerCase()) || isVideoUrl(url);
        const variant = await inferVariantForUrl(url, isVid);
        
        // NOTE: For LQIP to work, you MUST generate and provide a lqipUrl 
        // (a tiny, compressed version of the image) from your backend/storage setup.
        // For demonstration, we'll assume it's the same URL for now, but in reality 
        // you'd fetch a dedicated thumbnail URL (e.g., from a separate "thumbs" folder).
        const lqipUrl = !isVid ? url : undefined; // Placeholder: use full URL for size inference, but needs real LQIP URL
        
        return { id: itemRef.fullPath, url, name: itemRef.name, type, isVideo: isVid, variant, lqipUrl };
      });

      const mediaData = (await Promise.all(baseItemsPromises)).filter(Boolean);
      setMediaItems(mediaData);
    } catch (e) {
      console.error(e);
      setError("טעינת הגלריה הפרטית נכשלה.");
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

  // pattern: wide → half+half → wide …
  const patternedItems = useMemo(() => {
    let out = [];
    let i = 0;
    while (i < filteredMediaItems.length) {
      if (i % 3 === 0) {
        // Use the original item but set variant to wide
        out.push({ ...filteredMediaItems[i], variant: "wide" });
        i++;
      } else {
        // Use the original item but set variant to half
        out.push({ ...filteredMediaItems[i], variant: "half" });
        if (i + 1 < filteredMediaItems.length) {
          // Use the next original item and set variant to half
          out.push({ ...filteredMediaItems[i + 1], variant: "half" });
        }
        i += 2;
      }
    }
    return out;
  }, [filteredMediaItems]);

  const totalPages = Math.ceil(patternedItems.length / itemsPerPage);
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return patternedItems.slice(start, start + itemsPerPage);
  }, [patternedItems, currentPage]);

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
        <p>{authLoading ? "בודק התחברות..." : "טוען את הגלריה שלך..."}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="container" style={{ textAlign: "center" }}>
        <h2 className="section-title">הגלריה שלי</h2>
        <p>אינך מחובר.</p>
        <Link className="auth-primary" to="/login">
          התחבר כדי לצפות בתמונות שלך
        </Link>
      </main>
    );
  }

  if (error) {
    return (
      <main className="container" style={{ textAlign: "center" }}>
        <h2 className="section-title">הגלריה שלי</h2>
        <p>{error}</p>
      </main>
    );
  }

  return (
    <main className="container">
      <h2 className="section-title">הגלריה שלי</h2>

      {/* Filter */}
      <div className="gallery-buttons">
        <button
          onClick={() => setFilter("all")}
          className={`filter-button ${filter === "all" ? "active" : ""}`}
        >
          הכל
        </button>
        <button
          onClick={() => setFilter("images")}
          className={`filter-button ${filter === "images" ? "active" : ""}`}
        >
          תמונות
        </button>
        <button
          onClick={() => setFilter("videos")}
          className={`filter-button ${filter === "videos" ? "active" : ""}`}
        >
          סרטונים
        </button>
      </div>

      {/* Gallery */}
      <div className="gallery-grid collage">
        {pageItems.length > 0 ? (
          pageItems.map((m) => (
            <LazyMedia
              key={m.id}
              url={m.url}
              alt={m.name}
              isVideo={m.isVideo ?? isVideoUrl(m.url)}
              variant={m.variant || "half"}
              lqipUrl={m.lqipUrl} // Passed the new prop
              onClick={() => openModal(m)}
            />
          ))
        ) : (
          <p style={{ marginTop: 20, color: "#666" }}>לא נמצאו פריטים בעמוד זה.</p>
        )}
      </div>

      {/* Controls: pagination above, download all below */}
      {(totalPages > 1 || patternedItems.length > 0) && (
        <div style={{ marginTop: 14 }}>
          {totalPages > 1 && (
            <div className="pagination-row">
              <div className="pagination" style={{ direction: "ltr" }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
                  <button
                    key={num}
                    className={`page-btn ${currentPage === num ? "active" : ""}`}
                    onClick={() => setCurrentPage(num)}
                    aria-current={currentPage === num ? "page" : undefined}
                    style={{
                      background: currentPage === num ? "#6A402A" : "#eee",
                      color: currentPage === num ? "#fff" : "#111",
                      border: "none",
                      padding: "6px 12px",
                      borderRadius: 8,
                      cursor: "pointer",
                      minWidth: 36,
                      fontWeight: currentPage === num ? 700 : 500,
                    }}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          )}

          {patternedItems.length > 0 && (
            <div className="download-row">
              <button
                type="button"
                className="download-btn"
                disabled={installingAll}
                onClick={async () => {
                  setInstallingAll(true);
                  try {
                    for (const item of patternedItems) {
                      await nativeDownload(item.url, item.name, { prefer: "auto" });
                      await new Promise((r) => setTimeout(r, 350));
                    }
                  } finally {
                    setInstallingAll(false);
                  }
                }}
              >
                {installingAll ? "מוריד..." : "הורד הכל"}
              </button>
            </div>
          )}
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
                style={{
                  background: "#111",
                  maxHeight: "80vh",
                  width: "100%",
                  objectFit: "contain",
                }}
              />
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="download-btn"
                onClick={() =>
                  nativeDownload(selectedItem.url, selectedItem.name, { prefer: "auto" })
                }
              >
                הורד
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}