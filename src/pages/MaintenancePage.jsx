import React from 'react';

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
        {/* תמונה למסכים גדולים (מחשבים) - מרוחב 768 פיקסלים ומעלה */}
        <source media="(min-width: 768px)" srcSet="/images/2.jpeg" />
        
        {/* תמונת ברירת המחדל למסכים קטנים (טלפונים) */}
        <img 
          src="/images/1.jpeg" 
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