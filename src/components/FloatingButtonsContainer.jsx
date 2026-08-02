// ⚠️ UNUSED — App.js renders FloatingWhatsApp, FloatingTranslateButton and
// AccessibilityWidget directly, so .floating-buttons-container never exists in
// the DOM. Each of those three positions itself with `position: fixed`.
// Don't rely on this wrapper for layout; if you re-introduce it, remove the
// fixed positioning from the children first.
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