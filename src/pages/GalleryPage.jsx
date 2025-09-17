// src/pages/GalleryPage.jsx
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { ref, listAll, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import '../style.css';

/* -------------------------- perf: connection hints ------------------------- */
const FIREBASE_HOST = 'https://firebasestorage.googleapis.com';

function addHeadLink(rel, href, attrs = {}) {
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  Object.entries(attrs).forEach(([k, v]) => link.setAttribute(k, v));
  document.head.appendChild(link);
  return () => document.head.removeChild(link);
}

/* ------------------------------ LazyMedia tile ----------------------------- */
const LazyMedia = React.memo(function LazyMedia({
  url,
  alt,
  isVideo,
  onClick,
  priority = 'auto', // 'high' for first row(s)
}) {
  const [inView, setInView] = useState(false);
  const [ready, setReady] = useState(false); // for fade-in
  const mediaRef = useRef(null);

  // Prefetch/warm the image as soon as it's near the viewport (or immediately if priority=high)
  useEffect(() => {
    let cleanup = () => {};
    if (!isVideo) {
      const warm = () => {
        // <link rel="preload" as="image"> (Chrome/Edge)
        cleanup = addHeadLink('preload', url, { as: 'image', crossOrigin: 'anonymous' });
        // Safari-friendly warm-up
        const img = new Image();
        img.decoding = 'async';
        img.loading = 'eager';
        img.src = url;
      };
      if (priority === 'high') warm();
      else if (inView) warm();
    }
    return () => cleanup();
  }, [url, isVideo, inView, priority]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin: '400px', threshold: 0 } // start earlier
    );
    if (mediaRef.current) observer.observe(mediaRef.current);
    return () => observer.disconnect();
  }, []);

  // When image element mounts, ensure it’s decoded before showing (prevents flash)
  const onImgLoad = useCallback((e) => {
    const img = e.currentTarget;
    if ('decode' in img) {
      img.decode?.().catch(() => {}).finally(() => setReady(true));
    } else {
      setReady(true);
    }
  }, []);

  const isHigh = priority === 'high';

  return (
    <div
      ref={mediaRef}
      className="gallery-item"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick();
          e.preventDefault();
        }
      }}
      // Reserve space to avoid CLS (tweak to your tile aspect)
      style={{ aspectRatio: '1 / 1', position: 'relative', overflow: 'hidden' }}
    >
      {inView ? (
        isVideo ? (
          <video
            src={url}
            className="gallery-item-media"
            playsInline
            muted
            preload="metadata"
            style={{ background: '#000', objectFit: 'cover' }}
          />
        ) : (
          <img
            src={url}
            alt={alt}
            className="gallery-item-media"
            // priority hints
            loading={isHigh ? 'eager' : 'lazy'}
            fetchPriority={isHigh ? 'high' : 'auto'}
            decoding="async"
            // responsive hint (adjust to your grid column width)
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            onLoad={onImgLoad}
            style={{
              background: '#111',
              objectFit: 'cover',
              opacity: ready ? 1 : 0,
              transition: 'opacity 220ms ease',
              willChange: 'opacity',
            }}
          />
        )
      ) : (
        <div className="media-placeholder" />
      )}
    </div>
  );
});

