// src/pages/GalleryPage.jsx
import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";
import "../style.css";

/* ---------- helpers ---------- */
const extFromName = (name = "") => (name.split(".").pop() || "").toLowerCase();
const isImageExt = (e = "") =>
  ["png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "avif"].includes(e);
const isVideoExt = (e = "") => ["mp4", "mov", "avi", "mkv", "webm"].includes(e);

// pattern: [wide, half, half] repeating
const applyPattern = (items) =>
  items.map((it, i) => ({ ...it, variant: i % 3 === 0 ? "wide" : "half" }));

/* ---------- Lazy tile (uses originals, but loads gently) ---------- */
const LazyMedia = React.memo(function LazyMedia({ url, alt, isVideo, variant, onClick }) {
  const [inView, setInView] = useState(false);
  const mediaRef = useRef(null);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    if (mediaRef.current) obs.observe(mediaRef.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={mediaRef}
      className={`tile ${variant}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick?.())}
    >
      {inView ? (
        isVideo ? (
          <video className="tile-media" preload="none" playsInline muted />
        ) : (
          <img
            src={url}
            alt={alt}
            className="tile-media"
            loading="lazy"
            decoding="async"
            fetchpriority="low"
          />
        )
      ) : (
        <div className="placeholder" />
      )}
    </div>
  );
});

/* ---------- Page ---------- */
export default function GalleryPage() {
  // master list of refs (names/paths only)
  const [allRefs, setAllRefs] = useState([]); // [{fullPath, name, ext}]
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState("");

  // UI state
  const [filter, setFilter] = useState("all"); // all | images | videos
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState("");
  const [selectedIsVideo, setSelectedIsVideo] = useState(false);

  // pagination
  const itemsPerPage = 6;
  const [currentPage, setCurrentPage] = useState(1);

  // URL cache so we don’t refetch download URLs
  const urlCache = useRef(new Map()); // fullPath -> downloadURL

  // preconnect to Storage
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = "https://firebasestorage.googleapis.com";
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  // 1) List refs once (lightweight)
  useEffect(() => {
    const run = async () => {
      try {
        setLoadingList(true);
        const folderRef = ref(storage, "MainGallery");
        const res = await listAll(folderRef);
        const refs = res.items.map((r) => ({
          name: r.name,
          fullPath: r.fullPath,
          ext: extFromName(r.name),
        }));
        setAllRefs(refs);
      } catch (e) {
        console.error(e);
        setError("אירעה שגיאה בטעינת המדיה.");
      } finally {
        setLoadingList(false);
      }
    };
    run();
  }, []);

  // 2) Filter at ref-level
  const filteredRefs = useMemo(() => {
    return allRefs.filter((r) => {
      const img = isImageExt(r.ext);
      const vid = isVideoExt(r.ext);
      if (filter === "images") return img;
      if (filter === "videos") return vid;
      return img || vid;
    });
  }, [allRefs, filter]);

  // reset to page 1 when filter/length changes
  useEffect(() => setCurrentPage(1), [filter, filteredRefs.length]);

  // 3) Page refs only
  const totalPages = Math.ceil(filteredRefs.length / itemsPerPage);
  const pageRefs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRefs.slice(start, start + itemsPerPage);
  }, [filteredRefs, currentPage]);

  // 4) Resolve download URLs only for current page
  const [pageItems, setPageItems] = useState([]); // [{url, name, isVideo, fullPath}]
  const [loadingPage, setLoadingPage] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoadingPage(true);
        const urls = await Promise.all(
          pageRefs.map(async (r) => {
            if (urlCache.current.has(r.fullPath)) {
              return {
                name: r.name,
                fullPath: r.fullPath,
                url: urlCache.current.get(r.fullPath),
                isVideo: isVideoExt(r.ext),
              };
            }
            const u = await getDownloadURL(ref(storage, r.fullPath));
            urlCache.current.set(r.fullPath, u);
            return { name: r.name, fullPath: r.fullPath, url: u, isVideo: isVideoExt(r.ext) };
          })
        );
        if (!cancelled) setPageItems(urls);
      } catch (e) {
        console.error(e);
        if (!cancelled) setPageItems([]);
      } finally {
        if (!cancelled) setLoadingPage(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [pageRefs]);

  // 5) Prefetch NEXT page originals (instant pagination)
  useEffect(() => {
    if (currentPage >= totalPages) return;
    const start = currentPage * itemsPerPage;
    const nextRefs = filteredRefs.slice(start, start + itemsPerPage);

    const idle = (cb) =>
      (window.requestIdleCallback
        ? window.requestIdleCallback(cb, { timeout: 1200 })
        : setTimeout(cb, 300));

    const cancel = idle(async () => {
      for (const r of nextRefs) {
        if (urlCache.current.has(r.fullPath)) continue;
        try {
          const u = await getDownloadURL(ref(storage, r.fullPath));
          urlCache.current.set(r.fullPath, u);
          // Light-touch the image to push into HTTP cache (skip videos—too heavy)
          if (isImageExt(r.ext)) {
            const img = new Image();
            img.decoding = "async";
            img.loading = "eager";
            img.referrerPolicy = "no-referrer";
            img.src = u;
          }
        } catch {}
      }
    });

    return () => {
      if (window.cancelIdleCallback && typeof cancel === "number") {
        window.cancelIdleCallback(cancel);
      } else {
        clearTimeout(cancel);
      }
    };
  }, [currentPage, totalPages, filteredRefs]);

  // 6) Background warm ALL images (idle, chunked). Uses SW if present, else browser cache.
  useEffect(() => {
    if (!filteredRefs.length) return;

    // Respect user’s connection/data saver
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (c?.saveData || /2g/.test(c?.effectiveType || "")) return;

    let aborted = false;
    const CHUNK = 24;

    const idle = (cb) =>
      (window.requestIdleCallback
        ? window.requestIdleCallback(cb, { timeout: 1500 })
        : setTimeout(cb, 300));

    const warmChunk = async (refsChunk) => {
      // 1) Resolve URLs (only images; videos are too big to prewarm)
      const urls = (
        await Promise.all(
          refsChunk.map(async (r) => {
            if (!isImageExt(r.ext)) return null;
            if (urlCache.current.has(r.fullPath)) return urlCache.current.get(r.fullPath);
            try {
              const u = await getDownloadURL(ref(storage, r.fullPath));
              urlCache.current.set(r.fullPath, u);
              return u;
            } catch {
              return null;
            }
          })
        )
      ).filter(Boolean);

      if (!urls.length) return;

      // 2) If a SW controls the page, ask it to cache them
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "WARM_CACHE", urls });
      }

      // 3) Also touch them so the browser HTTP cache warms even without SW
      for (const u of urls) {
        if (aborted) break;
        const img = new Image();
        img.decoding = "async";
        img.loading = "eager";
        img.referrerPolicy = "no-referrer";
        img.src = u;
        // tiny delay to be polite
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 40));
      }
    };

    // Chunk the whole list and warm lazily
    const chunks = [];
    for (let i = 0; i < filteredRefs.length; i += CHUNK) {
      chunks.push(filteredRefs.slice(i, i + CHUNK));
    }

    let i = 0;
    const pump = () => {
      if (aborted || i >= chunks.length) return;
      warmChunk(chunks[i++]).finally(() => idle(pump));
    };

    const token = idle(pump);
    return () => {
      aborted = true;
      if (window.cancelIdleCallback && typeof token === "number") {
        window.cancelIdleCallback(token);
      } else {
        clearTimeout(token);
      }
    };
  }, [filteredRefs]);

  // 7) Pattern for current page
  const patternedPageItems = useMemo(() => applyPattern(pageItems), [pageItems]);

  const openModal = useCallback((url, isVideo) => {
    setSelectedUrl(url);
    setSelectedIsVideo(isVideo);
    setModalOpen(true);
  }, []);
  const closeModal = useCallback(() => {
    setSelectedUrl("");
    setSelectedIsVideo(false);
    setModalOpen(false);
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e) => e.key === "Escape" && closeModal();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen, closeModal]);

  if (loadingList) return <div className="gallery-container loading">טוען מדיה…</div>;
  if (error) return <div className="gallery-container error">{error}</div>;
  if (filteredRefs.length === 0)
    return (
      <div className="gallery-container no-media">
        {filter === "images" ? "לא נמצאו תמונות." : filter === "videos" ? "לא נמצאו סרטונים." : "לא נמצאו פריטים."}
      </div>
    );

  return (
    <div className="gallery-container">
      <h1 className="gallery-title">הגלריה הראשית</h1>

      <div className="gallery-buttons">
        <button onClick={() => setFilter("all")} className={`filter-button ${filter === "all" ? "active" : ""}`}>
          הכל
        </button>
        <button onClick={() => setFilter("images")} className={`filter-button ${filter === "images" ? "active" : ""}`}>
          תמונות
        </button>
        <button onClick={() => setFilter("videos")} className={`filter-button ${filter === "videos" ? "active" : ""}`}>
          סרטונים
        </button>
      </div>

      {/* Grid: 9 originals only (for this page) */}
      <div className="gallery-grid collage">
        {loadingPage
          ? Array.from({ length: itemsPerPage }).map((_, i) => (
              <div key={i} className={`tile ${i % 3 === 0 ? "wide" : "half"}`}>
                <div className="placeholder" />
              </div>
            ))
          : patternedPageItems.map((m, i) => (
              <LazyMedia
                key={`${m.fullPath}-${i}`}
                url={m.url}
                alt={m.name}
                isVideo={m.isVideo}
                variant={m.variant}
                onClick={() => openModal(m.url, m.isVideo)}
              />
            ))}
      </div>

      {/* Pagination (centered) */}
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

      {/* Modal */}
      {modalOpen && selectedUrl && (
        <div className="media-modal" onClick={closeModal} role="dialog" aria-modal="true">
          <div className="media-modal-content" onClick={(e) => e.stopPropagation()}>
            {selectedIsVideo ? (
              <video src={selectedUrl} controls className="modal-media" preload="auto" />
            ) : (
              <img src={selectedUrl} alt="תצוגה מוגדלת" className="modal-media" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
