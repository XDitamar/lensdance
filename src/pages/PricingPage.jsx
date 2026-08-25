// src/pages/PricingPage.jsx
//
// The full pricing page. It reads the same useGeoPrice data the home page
// summarises, so the two can never disagree — previously this page listed a
// separate set of generic services (event / portrait / product photography)
// starting at 1,500 ₪ while the home page offered competition packages from
// 60 ₪, which read as two different businesses.
//
// Amounts and currency come from src/config/pricing.js, wording from
// src/locales/*.json. Nothing here is hardcoded.

import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useGeoPrice } from "../hooks/useGeoPrice";
import QuoteRequestModal from "../components/QuoteRequestModal";
import { bookingPath, sessionById } from "../lib/sessions";
import { isRtlLang } from "../i18n";
import "./pricing-page.css";

export default function PricingPage() {
  const { t, i18n } = useTranslation();
  const { prices: p } = useGeoPrice();
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [group, setGroup] = useState("competition");

  const active = p.groups.find((g) => g.id === group) || p.groups[0];

  return (
    <div className="pp-root" dir={isRtlLang(i18n.language) ? "rtl" : "ltr"}>
      <div className="pp-head">
        <h1 className="pp-title">{t("pricing.pageTitle")}</h1>
        <div className="pp-rule" />
        <p className="pp-sub">{t("pricing.subtitle")}</p>
      </div>

      {/* The visitor chooses the kind of work before any price is shown.
          TO REVERT: delete this block and map over
          [p.perEntry, p.videoPackage, p.shortVideo, p.custom] below. */}
      <div className="pp-tabs" role="tablist">
        {p.groups.map((g) => (
          <button
            key={g.id}
            role="tab"
            aria-selected={group === g.id}
            className={`pp-tab${group === g.id ? " is-active" : ""}`}
            onClick={() => setGroup(g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>
      <p className="pp-tab-hint">{active.hint}</p>

      <div className="pp-grid">
        {active.cardKeys.map((key) => {
          const card = p[key];
          // The custom package has no price to print — it opens the enquiry
          // form instead.
          const isCustom = key === "custom";
          // Personal sessions are booked directly: each has its own page at
          // /book/<slug>. Competition packages are not — those go through the
          // one sign-up form for the whole event.
          const session = sessionById(key);
          return (
            <div className="pp-card" key={key}>
              <h3>{card.title}</h3>
              <p className="pp-card-sub">{card.sub}</p>

              {Array.isArray(card.includes) && card.includes.length > 0 && (
                <>
                  <div className="pp-includes-title">{p.includesTitle}</div>
                  <ul className="pp-includes">
                    {card.includes.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </>
              )}

              <div className="pp-card-foot">
                {isCustom ? (
                  <button
                    type="button"
                    className="pp-quote-btn"
                    onClick={() => setQuoteOpen(true)}
                  >
                    {t("quote.cta")}
                  </button>
                ) : (
                  <div className="pp-price">{card.from}</div>
                )}
                <div className="pp-deposit">{p.deposit}</div>
                {session && (
                  <Link to={bookingPath(session.id)} className="pp-card-book">
                    {t("pricing.book")}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Priority only applies to competition work — there is nothing to rush
          out of a session that was booked for a chosen date. */}
      {group === "competition" && (
      <>
      <span className="pp-section-label">{p.priority.addon}</span>

      <div className="pp-priority">
        <div className="pp-priority-main">
          <span className="pp-priority-title">{p.priority.title}</span>
          <span className="pp-priority-price">{p.priority.label}</span>
        </div>
        <p className="pp-priority-sub">{p.priority.sub}</p>
        <span className="pp-priority-slots">{p.priority.slots}</span>
      </div>
      </>
      )}

      <div className="pp-foot">
        {/* /register is the competition sign-up, so it only belongs under the
            competition tab. Personal sessions are booked from their own cards
            above — a single button here could not know which one you meant. */}
        {group === "competition" && (
          <Link to="/register" className="pp-book">{t("pricing.book")}</Link>
        )}
        <p className="pp-foot-note">{t("pricing.footerNote")}</p>
        {/* The FAQ hangs off the pricing block rather than the nav: the
            questions it answers — deposit, delivery, what to wear, travel —
            are the ones that come up while somebody is looking at a price. */}
        <Link to="/faq" className="pp-faq-link">{t("pricing.faqLink")}</Link>
      </div>

      <QuoteRequestModal open={quoteOpen} onClose={() => setQuoteOpen(false)} />
    </div>
  );
}
