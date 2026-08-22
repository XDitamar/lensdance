// src/components/QuoteRequestModal.jsx
//
// The "custom package" enquiry form. Replaces the old dead-end "By
// consultation" label on the pricing card with something a visitor can act on.
//
// HOW IT SENDS. There is no mail server behind this site, so the form composes
// a WhatsApp message and opens wa.me with it pre-filled. The visitor still taps
// send inside WhatsApp — nothing is sent on their behalf, and Alina gets the
// enquiry in the same inbox as the floating WhatsApp button. The upside over a
// mailto: form is that she can reply from her phone in one tap; the trade-off
// is that the visitor needs WhatsApp, which for this audience is a safe bet.
//
// FIELDS. Only name and location are required — without them she cannot quote.
// There is deliberately no phone field: the enquiry arrives over WhatsApp, so
// she already has the sender's number and asking for it again is friction for
// nothing. Instagram is offered as an optional extra because plenty of riders
// would rather be reached there. Date and type are useful but a rider browsing
// on a phone should not be blocked by them.

import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getWhatsAppInternational } from "../config/contact";

const EMPTY = { name: "", contact: "", location: "", date: "", type: "", details: "" };

export default function QuoteRequestModal({ open, onClose }) {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Close on Escape, lock the page behind the dialog, and put the cursor in
  // the first field so a keyboard user can start typing immediately.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstFieldRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  // Start clean each time it opens, so a half-filled abandoned form doesn't
  // reappear later looking like it was already submitted.
  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setError("");
    }
  }, [open]);

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.location.trim()) {
      setError(t("quote.required"));
      return;
    }

    const line = (label, value) => (value.trim() ? `${label}: ${value.trim()}\n` : "");
    const message =
      `${t("quote.msgHeader")}\n\n` +
      line(t("quote.msgName"), form.name) +
      line(t("quote.msgContact"), form.contact) +
      line(t("quote.msgLocation"), form.location) +
      line(t("quote.msgDate"), form.date) +
      line(t("quote.msgType"), form.type) +
      line(t("quote.msgDetails"), form.details);

    window.open(
      `https://wa.me/${getWhatsAppInternational()}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener"
    );
    onClose();
  };

  const types = [
    t("quote.typeCompetition"),
    t("quote.typePortrait"),
    t("quote.typeEvent"),
    t("quote.typeOther"),
  ];

  return (
    <div
      className="quote-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        className="quote-modal"
        ref={dialogRef}
        dir={i18n.dir()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-title"
      >
        <button className="quote-close" onClick={onClose} aria-label={t("common.close")}>
          ×
        </button>

        <h2 id="quote-title" className="quote-title">{t("quote.title")}</h2>
        <p className="quote-intro">{t("quote.intro")}</p>

        <form onSubmit={submit} noValidate>
          <label className="quote-label">
            {t("quote.name")}
            <input
              ref={firstFieldRef}
              className="quote-input"
              value={form.name}
              onChange={set("name")}
              placeholder={t("quote.namePlaceholder")}
              autoComplete="name"
            />
          </label>

          <label className="quote-label">
            {t("quote.location")}
            <input
              className="quote-input"
              value={form.location}
              onChange={set("location")}
              placeholder={t("quote.locationPlaceholder")}
            />
          </label>

          {/* Optional: the WhatsApp message already carries their number. */}
          <label className="quote-label">
            {t("quote.contact")}
            <input
              className="quote-input"
              value={form.contact}
              onChange={set("contact")}
              placeholder={t("quote.contactPlaceholder")}
            />
          </label>

          <div className="quote-row">
            <label className="quote-label">
              {t("quote.date")}
              <input
                className="quote-input"
                value={form.date}
                onChange={set("date")}
                placeholder={t("quote.datePlaceholder")}
              />
            </label>

            <label className="quote-label">
              {t("quote.type")}
              <select className="quote-input" value={form.type} onChange={set("type")}>
                <option value="">—</option>
                {types.map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="quote-label">
            {t("quote.details")}
            <textarea
              className="quote-input quote-textarea"
              value={form.details}
              onChange={set("details")}
              placeholder={t("quote.detailsPlaceholder")}
              rows={3}
            />
          </label>

          {error && <div className="quote-error">{error}</div>}

          <p className="quote-note">{t("quote.opening")}</p>

          <div className="quote-actions">
            <button type="button" className="quote-btn-ghost" onClick={onClose}>
              {t("quote.cancel")}
            </button>
            <button type="submit" className="quote-btn">
              {t("quote.send")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
