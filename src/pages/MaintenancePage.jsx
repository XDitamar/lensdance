import React from 'react';

const MaintenancePage = () => {
  // Using a direct Imgur URL for the maintenance image
  const maintenanceImageUrl = 'https://i.imgur.com/Yd1JKQM.jpeg';
  
  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        backgroundColor: '#000'
      }}
    >
      <img 
        src={maintenanceImageUrl}
        alt="האתר בתחזוקה" 
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          display: 'block'
        }}
        onError={(e) => {
          // If image fails to load, show a simple text message
          const element = e.target;
          element.style.display = 'none';
          
          const fallbackDiv = document.createElement('div');
          fallbackDiv.style.width = '100%';
          fallbackDiv.style.height = '100%';
          fallbackDiv.style.display = 'flex';
          fallbackDiv.style.flexDirection = 'column';
          fallbackDiv.style.justifyContent = 'center';
          fallbackDiv.style.alignItems = 'center';
          fallbackDiv.style.color = 'white';
          fallbackDiv.style.fontFamily = 'Arial, sans-serif';
          fallbackDiv.style.textAlign = 'center';
          fallbackDiv.style.padding = '20px';
          
          const heading = document.createElement('h1');
          heading.style.fontSize = '32px';
          heading.style.marginBottom = '20px';
          heading.textContent = 'האתר בתחזוקה';
          
          const paragraph1 = document.createElement('p');
          paragraph1.style.fontSize = '18px';
          paragraph1.textContent = 'אנו עובדים על שיפור האתר כדי להעניק לכם חוויה טובה יותר.';
          
          const paragraph2 = document.createElement('p');
          paragraph2.style.fontSize = '18px';
          paragraph2.style.marginTop = '10px';
          paragraph2.textContent = 'נחזור בקרוב!';
          
          fallbackDiv.appendChild(heading);
          fallbackDiv.appendChild(paragraph1);
          fallbackDiv.appendChild(paragraph2);
          
          element.parentNode.appendChild(fallbackDiv);
        }}
      />
    </div>
  );
};

export default MaintenancePage;