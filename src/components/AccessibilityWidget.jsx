import React, { useState, useEffect } from 'react';

const AccessibilityWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState({
    fontSize: 100,
    contrast: 'normal',
    highlightLinks: false,
    readableFont: false
  });

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('accessibility-settings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, []);

  // Apply settings to document
  useEffect(() => {
    const root = document.documentElement;
    
    // Font size
    root.style.fontSize = `${settings.fontSize}%`;
    
    // High contrast
    if (settings.contrast === 'high') {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
    
    // Highlight links
    if (settings.highlightLinks) {
      document.body.classList.add('highlight-links');
    } else {
      document.body.classList.remove('highlight-links');
    }
    
    // Readable font
    if (settings.readableFont) {
      document.body.classList.add('readable-font');
    } else {
      document.body.classList.remove('readable-font');
    }
    
    // Save to localStorage
    localStorage.setItem('accessibility-settings', JSON.stringify(settings));
  }, [settings]);

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const resetSettings = () => {
    setSettings({
      fontSize: 100,
      contrast: 'normal',
      highlightLinks: false,
      readableFont: false
    });
  };

  return (
    <>
      <button 
        className="accessibility-widget"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="פתח תפריט נגישות"
        title="נגישות"
      >
        ♿
      </button>
      
      {isOpen && (
        <div className="accessibility-panel">
          <div className="accessibility-header">
            <h3>הגדרות נגישות</h3>
            <button 
              className="close-accessibility"
              onClick={() => setIsOpen(false)}
              aria-label="סגור תפריט נגישות"
            >
              ×
            </button>
          </div>
          
          <div className="accessibility-controls">
            <div className="control-group">
              <label>גודל טקסט:</label>
              <div className="font-size-controls">
                <button 
                  onClick={() => updateSetting('fontSize', Math.max(80, settings.fontSize - 10))}
                  disabled={settings.fontSize <= 80}
                >
                  A-
                </button>
                <span>{settings.fontSize}%</span>
                <button 
                  onClick={() => updateSetting('fontSize', Math.min(150, settings.fontSize + 10))}
                  disabled={settings.fontSize >= 150}
                >
                  A+
                </button>
              </div>
            </div>
            
            <div className="control-group">
              <label>
                <input
                  type="checkbox"
                  checked={settings.contrast === 'high'}
                  onChange={(e) => updateSetting('contrast', e.target.checked ? 'high' : 'normal')}
                />
                ניגודיות גבוהה
              </label>
            </div>
            
            <div className="control-group">
              <label>
                <input
                  type="checkbox"
                  checked={settings.highlightLinks}
                  onChange={(e) => updateSetting('highlightLinks', e.target.checked)}
                />
                הדגש קישורים
              </label>
            </div>
            
            <div className="control-group">
              <label>
                <input
                  type="checkbox"
                  checked={settings.readableFont}
                  onChange={(e) => updateSetting('readableFont', e.target.checked)}
                />
                גופן קריא
              </label>
            </div>
            
            <button className="reset-btn" onClick={resetSettings}>
              איפוס הגדרות
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AccessibilityWidget;