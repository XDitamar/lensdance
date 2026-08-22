// src/pages/FaqPage.jsx
//
// The questions riders actually ask before booking. Reached only from the
// pricing block — on /pricing and in the pricing section of the home page —
// because that is where the questions come up: someone reading a price is
// deciding, and this is what they need in order to decide.
//
// The content lives in src/locales/*.json under "faq.items" (an array of
// { q, a }), so adding a question means adding it to all four locale files.
// Answers may contain simple HTML — <strong>, <br />, <a> — because several of
// them link to the sign-up form or the personal gallery.
//
// IMPORTANT: nothing here may contradict "competition.terms", which is the
// binding agreement. Delivery times, the deposit, the cancellation window and
// the usage rules are all restated from it rather than invented. If the terms
// change, these answers change with them.

import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { isRtlLang } from "../i18n";
import "./faq-page.css";

export default function FaqPage() {
  const { t, i18n } = useTranslation();
  // Nothing is open on arrival: the value of this page is being able to scan
  // the questions and find yours, not reading twelve answers top to bottom.
  const [open, setOpen] = useState(null);

  const items = t("faq.items", { returnObjects: true });
  const list = Array.isArray(items) ? items : [];

  return (
    <div className="faq-root" dir={isRtlLang(i18n.language) ? "rtl" : "ltr"}>
      <div className="faq-head">
        <span className="faq-eyebrow">{t("faq.eyebrow")}</span>
        <h1 className="faq-title">{t("faq.title")}</h1>
        <div className="faq-rule" />
        <p className="faq-sub">{t("faq.subtitle")}</p>
      </div>

      <ul className="faq-list">
        {list.map((item, i) => {
          const isOpen = open === i;
          return (
            <li key={item.q} className={`faq-item${isOpen ? " is-open" : ""}`}>
              <button
                type="button"
                className="faq-q"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                <span className="faq-q-text">{item.q}</span>
                <span className="faq-q-mark" aria-hidden>
                  {isOpen ? "−" : "+"}
                </span>
              </button>
              {isOpen && (
                <div
                  className="faq-a"
                  dangerouslySetInnerHTML={{ __html: item.a }}
                />
              )}
            </li>
          );
        })}
      </ul>

      <div className="faq-foot">
        <p className="faq-foot-note">{t("faq.stillStuck")}</p>
        <div className="faq-foot-links">
          <Link to="/pricing" className="faq-foot-link">
            {t("faq.backToPricing")}
          </Link>
          <Link to="/register" className="faq-book">
            {t("pricing.book")}
          </Link>
        </div>
      </div>
    </div>
  );
}
