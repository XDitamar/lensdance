// src/components/AdminCountryButton.jsx
//
// Admin-only floating button, sitting on the left edge directly below the
// WhatsApp button. Forces the site to behave as if the visitor were browsing
// from another country, so prices and currency can be checked without a VPN.
//
// It overrides the IP lookup in src/hooks/useGeoPrice.js only — the language
// is a separate axis (browser language, see src/lib/lang.js), so switching to
// Germany shows € prices in whatever language the admin is already reading.
//
// The override is stored in localStorage and survives reloads on purpose:
// forgetting it is set would be confusing, so the button stays highlighted and
// shows the forced country while it is active.

import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import useIsAdmin from "../hooks/useIsAdmin";
import { TEST_COUNTRIES, setNameFor } from "../config/pricing";
import { getCountryOverride, setCountryOverride, useGeoPrice } from "../hooks/useGeoPrice";

export default function AdminCountryButton() {
  const isAdmin = useIsAdmin();
  const { t } = useTranslation();
  const { country, priceSet } = useGeoPrice();
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState(getCountryOverride);
  const popRef = useRef(null);

  // The floating stack is positioned in CSS from the bottom up. This class on
  // <html> shifts the other two buttons upwards to make room for this one,
  // so it only affects the layout while an admin is signed in.
  useEffect(() => {
    const cls = "has-admin-geo-fab";
    document.documentElement.classList.toggle(cls, isAdmin);
    return () => document.documentElement.classList.remove(cls);
  }, [isAdmin]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!isAdmin) return null;

  const choose = (code) => {
    setCountryOverride(code); // null clears it and returns to IP detection
    setOverride(code || null);
    setOpen(false);
  };

  const label = override
    ? t("admin.geo.active", { country: override })
    : t("admin.geo.title");

  return (
    <>
      <button
        type="button"
        className={`admin-geo-fab${override ? " is-forced" : ""}`}
        aria-label={t("admin.geo.button")}
        title={`${t("admin.geo.button")} — ${label}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="admin-geo-fab-ring" aria-hidden="true">
          {override ? (
            // Show the forced country code itself — unmissable while testing.
            <span className="admin-geo-fab-code notranslate">{override}</span>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
            </svg>
          )}
        </span>
      </button>

      {open && (
        <div
          className="admin-geo-popover notranslate"
          ref={popRef}
          role="dialog"
          aria-label={t("admin.geo.title")}
        >
          <div className="admin-geo-popover-title">{t("admin.geo.title")}</div>

          <ul className="admin-geo-list">
            <li>
              <button
                type="button"
                className={`admin-geo-item${override ? "" : " is-active"}`}
                onClick={() => choose(null)}
              >
                <span>{t("admin.geo.auto")}</span>
                {!override && <span aria-hidden>✓</span>}
              </button>
            </li>

            {TEST_COUNTRIES.map((c) => {
              const active = override === c.code;
              return (
                <li key={c.code}>
                  <button
                    type="button"
                    className={`admin-geo-item${active ? " is-active" : ""}`}
                    onClick={() => choose(c.code)}
                  >
                    <span>{c.label}</span>
                    {/* Which price set this country lands on, so a wrong
                        mapping in COUNTRY_SETS is visible at a glance. */}
                    <span className="admin-geo-set">{setNameFor(c.code)}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="admin-geo-hint">
            {t("admin.geo.hint")}
            <br />
            <strong className="notranslate">
              {country || "—"} → {priceSet}
            </strong>
          </div>
        </div>
      )}
    </>
  );
}
