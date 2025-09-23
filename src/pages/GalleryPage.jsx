// src/pages/GalleryPage.jsx
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { ref, listAll, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import '../style.css';

// Reusable component for lazy loading
const LazyMedia = React.memo(({ url, alt, isVideo, onClick }) => {
  const [inView, setInView] = useState(false);
  const mediaRef = useRef();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect(); // Stop observing once in view
        }
      },
      {
        root: null,
        rootMargin: '200px',
        threshold: 0,
      }
    );

    if (mediaRef.current) {
      observer.observe(mediaRef.current);
    }

    return () => {
      if (mediaRef.current) {
        observer.unobserve(mediaRef.current);
      }
    };
  }, []);

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
    >
      {inView ? (
        isVideo ? (
          <video
            src={url}
            className="gallery-item-media"
            playsInline
            muted
            preload="metadata"
          />
        ) : (
          <img
            src={url}
            alt={alt}
            className="gallery-item-media"
            loading="lazy"
          />
        )
      ) : (
        <div className="media-placeholder" />
      )}
    </div>
  );
});

const GalleryPage = () => {
  const [mediaUrls, setMediaUrls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMediaUrl, setSelectedMediaUrl] = useState('');

  // Preconnect to Firebase Storage for faster resource fetching
  useEffect(() => {
    const preconnectHref = 'https://firebasestorage.googleapis.com';
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = preconnectHref;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);

    return () => {
      document.head.removeChild(link);
    };
  }, []);

  // Fetch URLs from Firebase Storage
  useEffect(() => {
    const fetchMedia = async () => {
      try {
        const folderRef = ref(storage, 'MainGallery');
        const result = await listAll(folderRef);

        const urlPromises = result.items.map((imageRef) => getDownloadURL(imageRef));
        const urls = await Promise.allSettled(urlPromises);

        const fulfilledUrls = urls
          .filter((item) => item.status === 'fulfilled')
          .map((item) => item.value);

        setMediaUrls(fulfilledUrls);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching media:', err);
        setError('אירעה שגיאה בטעינת המדיה.');
        setLoading(false);
      }
    };

    fetchMedia();
  }, []);

  const isVideoUrl = useCallback((url) => {
    const fileExtension = url.split('?')[0].split('.').pop().toLowerCase();
    return ['mp4', 'mov', 'avi', 'mkv'].includes(fileExtension);
  }, []);

  const filteredMediaUrls = useMemo(() => {
    return mediaUrls.filter((url) => {
      const fileExtension = url.split('?')[0].split('.').pop().toLowerCase();
      const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExtension);
      const isVideo = ['mp4', 'mov', 'avi', 'mkv'].includes(fileExtension);

      if (filter === 'images') {
        return isImage;
      }
      if (filter === 'videos') {
        return isVideo;
      }
      return true;
    });
  }, [mediaUrls, filter]);

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

    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeModal();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [modalOpen, closeModal]);

  if (loading) {
    return <div className="gallery-container loading">טוען מדיה…</div>;
  }

  if (error) {
    return <div className="gallery-container error">{error}</div>;
  }

  if (filteredMediaUrls.length === 0) {
    const emptyText =
      filter === 'images'
        ? 'לא נמצאו תמונות.'
        : filter === 'videos'
        ? 'לא נמצאו סרטונים.'
        : 'לא נמצאו פריטים.';
    return (
      <div className="gallery-container no-media">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="gallery-container">
      <h1 className="gallery-title">הגלריה הראשית</h1>
      <div className="gallery-buttons">
        <button
          onClick={() => setFilter('all')}
          className={`filter-button ${filter === 'all' ? 'active' : ''}`}
        >
          הכל
        </button>
        <button
          onClick={() => setFilter('images')}
          className={`filter-button ${filter === 'images' ? 'active' : ''}`}
        >
          תמונות
        </button>
        <button
          onClick={() => setFilter('videos')}
          className={`filter-button ${filter === 'videos' ? 'active' : ''}`}
        >
          סרטונים
        </button>
      </div>
      <div className="gallery-grid">
        {filteredMediaUrls.map((url, index) => (
          <LazyMedia
            key={index}
            url={url}
            alt={`פריט גלריה ${index + 1}`}
            isVideo={isVideoUrl(url)}
            onClick={() => openModal(url)}
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
              />
            ) : (
              <img
                src={selectedMediaUrl}
                alt="תמונה מוגדלת"
                className="modal-media"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GalleryPage;
