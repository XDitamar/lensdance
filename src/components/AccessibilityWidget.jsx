import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from "react-i18next";


const DEFAULTS = {
  fontSize: 100,        // %
  letterSpacing: 0,     // px
  lineHeight: 0,        // 0 = default
  textAlign: '',        // '' | 'right' | 'center' | 'left'
  readableFont: false,
  highlightHeadings: false,
  highlightLinks: false,
  contrast: '',         // '' | 'dark' | 'light' | 'high'
  saturation: '',       // '' | 'high' | 'mono'
  hideImages: false,
  readingGuide: false,
  focusMask: false,
  stopAnimations: false,
  muteSounds: false,
  bigCursor: false,
  keyboardNav: false
};

/* Small inline stroke icons (site has no icon library) */
const ICON_PATHS = {
  alignRight: 'M20 6H8M20 12H4M20 18H10',
  alignCenter: 'M18 6H6M20 12H4M17 18H7',
  alignLeft: 'M16 6H4M20 12H4M14 18H4',
  font: 'M6 18L10.5 6L15 18M7.8 14h5.4M17 18v-7',
  heading: 'M6 6v12M18 6v12M6 12h12',
  link: 'M9 15l6-6M8.5 17.5a3 3 0 01-4.2-4.2L7 10.5M17 13.5l2.7-2.8a3 3 0 00-4.2-4.2',
  moon: 'M20 14A8 8 0 1110 4a6.5 6.5 0 0010 10z',
  sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4',
  contrast: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 3v18M12 3a9 9 0 010 18',
  droplet: 'M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z',
  mono: 'M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11zM4 4l16 16',
  photoOff: 'M4 7a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2zM4 15l4-4 3 3 5-5 4 4M3 3l18 18',
  ruler: 'M3 9h18v6H3zM7 9v3M11 9v3M15 9v3',
  viewfinder: 'M12 9a3 3 0 100 6 3 3 0 000-6zM4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3',
  stop: 'M7 7h10v10H7z',
  volumeOff: 'M11 5L7 9H4v6h3l4 4zM16 9l5 5M21 9l-5 5',
  pointer: 'M5 3l14 9.5-6 1.2 3.2 5.8-3 1.7-3.2-5.9L5 19z',
  keyboard: 'M3 7h18v10H3zM7 11h1M11 11h1M15 11h1M17 14h.5M7 14h7',
  refresh: 'M20 11A8 8 0 006.5 6.5L4 9M4 13a8 8 0 0013.5 4.5L20 15M4 5v4h4M20 19v-4h-4',
  x: 'M6 6l12 12M18 6L6 18'
};

const Icon = ({ name, size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={ICON_PATHS[name]} />
  </svg>
);

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('accessibility-settings') || '{}');
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

