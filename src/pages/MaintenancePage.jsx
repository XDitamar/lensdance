import React, { useState, useEffect } from 'react';

// כאן אנחנו מייבאים את התמונות מהתיקייה המקומית
import mobileImage from '../images/mob.jpeg';
import desktopImage from '../images/comp.jpeg';

const MaintenancePage = () => {
  const [imagesLoaded, setImagesLoaded] = useState(false);
  
  // Pre-load images to ensure they're available
  useEffect(() => {
    const preloadImages = async () => {
      try {
        const mobileImg = new Image();
        const desktopImg = new Image();
        
        mobileImg.src = mobileImage;
        desktopImg.src = desktopImage;
        
        await Promise.all([
          new Promise(resolve => { mobileImg.onload = resolve; }),
          new Promise(resolve => { desktopImg.onload = resolve; })
        ]);
        
        setImagesLoaded(true);
      } catch (error) {
        console.error('Failed to preload images:', error);
        // Show images anyway even if preloading fails
        setImagesLoaded(true);
      }
    };
    
    preloadImages();
  }, []);
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      margin: 0,
      padding: 0,
      overflow: 'hidden',
      backgroundColor: '#000'
    }}>
      {!imagesLoaded ? (
        // Loading state
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          color: 'white',
          fontSize: '24px',
          fontFamily: 'Arial, sans-serif'
        }}>
          טוען...
        </div>
      ) : (
        <picture>
          {/* תמונה למסכים גדולים */}
          <source media="(min-width: 768px)" srcSet={desktopImage} />
          
          {/* תמונת ברירת המחדל (טלפונים) */}
          <img 
            src={mobileImage} 
            alt="האתר בתחזוקה" 
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              display: 'block'
            }}
          />
        </picture>
      )}
    </div>
  );
};

export default MaintenancePage;