/* -------------------------------- Page comp -------------------------------- */
const GalleryPage = () => {
  const [mediaUrls, setMediaUrls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMediaUrl, setSelectedMediaUrl] = useState('');

  // Connection hints once
  useEffect(() => {
    const cleanups = [
      addHeadLink('preconnect', FIREBASE_HOST, { crossOrigin: 'anonymous' }),
      addHeadLink('dns-prefetch', FIREBASE_HOST),
    ];
    return () => cleanups.forEach((c) => c && c());
  }, []);

  // Fetch URLs from Firebase Storage
  useEffect(() => {
    const fetchMedia = async () => {
      try {
        const folderRef = ref(storage, 'MainGallery');
        const result = await listAll(folderRef);

        // Kick off getDownloadURL in parallel and settle
        const urls = await Promise.allSettled(result.items.map((item) => getDownloadURL(item)));
        const fulfilled = urls.filter((it) => it.status === 'fulfilled').map((it) => it.value);

        // Optional: stable order (by name) to make priority targeting consistent
        const ordered = fulfilled.sort((a, b) => a.localeCompare(b));

        setMediaUrls(ordered);
      } catch (err) {
        console.error('Error fetching media:', err);
        setError('Failed to load media.');
      } finally {
        setLoading(false);
      }
    };
    fetchMedia();
  }, []);

  const isVideoUrl = useCallback((url) => {
    const fileExtension = url.split('?')[0].split('.').pop().toLowerCase();
    return ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(fileExtension);
  }, []);

  const filteredMediaUrls = useMemo(() => {
    return mediaUrls.filter((url) => {
      const ext = url.split('?')[0].split('.').pop().toLowerCase();
      const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'].includes(ext);
      const isVideo = ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext);
      if (filter === 'images') return isImage;
      if (filter === 'videos') return isVideo;
      return true;
    });
  }, [mediaUrls, filter]);

  // Preload the first few images hard (improves “no loading” feel)
  useEffect(() => {
    const PRELOAD_COUNT = Math.min(8, filteredMediaUrls.length);
    const cleanups = [];
    for (let i = 0; i < PRELOAD_COUNT; i++) {
      cleanups.push(addHeadLink('preload', filteredMediaUrls[i], { as: 'image', crossOrigin: 'anonymous' }));
      const img = new Image();
      img.decoding = 'async';
      img.loading = 'eager';
      img.src = filteredMediaUrls[i];
    }
    return () => cleanups.forEach((c) => c());
  }, [filteredMediaUrls]);

  const openModal = useCallback((url) => {
    setSelectedMediaUrl(url);
    setModalOpen(true);
  }, []);
  const closeModal = useCallback(() => {
    setSelectedMediaUrl('');
    setModalOpen(false);
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (e) => e.key === 'Escape' && closeModal();
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [modalOpen, closeModal]);

  if (loading) return <div className="gallery-container loading">Loading media...</div>;
  if (error) return <div className="gallery-container error">{error}</div>;
  if (filteredMediaUrls.length === 0)
    return <div className="gallery-container no-media">No {filter === 'all' ? '' : filter} found.</div>;

  // Decide which items get high priority (first 6/8 depending on grid)
  const HIGH_COUNT = Math.min(8, filteredMediaUrls.length);

  return (
    <div className="gallery-container">
      <h1 className="gallery-title">Main Gallery</h1>

      <div className="gallery-buttons">
        <button onClick={() => setFilter('all')} className={`filter-button ${filter === 'all' ? 'active' : ''}`}>
          All
        </button>
        <button onClick={() => setFilter('images')} className={`filter-button ${filter === 'images' ? 'active' : ''}`}>
          Images
        </button>
        <button onClick={() => setFilter('videos')} className={`filter-button ${filter === 'videos' ? 'active' : ''}`}>
          Videos
        </button>
      </div>

      <div className="gallery-grid">
        {filteredMediaUrls.map((url, index) => (
          <LazyMedia
            key={url}
            url={url}
            alt={`Gallery item ${index + 1}`}
            isVideo={isVideoUrl(url)}
            onClick={() => openModal(url)}
            priority={index < HIGH_COUNT ? 'high' : 'auto'}
          />
        ))}
      </div>

      {modalOpen && (
        <div className="media-modal" onClick={closeModal} role="dialog" aria-modal="true">
          <div className="media-modal-content" onClick={(e) => e.stopPropagation()}>
            {isVideoUrl(selectedMediaUrl) ? (
              <video
                src={selectedMediaUrl}
                controls
                className="modal-media"
                preload="auto"
                playsInline
                style={{ background: '#000' }}
              />
            ) : (
              <img src={selectedMediaUrl} alt="Enlarged Media" className="modal-media" decoding="async" />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GalleryPage;
