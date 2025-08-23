// src/components/FloatingTranslateButton.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import icon from "../translate.png"; // your custom icon at src/translate.png

// Map app locale → Google locale (Hebrew is "iw" for Google)
const TO_GOOGLE = { en: "en", he: "iw", ru: "ru", ar: "ar" };
const LABELS = { en: "English", he: "עברית", ru: "Русский", ar: "العربية" };
const ORDER = ["en", "he", "ru", "ar"];

/* Read current from cookie (handles 'iw'→'he') */
function getCurrentLang() {
  const m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
  const raw = m ? decodeURIComponent(m[1]) : "/en/en";
  const tgt = (raw.split("/")[2] || "en").toLowerCase();
  return tgt === "iw" ? "he" : tgt;
}

/* Clear ALL plausible googtrans cookies (host + dot-domain, common values) */
function clearGoogTransCookies() {
  const host = window.location.hostname;
  const dotHost = host.startsWith(".") ? host : "." + host;
  const expire = "Thu, 01 Jan 1970 00:00:00 GMT";
  const values = ["/en/en", "/auto/en"]; // typical reset variants

  // clear generic
  document.cookie = `googtrans=; expires=${expire}; path=/`;
  document.cookie = `googtrans=; domain=${host}; expires=${expire}; path=/`;
  document.cookie = `googtrans=; domain=${dotHost}; expires=${expire}; path=/`;

  // belt & suspenders: clear with explicit values too
  for (const v of values) {
    document.cookie = `googtrans=${v}; expires=${expire}; path=/`;
    document.cookie = `googtrans=${v}; domain=${host}; expires=${expire}; path=/`;
    document.cookie = `googtrans=${v}; domain=${dotHost}; expires=${expire}; path=/`;
  }
}

/* Set BOTH variants Google respects, on host & dot-domain */
function setGoogTransCookie(targetGoogleCode) {
  const host = window.location.hostname;
  const dotHost = host.startsWith(".") ? host : "." + host;
  const forever = "Fri, 31 Dec 9999 23:59:59 GMT";
  const variants = [`/en/${targetGoogleCode}`, `/auto/${targetGoogleCode}`];

  for (const v of variants) {
    document.cookie = `googtrans=${v}; expires=${forever}; path=/`;
    document.cookie = `googtrans=${v}; domain=${host}; expires=${forever}; path=/`;
    document.cookie = `googtrans=${v}; domain=${dotHost}; expires=${forever}; path=/`;
  }
}

export default function FloatingTranslateButton() {
  const [open, setOpen] = useState(false);
  const current = useMemo(getCurrentLang, []);
  const popRef = useRef(null);

  // Close popover on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (open && popRef.current && !popRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const switchTo = (appLang) => {
    const googleCode = TO_GOOGLE[appLang] || "en";
    // 1) clear old cookies
    clearGoogTransCookies();
    // 2) set new cookies
    setGoogTransCookie(googleCode);
    // 3) manage session flag (optional)
    if (appLang !== "en") sessionStorage.setItem("translated", "true");
    else sessionStorage.removeItem("translated");
    // 4) reload to apply
    window.location.assign(window.location.pathname + window.location.search);
  };

  return (
    <>
      {/* Floating icon-only button (no circle) */}
      <button
        className="translate-fab"
        aria-label="Change language"
        title="Translate"
        onClick={() => setOpen((v) => !v)}
        type="button"
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          zIndex: 1200
        }}
      >
        <img
          src={icon}
          alt="Translate"
          style={{ width: 36, height: 36, display: "block" }}
        />
      </button>

      {/* Popover */}
      {open && (
        <div
          className="translate-popover"
          ref={popRef}
          role="dialog"
          aria-label="Language menu"
          style={{
            position: "fixed",
            right: 18,
            bottom: 66,
            background: "#fff",
            border: "1px solid #e6e6e6",
            borderRadius: 12,
            boxShadow: "0 12px 36px rgba(0,0,0,.16)",
            width: 220,
            padding: 10,
            zIndex: 1200
          }}
        >
          <div
            className="translate-popover-title"
            style={{ fontWeight: 700, color: "var(--brown-700)", margin: "2px 6px 8px" }}
          >
            Translate
          </div>
          <ul className="translate-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {ORDER.map((lang) => (
              <li key={lang}>
                <button
                  type="button"
                  onClick={() => switchTo(lang)}
                  className={`translate-item ${current === lang ? "is-active" : ""}`}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: current === lang ? "#f2efe9" : "transparent",
                    border: "none",
                    padding: "8px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: ".95rem",
                    color: "#333",
                    fontWeight: current === lang ? 700 : 400
                  }}
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
