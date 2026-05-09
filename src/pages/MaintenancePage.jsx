import React from 'react';

// כאן אנחנו מייבאים את התמונות מהתיקייה המקומית
import mobileImage from '../images/mob.jpeg';
import desktopImage from '../images/comp.jpeg';

const MaintenancePage = () => {
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
    </div>
  );
};

export default MaintenancePage;