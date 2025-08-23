import React, { useMemo, useState, useEffect, useRef } from "react";

// Map app locale → Google locale (Hebrew = 'iw' for Google)
const TO_GOOGLE = { en: "en", he: "iw", ru: "ru", ar: "ar" };
const LABELS = { en: "English", he: "עברית", ru: "Русский", ar: "العربية" };
const ORDER = ["en", "he", "ru", "ar"];

function getCurrentLang() {
  // read googtrans cookie → /en/<target>
  const m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
  const raw = m ? decodeURIComponent(m[1]) : "/en/en";
  const tgt = (raw.split("/")[2] || "en").toLowerCase();
  return tgt === "iw" ? "he" : tgt;
}

function setGoogTransCookie(appLang) {
  const googleCode = TO_GOOGLE[appLang] || "en";
  const v = `/en/${googleCode}`;
  // write host+domain for reliability
  document.cookie = `googtrans=${v}; expires=Fri, 31 Dec 9999 23:59:59 GMT; path=/`;
  document.cookie = `googtrans=${v}; domain=${window.location.hostname}; expires=Fri, 31 Dec 9999 23:59:59 GMT; path=/`;
}

export default function FloatingTranslateButton() {
  const [open, setOpen] = useState(false);
  const current = useMemo(getCurrentLang, []);
  const popRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (open && popRef.current && !popRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const switchTo = (lang) => {
    setGoogTransCookie(lang);
    if (lang !== "en") sessionStorage.setItem("translated", "true");
    else sessionStorage.removeItem("translated");
    // reload = simplest way to apply translate across entire SPA
    window.location.reload();
  };

  return (
    <>
      {/* Floating action button */}
      <button
        className="translate-fab"
        aria-label="Change language"
        title="Translate"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        {/* globe icon (inline SVG) */}
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm7.93 9h-3.2a15.7 15.7 0 0 0-1.23-5.02A8.01 8.01 0 0 1 19.93 11ZM12 4c.97 0 2.59 2.19 3.22 6H8.78C9.41 6.19 11.03 4 12 4ZM6.5 11h-3.2A8.01 8.01 0 0 1 7.5 5.98C6.97 7.2 6.6 9 6.5 11Zm0 2c.1 2 .47 3.8 1 5.02A8.01 8.01 0 0 1 3.3 13h3.2Zm2.28 0h6.44c-.63 3.81-2.25 6-3.22 6s-2.59-2.19-3.22-6ZM16.77 18.02c.53-1.22.9-3.02 1-5.02h3.2a8.01 8.01 0 0 1-4.2 6.02Z" />
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <div className="translate-popover" ref={popRef} role="dialog" aria-label="Language menu">
          <div className="translate-popover-title">Translate</div>
          <ul className="translate-list">
            {ORDER.map((lang) => (
              <li key={lang}>
                <button
                  type="button"
                  className={`translate-item ${current === lang ? "is-active" : ""}`}
                  onClick={() => switchTo(lang)}
                >
                  <span className="translate-item-label">{LABELS[lang]}</span>
                  {current === lang && <span className="translate-check" aria-hidden>✓</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
