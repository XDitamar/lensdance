import React, { useState, useEffect } from 'react';

const InstagramFeed = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Mock Instagram posts for demonstration
  // In production, replace with actual Instagram API or Behold widget
  const mockPosts = [
    {
      id: '1',
      media_url: '/pics/pic1.png',
      permalink: 'https://instagram.com/lens.dance',
      caption: 'צילומי סוסים מרהיבים בתחרות השבוע'
    },
    {
      id: '2', 
      media_url: '/pics/pic2.png',
      permalink: 'https://instagram.com/lens.dance',
      caption: 'רגעים קסומים עם הסוסים שלנו'
    },
    {
      id: '3',
      media_url: '/pics/pic3.png', 
      permalink: 'https://instagram.com/lens.dance',
      caption: 'קפיצות ראווה מדהימות'
    },
    {
      id: '4',
      media_url: '/pics/pic1.png',
      permalink: 'https://instagram.com/lens.dance',
      caption: 'צילומי דרסאז׳ מקצועיים'
    },
    {
      id: '5',
      media_url: '/pics/pic2.png',
      permalink: 'https://instagram.com/lens.dance', 
      caption: 'הקשר המיוחד בין רוכב לסוס'
    },
    {
      id: '6',
      media_url: '/pics/pic3.png',
      permalink: 'https://instagram.com/lens.dance',
      caption: 'רגעי זהב בעולם הרכיבה'
    }
  ];

  useEffect(() => {
    // Simulate API loading
    const timer = setTimeout(() => {
      setPosts(mockPosts);
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

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
            {Array.from({ length: 6 }).map((_, i) => (
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