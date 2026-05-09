import React from 'react';
import mobileImage from '../images/mob.jpeg';

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
      backgroundColor: '#000',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <img 
        src={mobileImage}
        alt="האתר בתחזוקה" 
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain'
        }}
      />
    </div>
  );
};

export default MaintenancePage;