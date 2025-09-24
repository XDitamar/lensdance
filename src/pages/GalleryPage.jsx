// src/pages/GalleryPage.jsx
import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";
import "../style.css";

/* ---------- small helpers ---------- */
const extFromName = (name = "") => (name.split(".").pop() || "").toLowerCase();
const isImageExt = (e = "") => ["png", "jpg", "jpeg", "gif", "webp", "heic", "heif"].includes(e);
const isVideoExt = (e = "") => ["mp4", "mov", "avi", "mkv", "webm"].includes(e);

/* Orientation inference (only for the current page) */
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
    const done = () => resolve({ width: v.videoWidth || 0, height: v.videoHeight || 0 });
    v.onloadedmetadata = done;
    v.onerror = done;
    v.src = url;
  });
}
async function inferVariantForUrl(url, isVideo) {
  try {
    const { width, height } = isVideo ? await getVideoSize(url) : await getImageSize(url);
    if (!width || !height) return "wide"; // safe default
    return width >= height ? "wide" : "half";
  } catch {
    return "wide";
  }
}

/* Lazy renderer that accepts a variant for the collage grid */
const LazyMedia = React.memo(function LazyMedia({ url, alt, isVideo, onClick, variant = "half" }) {
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
      { root: null, rootMargin: "200px", threshold: 0 }
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
          <video src={url} className="tile-media" playsInline muted preload="metadata" />
        ) : (
          <img src={url} alt={alt} className="tile-media" loading="lazy" />
        )
      ) : (
        <div className="placeholder" />
      )}
    </div>
  );
});

export default function GalleryPage() {
  /* master list of refs (we won’t fetch URLs until a page is chosen) */
  const [allRefs, setAllRefs] = useState([]); // [{name, fullPath, ext}]
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState("");

  /* UI state */
  const [filter, setFilter] = useState("all"); // all | images | videos
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState("");

  /* pagination */
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Preconnect to Firebase Storage
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = "https://firebasestorage.googleapis.com";
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  // Step 1: list refs ONCE (cheap) – no URL fetching yet
  useEffect(() => {
    const run = async () => {
      try {
        setLoadingList(true);
        const folderRef = ref(storage, "MainGallery");
        const result = await listAll(folderRef);
        const refs = result.items.map((r) => ({
          name: r.name,
          fullPath: r.fullPath,
          ext: extFromName(r.name),
        }));
        // Optional: newest first by name if your names are timestamps; else keep original order
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

  // Step 2: filter at the REF level (no URL data yet)
  const filteredRefs = useMemo(() => {
    return allRefs.filter((r) => {
      const isImg = isImageExt(r.ext);
      const isVid = isVideoExt(r.ext);
      if (filter === "images") return isImg;
      if (filter === "videos") return isVid;
      return isImg || isVid;
    });
  }, [allRefs, filter]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, filteredRefs.length]);

  // Pagination computed on REFs
  const totalPages = Math.ceil(filteredRefs.length / itemsPerPage);
  const pageRefs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRefs.slice(start, start + itemsPerPage);
  }, [filteredRefs, currentPage]);

  /* Step 3: For CURRENT PAGE ONLY, fetch URLs and infer orientation */
  const [pageItems, setPageItems] = useState([]); // [{url, name, isVideo, variant}]
  const [loadingPage, setLoadingPage] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoadingPage(true);
        // Fetch URLs only for current page
        const urls = await Promise.all(
          pageRefs.map(async (r) => {
            const u = await getDownloadURL(ref(storage, r.fullPath));
            return { ...r, url: u };
          })
        );

        // Infer variant per item (still only 9 items)
        const withVariants = await Promise.all(
          urls.map(async (it) => {
            const isVid = isVideoExt(it.ext);
            const variant = await inferVariantForUrl(it.url, isVid);
            return { url: it.url, name: it.name, isVideo: isVid, variant };
          })
        );

        if (!cancelled) setPageItems(withVariants);
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

  /* Step 4: Arrange current page into pattern [wide, half, half] repeating */
  const patternedPageItems = useMemo(() => {
    const wides = [];
    const halves = [];
    for (const it of pageItems) (it.variant === "wide" ? wides : halves).push(it);

    const out = [];
    const pattern = ["wide", "half", "half"];
    let wi = 0,
      hi = 0,
      pi = 0;
    while (wi < wides.length || hi < halves.length) {
      const want = pattern[pi % pattern.length];
      if (want === "wide") {
        if (wi < wides.length) out.push(wides[wi++]);
        else if (hi < halves.length) out.push(halves[hi++]); // fallback
      } else {
        if (hi < halves.length) out.push(halves[hi++]);
        else if (wi < wides.length) out.push(wides[wi++]); // fallback
      }
      pi++;
    }
    return out;
  }, [pageItems]);

  const openModal = useCallback((url) => {
    setSelectedUrl(url);
    setModalOpen(true);
  }, []);
  const closeModal = useCallback(() => {
    setSelectedUrl("");
    setModalOpen(false);
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e) => e.key === "Escape" && closeModal();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen, closeModal]);

  if (loadingList) {
    return <div className="gallery-container loading">טוען מדיה…</div>;
  }
  if (error) {
    return <div className="gallery-container error">{error}</div>;
  }
  if (filteredRefs.length === 0) {
    const emptyText =
      filter === "images"
        ? "לא נמצאו תמונות."
        : filter === "videos"
        ? "לא נמצאו סרטונים."
        : "לא נמצאו פריטים.";
    return <div className="gallery-container no-media">{emptyText}</div>;
  }

  return (
    <div className="gallery-container">
      <h1 className="gallery-title">הגלריה הראשית</h1>

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

      {/* current page grid (only 9 items fetched) */}
      <div className="gallery-grid collage">
        {loadingPage ? (
          <>
            {/* 6–9 placeholders look nice while loading */}
            {Array.from({ length: itemsPerPage }).map((_, i) => (
              <div key={i} className={`tile ${i % 3 === 0 ? "wide" : "half"}`}>
                <div className="placeholder" />
              </div>
            ))}
          </>
        ) : (
          patternedPageItems.map((m, i) => (
            <LazyMedia
              key={`${m.url}-${i}`}
              url={m.url}
              alt={m.name}
              isVideo={m.isVideo}
              variant={m.variant || "half"}
              onClick={() => openModal(m.url)}
            />
          ))
        )}
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
      {modalOpen && (
        <div className="media-modal" onClick={closeModal} role="dialog" aria-modal="true">
          <div className="media-modal-content" onClick={(e) => e.stopPropagation()}>
            {/\.mp4|\.mov|\.avi|\.mkv|\.webm/i.test(selectedUrl.split("?")[0]) ? (
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