const AccessibilityWidget = () => {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState(loadSettings);
  const guideRef = useRef(null);
  const maskTopRef = useRef(null);
  const maskBottomRef = useRef(null);
  const panelRef = useRef(null);

  /* Apply class-based + inline effects */
  useEffect(() => {
    const root = document.documentElement;
    const b = document.body;

    root.style.fontSize = `${settings.fontSize}%`;
    b.style.letterSpacing = settings.letterSpacing ? `${settings.letterSpacing}px` : '';
    b.style.lineHeight = settings.lineHeight ? `${settings.lineHeight}` : '';

    const toggles = {
      'readable-font': settings.readableFont,
      'highlight-links': settings.highlightLinks,
      'acc-highlight-headings': settings.highlightHeadings,
      'acc-align-right': settings.textAlign === 'right',
      'acc-align-center': settings.textAlign === 'center',
      'acc-align-left': settings.textAlign === 'left',
      'acc-hide-images': settings.hideImages,
      'acc-stop-anim': settings.stopAnimations,
      'acc-big-cursor': settings.bigCursor,
      'acc-kbd-nav': settings.keyboardNav,
      'acc-invert-media': settings.contrast === 'dark'
    };
    Object.entries(toggles).forEach(([cls, on]) => b.classList.toggle(cls, on));

    localStorage.setItem('accessibility-settings', JSON.stringify(settings));
  }, [settings]);

  /* Mute / unmute media */
  useEffect(() => {
    const media = document.querySelectorAll('video, audio');
    media.forEach((m) => {
      if (settings.muteSounds) {
        if (!m.muted) m.dataset.accMuted = '1';
        m.muted = true;
      } else if (m.dataset.accMuted) {
        m.muted = false;
        delete m.dataset.accMuted;
      }
    });
  }, [settings.muteSounds]);

  /* Pause / resume videos when animations are stopped */
  useEffect(() => {
    const vids = document.querySelectorAll('video');
    vids.forEach((v) => {
      if (settings.stopAnimations) {
        if (!v.paused) v.dataset.accPaused = '1';
        v.pause();
      } else if (v.dataset.accPaused) {
        v.play().catch(() => {});
        delete v.dataset.accPaused;
      }
    });
  }, [settings.stopAnimations]);

  /* Reading guide + focus mask follow the mouse */
  useEffect(() => {
    if (!settings.readingGuide && !settings.focusMask) return;
    const onMove = (e) => {
      const y = e.clientY;
      if (guideRef.current) guideRef.current.style.top = `${y + 14}px`;
      if (maskTopRef.current) maskTopRef.current.style.height = `${Math.max(0, y - 55)}px`;
      if (maskBottomRef.current) {
        maskBottomRef.current.style.top = `${y + 55}px`;
        maskBottomRef.current.style.height = `${Math.max(0, window.innerHeight - y - 55)}px`;
      }
    };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, [settings.readingGuide, settings.focusMask]);

  /* Close panel on outside click */
  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target) &&
          !e.target.closest('.accessibility-widget')) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [isOpen]);

  const set = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }));
  const flip = (key) => setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  const setChoice = (key, value) =>
    setSettings((prev) => ({ ...prev, [key]: prev[key] === value ? '' : value }));
  const resetSettings = () => setSettings({ ...DEFAULTS });

  /* Screen filter (backdrop-filter overlay keeps fixed elements working) */
  const filters = [];
  if (settings.contrast === 'dark') filters.push('invert(1) hue-rotate(180deg)');
  if (settings.contrast === 'light') filters.push('brightness(1.2)');
  if (settings.contrast === 'high') filters.push('contrast(1.4)');
  if (settings.saturation === 'high') filters.push('saturate(1.8)');
  if (settings.saturation === 'mono') filters.push('grayscale(1)');

  const Tile = ({ active, onClick, icon, label }) => (
    <button
      type="button"
      className={`acc-tile ${active ? 'is-on' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );

  return (
    <>
      <button
        className="accessibility-widget"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t("a11y.open")}
        title={t("a11y.title")}
      >
        <span className="accessibility-widget-ring" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm7 9v-2c-1.54.02-3.09-.75-4.07-1.83l-1.29-1.43c-.17-.19-.38-.34-.61-.45-.01 0-.01-.01-.02-.01H13c-.35-.2-.75-.3-1.19-.26C10.76 5.11 10 6.04 10 7.09V12c0 1.1.9 2 2 2h5v7h2v-7.5c0-1.1-.9-2-2-2h-3v-3.45c1.29 1.07 3.25 1.94 5 1.95zm-6.17 5c-.41 1.16-1.52 2-2.83 2-1.66 0-3-1.34-3-3 0-1.31.84-2.41 2-2.83V12.1c-2.28.46-4 2.48-4 4.9 0 2.76 2.24 5 5 5 2.42 0 4.44-1.72 4.9-4h-2.07z"/>
          </svg>
        </span>
      </button>

      {filters.length > 0 && (
        <div className="acc-screen-filter" style={{ backdropFilter: filters.join(' '), WebkitBackdropFilter: filters.join(' ') }} aria-hidden="true" />
      )}
      {settings.readingGuide && <div ref={guideRef} className="acc-reading-guide" aria-hidden="true" />}
      {settings.focusMask && (
        <>
          <div ref={maskTopRef} className="acc-focus-mask acc-focus-mask-top" aria-hidden="true" />
          <div ref={maskBottomRef} className="acc-focus-mask acc-focus-mask-bottom" aria-hidden="true" />
        </>
      )}

      {isOpen && (
        <div className="accessibility-panel" dir={i18n.dir()} ref={panelRef} role="dialog" aria-label={t("a11y.panelTitle")}>
          <div className="accessibility-header">
            <h3>{t("a11y.panelTitle")}</h3>
            <button
              className="close-accessibility"
              onClick={() => setIsOpen(false)}
              aria-label={t("a11y.close")}
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          <div className="acc-section-title">{t("a11y.text")}</div>

          <div className="acc-slider-row">
            <label htmlFor="acc-font-size">{t("a11y.fontSize")}</label>
            <input
              id="acc-font-size"
              type="range" min="80" max="150" step="5"
              value={settings.fontSize}
              onChange={(e) => set('fontSize', Number(e.target.value))}
            />
            <span className="acc-slider-value">{settings.fontSize}%</span>
          </div>

          <div className="acc-slider-row">
            <label htmlFor="acc-letter-spacing">{t("a11y.letterSpacing")}</label>
            <input
              id="acc-letter-spacing"
              type="range" min="0" max="4" step="0.5"
              value={settings.letterSpacing}
              onChange={(e) => set('letterSpacing', Number(e.target.value))}
            />
            <span className="acc-slider-value">{settings.letterSpacing ? `${settings.letterSpacing}px` : t("a11y.default")}</span>
          </div>

          <div className="acc-slider-row">
            <label htmlFor="acc-line-height">{t("a11y.lineHeight")}</label>
            <input
              id="acc-line-height"
              type="range" min="0" max="2.6" step="0.2"
              value={settings.lineHeight}
              onChange={(e) => {
                const v = Number(e.target.value);
                set('lineHeight', v < 1.2 ? 0 : v);
              }}
            />
            <span className="acc-slider-value">{settings.lineHeight ? settings.lineHeight.toFixed(1) : t("a11y.default")}</span>
          </div>

          <div className="acc-tile-grid acc-tile-grid-3">
            <Tile active={settings.textAlign === 'right'} onClick={() => setChoice('textAlign', 'right')} icon="alignRight" label={t("a11y.alignRight")} />
            <Tile active={settings.textAlign === 'center'} onClick={() => setChoice('textAlign', 'center')} icon="alignCenter" label={t("a11y.alignCenter")} />
            <Tile active={settings.textAlign === 'left'} onClick={() => setChoice('textAlign', 'left')} icon="alignLeft" label={t("a11y.alignLeft")} />
          </div>

          <div className="acc-section-title">{t("a11y.display")}</div>
          <div className="acc-tile-grid acc-tile-grid-3">
            <Tile active={settings.readableFont} onClick={() => flip('readableFont')} icon="font" label={t("a11y.readableFont")} />
            <Tile active={settings.highlightHeadings} onClick={() => flip('highlightHeadings')} icon="heading" label={t("a11y.highlightHeadings")} />
            <Tile active={settings.highlightLinks} onClick={() => flip('highlightLinks')} icon="link" label={t("a11y.highlightLinks")} />
            <Tile active={settings.contrast === 'dark'} onClick={() => setChoice('contrast', 'dark')} icon="moon" label={t("a11y.contrastDark")} />
            <Tile active={settings.contrast === 'light'} onClick={() => setChoice('contrast', 'light')} icon="sun" label={t("a11y.contrastLight")} />
            <Tile active={settings.contrast === 'high'} onClick={() => setChoice('contrast', 'high')} icon="contrast" label={t("a11y.contrastHigh")} />
            <Tile active={settings.saturation === 'high'} onClick={() => setChoice('saturation', 'high')} icon="droplet" label={t("a11y.saturationHigh")} />
            <Tile active={settings.saturation === 'mono'} onClick={() => setChoice('saturation', 'mono')} icon="mono" label={t("a11y.monochrome")} />
            <Tile active={settings.hideImages} onClick={() => flip('hideImages')} icon="photoOff" label={t("a11y.hideImages")} />
          </div>

          <div className="acc-section-title">{t("a11y.behaviour")}</div>
          <div className="acc-tile-grid acc-tile-grid-3">
            <Tile active={settings.readingGuide} onClick={() => flip('readingGuide')} icon="ruler" label={t("a11y.readingGuide")} />
            <Tile active={settings.focusMask} onClick={() => flip('focusMask')} icon="viewfinder" label={t("a11y.focusMask")} />
            <Tile active={settings.stopAnimations} onClick={() => flip('stopAnimations')} icon="stop" label={t("a11y.stopAnimations")} />
            <Tile active={settings.muteSounds} onClick={() => flip('muteSounds')} icon="volumeOff" label={t("a11y.muteSounds")} />
            <Tile active={settings.bigCursor} onClick={() => flip('bigCursor')} icon="pointer" label={t("a11y.bigCursor")} />
            <Tile active={settings.keyboardNav} onClick={() => flip('keyboardNav')} icon="keyboard" label={t("a11y.keyboardNav")} />
          </div>

          <div className="acc-footer">
            <button className="acc-reset-btn" onClick={resetSettings}>
              <Icon name="refresh" size={15} />
              {t("a11y.reset")}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AccessibilityWidget;
