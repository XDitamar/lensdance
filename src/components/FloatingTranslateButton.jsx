// src/components/FloatingTranslateButton.jsx
//
// The visitor's manual language picker. Choosing a language here is sticky —
// it beats the browser-language auto-detection for good. All the cookie and
// i18next mechanics live in src/lib/lang.js; this file is only the menu.
import React, { useMemo, useState, useEffect, useRef } from "react";
import icon from "../translate.png"; // your custom icon at src/translate.png
import { findLanguage, searchLanguages } from "../lib/languages";
import { applyTarget, reloadForTranslation, resolveTarget } from "../lib/lang";

// The four pinned defaults, always shown at the top of the menu.
// Codes are Google's (Hebrew is "iw", not "he").
const PINNED = ["iw", "en", "ru", "ar"];

/* Case-insensitive comparison that treats he/iw as the same language. */
const sameLang = (a, b) => {
  const n = (x) => (String(x || "").toLowerCase() === "he" ? "iw" : String(x || "").toLowerCase());
  return n(a) === n(b);
};

export default function FloatingTranslateButton() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = useMemo(resolveTarget, []);
  const popRef = useRef(null);
  const searchRef = useRef(null);

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

  // Reset the search each time the menu closes, and close on Escape.
  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const pinned = useMemo(
    () => PINNED.map(findLanguage).filter(Boolean),
    []
  );
  const results = useMemo(() => searchLanguages(query), [query]);

  const switchTo = (googleCode) => {
    // Records the choice as manual (auto-detection stops overriding it),
    // flips the googtrans cookie, and tells us whether a reload is needed for
    // Google to re-render the page.
    const needsReload = applyTarget(googleCode, { manual: true });
    if (needsReload) reloadForTranslation();
    else window.location.reload(); // Hebrew ⇄ Hebrew: still re-render i18next
  };

  // One row in either list — kept identical to the original item styling.
  const LangItem = ({ lang }) => {
    const active = sameLang(current, lang.code);
    return (
      <li>
        <button
          type="button"
          onClick={() => switchTo(lang.code)}
          className={`translate-item ${active ? "is-active" : ""}`}
          style={{
            width: "100%",
            textAlign: "left",
            background: active ? "#f2efe9" : "transparent",
            border: "none",
            padding: "8px 10px",
            borderRadius: 8,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            fontSize: ".95rem",
            color: "#333",
            fontWeight: active ? 700 : 400,
          }}
        >
          <span
            className="translate-item-label"
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {lang.native}
          </span>
          {active && <span className="translate-check" aria-hidden>✓</span>}
        </button>
      </li>
    );
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
          /* notranslate: language names must stay in their own script — we
             don't want Google rewriting "Русский" into the active language. */
          className="translate-popover notranslate"
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
          {/* The four defaults, always visible */}
          <ul className="translate-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {pinned.map((lang) => (
              <LangItem key={lang.code} lang={lang} />
            ))}
          </ul>

          {/* Search — for anyone whose language isn't one of the four above */}
          <div style={{ borderTop: "1px solid #eee", margin: "8px 0 0", paddingTop: 8 }}>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search language…"
              aria-label="Search language"
              className="translate-search notranslate"
              dir="ltr"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 10px",
                border: "1px solid #e6e6e6",
                borderRadius: 8,
                fontSize: ".9rem",
                color: "#333",
                outline: "none",
                background: "#fafafa",
              }}
            />
          </div>

          {/* Results appear only while typing, so the menu keeps its usual size */}
          {query.trim() !== "" && (
            <ul
              className="translate-list translate-results"
              style={{
                listStyle: "none",
                margin: "6px 0 0",
                padding: 0,
                maxHeight: 220,
                overflowY: "auto",
              }}
            >
              {results.length > 0 ? (
                results.map((lang) => <LangItem key={lang.code} lang={lang} />)
              ) : (
                <li
                  style={{
                    padding: "8px 10px",
                    fontSize: ".85rem",
                    color: "#999",
                    textAlign: "center",
                  }}
                >
                  No matches
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
