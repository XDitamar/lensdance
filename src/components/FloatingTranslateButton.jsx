import React, { useMemo, useState, useEffect, useRef } from "react";
import icon from "../translate.png"; // ✅ import your custom icon

// Map app locale → Google locale (Hebrew = 'iw' for Google)
const TO_GOOGLE = { en: "en", he: "iw", ru: "ru", ar: "ar" };
const LABELS = { en: "English", he: "עברית", ru: "Русский", ar: "العربية" };
const ORDER = ["en", "he", "ru", "ar"];

function getCurrentLang() {
  const m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
  const raw = m ? decodeURIComponent(m[1]) : "/en/en";
  const tgt = (raw.split("/")[2] || "en").toLowerCase();
  return tgt === "iw" ? "he" : tgt;
}

function setGoogTransCookie(appLang) {
  const googleCode = TO_GOOGLE[appLang] || "en";
  const v = `/en/${googleCode}`;
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
    window.location.reload();
  };

  return (
    <>
      {/* Floating action button with your icon */}
      <button
        className="translate-fab"
        aria-label="Change language"
        title="Translate"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <img src={icon} alt="Translate" style={{ width: 22, height: 22 }} />
      </button>

      {/* Popover */}
      {open && (
        <div
          className="translate-popover"
          ref={popRef}
          role="dialog"
          aria-label="Language menu"
        >
          <div className="translate-popover-title">Translate</div>
          <ul className="translate-list">
            {ORDER.map((lang) => (
              <li key={lang}>
                <button
                  type="button"
                  className={`translate-item ${
                    current === lang ? "is-active" : ""
                  }`}
                  onClick={() => switchTo(lang)}
                >
                  <span className="translate-item-label">{LABELS[lang]}</span>
                  {current === lang && (
                    <span className="translate-check" aria-hidden>
                      ✓
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
