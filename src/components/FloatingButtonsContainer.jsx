import React from 'react';
import FloatingWhatsApp from './FloatingWhatsApp';
import FloatingTranslateButton from './FloatingTranslateButton';
import AccessibilityWidget from './AccessibilityWidget';

const FloatingButtonsContainer = () => {
  return (
    <div className="floating-buttons-container">
      <AccessibilityWidget />
      <FloatingTranslateButton />
      <FloatingWhatsApp />
    </div>
  );
};

export default FloatingButtonsContainer;