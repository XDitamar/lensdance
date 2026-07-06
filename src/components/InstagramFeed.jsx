import React, { useState, useEffect } from 'react';

const InstagramFeed = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error] = useState(false);

  // Real Instagram posts come from /api/instagram (serverless proxy — needs
  // INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_FEED_URL set in Vercel). A direct feed
  // URL (e.g. Behold.so) can override it via REACT_APP_INSTAGRAM_FEED_URL.
  // Until one is configured we fall back to the sample images below so the
  // section never renders empty.
  const FEED_URL = process.env.REACT_APP_INSTAGRAM_FEED_URL || "/api/instagram";

  const fallbackPosts = [
    { id: '1', media_url: '/pics/pic1.webp', permalink: 'https://instagram.com/lens.dance', caption: 'צילומי סוסים מרהיבים בתחרות השבוע' },
    { id: '2', media_url: '/pics/pic2.webp', permalink: 'https://instagram.com/lens.dance', caption: 'רגעים קסומים עם הסוסים שלנו' },
    { id: '3', media_url: '/pics/pic3.webp', permalink: 'https://instagram.com/lens.dance', caption: 'קפיצות ראווה מדהימות' },
    { id: '4', media_url: '/pics/pic1.webp', permalink: 'https://instagram.com/lens.dance', caption: 'צילומי דרסאז׳ מקצועיים' },
    { id: '5', media_url: '/pics/pic2.webp', permalink: 'https://instagram.com/lens.dance', caption: 'הקשר המיוחד בין רוכב לסוס' },
    { id: '6', media_url: '/pics/pic3.webp', permalink: 'https://instagram.com/lens.dance', caption: 'רגעי זהב בעולם הרכיבה' },
    { id: '7', media_url: '/pics/pic1.webp', permalink: 'https://instagram.com/lens.dance', caption: 'אור של בוקר על המגרש' },
    { id: '8', media_url: '/pics/pic2.webp', permalink: 'https://instagram.com/lens.dance', caption: 'עוד רגע בלתי נשכח' },
  ];

  useEffect(() => {
    let cancelled = false;

    // Normalizes the different feed shapes (Behold, Instagram Graph API, plain
    // array) into { id, media_url, permalink, caption }.
    const normalize = (json) => {
      const arr = Array.isArray(json)
        ? json
        : Array.isArray(json?.posts)
        ? json.posts
        : Array.isArray(json?.data)
        ? json.data
        : [];
      return arr
        .map((p, i) => ({
          id: p.id || p.permalink || String(i),
          media_url:
            p.media_url ||
            p.mediaUrl ||
            p.thumbnailUrl ||
            p.thumbnail_url ||
            p?.sizes?.medium?.mediaUrl ||
            p?.sizes?.full?.mediaUrl ||
            (Array.isArray(p.images) ? p.images[0] : undefined),
          permalink: p.permalink || p.link || 'https://instagram.com/lens.dance',
          caption: p.caption || p.text || '',
        }))
        .filter((p) => p.media_url);
    };

    const load = async () => {
      if (!FEED_URL) {
        setPosts(fallbackPosts);
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(FEED_URL);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        const posts = normalize(json).slice(0, 8);
        if (cancelled) return;
        setPosts(posts.length ? posts : fallbackPosts);
      } catch (e) {
        if (cancelled) return;
        console.warn('Instagram feed failed, using fallback:', e);
        setPosts(fallbackPosts);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const InstagramPost = ({ post, index }) => {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);

    const handleImageLoad = () => {
      setImageLoaded(true);
    };

    const handleImageError = () => {
      setImageError(true);
    };

    const handlePostClick = () => {
      window.open(post.permalink, '_blank', 'noopener,noreferrer');
    };

    return (
      <div 
        className="instagram-post"
        onClick={handlePostClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handlePostClick()}
      >
        {!imageLoaded && !imageError && (
          <div className="instagram-skeleton" />
        )}
        {imageError ? (
          <div className="instagram-error">
            <span>📷</span>
            <span>שגיאה בטעינה</span>
          </div>
        ) : (
          <img
            src={post.media_url}
            alt={post.caption || `Instagram post ${index + 1}`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={handleImageLoad}
            onError={handleImageError}
            style={{
              opacity: imageLoaded ? 1 : 0,
              transition: 'opacity 0.3s ease'
            }}
          />
        )}
        <div className="instagram-overlay">
          <div className="instagram-icon">📷</div>
        </div>
      </div>
    );
  };

  return (
    <div className="instagram-section">
      <div className="container">
        <h2 className="section-title">עוקבים אחרינו באינסטגרם</h2>
        <p>גלו עוד רגעים מרהיבים מעולם הצילום והרכיבה שלנו</p>
        
        {loading ? (
          <div className="instagram-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="instagram-post">
                <div className="instagram-skeleton" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="instagram-error-message">
            שגיאה בטעינת פוסטים מאינסטגרם
          </div>
        ) : (
          <>
            <div className="instagram-grid">
              {posts.map((post, index) => (
                <InstagramPost key={post.id} post={post} index={index} />
              ))}
            </div>
            
            <div className="instagram-follow-container">
              <a 
                href="https://instagram.com/lens.dance" 
                target="_blank" 
                rel="noopener noreferrer"
                className="instagram-follow-btn"
              >
                עקוב עכשיו @lens.dance
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default InstagramFeed;