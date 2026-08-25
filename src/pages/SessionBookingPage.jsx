// src/pages/SessionBookingPage.jsx
//
// Booking a personal photo session. Four public URLs — /book/hour,
// /book/two-hours, /book/black-and-white, /book/training — all render this one
// component, with the session taken from the route.
//
// Four routes, one component, on purpose: separate addresses are what make a
// link sendable ("here, book the black-and-white one") and what search engines
// can index, but four copies of the same form would drift apart the moment a
// field changed. The catalogue in src/lib/sessions.js is what ties a slug to a
// session; add a row there and a route in App.js to add a fifth.
//
// Structure mirrors /register (CompetitionPage): terms first, form second,
// confirmation third. The terms are the same binding Hebrew text — one
// agreement covers the business, not one per product.
//
// Bookings land in `sessionBookings`, read only by the admin. See
// firestore.rules and the personal-sessions tab on /admin/registrations.

import React, { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuthState } from "react-firebase-hooks/auth";
import { useTranslation } from "react-i18next";
import { auth, db } from "../firebase";
import { useGeoPrice } from "../hooks/useGeoPrice";
import { SESSION_BOOKINGS, sessionBySlug } from "../lib/sessions";
import { isRtlLang } from "../i18n";
import "./session-booking.css";

export default function SessionBookingPage() {
  const { slug } = useParams();
  const { t, i18n } = useTranslation();
  const [user, authLoading] = useAuthState(auth);
  const { prices } = useGeoPrice();

  const session = sessionBySlug(slug);

  const [termsRead, setTermsRead] = useState(false);
  const [termsApproved, setTermsApproved] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    riderName: "",
    contact: "",
    preferredDate: "",
    location: "",
    horseName: "",
    horseCount: "1",
    extraAnimal: "",
    publishPermission: "",
    notes: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // An unknown slug is a dead URL, not an error page worth designing — send
  // people to the prices, where the sessions are listed.
  if (!session) return <Navigate to="/pricing" replace />;

  const card = prices[session.id] || {};
  const dir = isRtlLang(i18n.language) ? "rtl" : "ltr";

  const validate = () => {
    if (!form.riderName.trim()) return t("booking.errors.name");
    if (!form.contact.trim()) return t("booking.errors.contact");
    if (!form.preferredDate.trim()) return t("booking.errors.date");
    if (!form.location.trim()) return t("booking.errors.location");
    if (!form.horseName.trim()) return t("booking.errors.horse");
    if (!form.publishPermission) return t("competition.errors.publish");
    if (!termsApproved) return t("competition.errors.terms");
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    try {
      await addDoc(collection(db, SESSION_BOOKINGS), {
        ...form,
        // The id, not the label: the label is translated and priced, and would
        // be meaningless to read back from a document six months later.
        sessionId: session.id,
        sessionSlug: session.slug,
        userId: user?.uid || null,
        userEmail: user?.email || null,
        userName: user?.displayName || null,
        submittedAt: serverTimestamp(),
      });
      setSubmitted(true);
    } catch (err) {
      if (err?.code === "permission-denied" || !user) {
        setError(t("competition.errors.needAccount"));
      } else {
        setError(t("common.errorWithCode", { detail: err?.code || "unknown" }));
      }
    } finally {
      setLoading(false);
    }
  };

  /* ── Auth gate ── */
  if (authLoading) {
    return (
      <Shell dir={dir}>
        <p className="sb-muted" style={{ textAlign: "center", padding: "60px 0" }}>
          {t("common.loading")}
        </p>
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell dir={dir}>
        <Head session={card} eyebrow={t("booking.eyebrow")} />
        <div className="sb-center">
          <div className="sb-mark">✦</div>
          <h2 className="sb-h2">{t("competition.needAccountTitle")}</h2>
          <p className="sb-muted">
            <span dangerouslySetInnerHTML={{ __html: t("competition.needAccountBody") }} />
          </p>
          <div className="sb-cta-row">
            <Link to="/login" className="sb-btn sb-btn-inline">{t("competition.login")}</Link>
            <Link to="/signup" className="sb-btn-ghost">{t("competition.signup")}</Link>
          </div>
        </div>
      </Shell>
    );
  }

  /* ── Confirmation ── */
  if (submitted) {
    return (
      <Shell dir={dir}>
        <div className="sb-center">
          <div className="sb-mark">✦</div>
          <h2 className="sb-h2">{t("booking.successTitle")}</h2>
          <p className="sb-muted">{t("booking.successBody")}</p>
          <div className="sb-cta-row">
            <Link to="/pricing" className="sb-btn-ghost">{t("booking.backToPricing")}</Link>
          </div>
        </div>
      </Shell>
    );
  }

  /* ── Terms ── */
  if (!showForm) {
    return (
      <Shell dir={dir}>
        <Head session={card} eyebrow={t("booking.eyebrow")} />

        <div className="sb-intro">
          <p>{t("booking.intro")}</p>
          {Array.isArray(card.includes) && card.includes.length > 0 && (
            <>
              <div className="sb-includes-title">{prices.includesTitle}</div>
              <ul className="sb-includes">
                {card.includes.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </>
          )}
          <p className="sb-deposit">{prices.deposit}</p>
        </div>

        <div className="sb-field">
          <span className="sb-label">{t("competition.termsLabel")}</span>
          <div className="sb-terms">{t("competition.terms")}</div>
        </div>

        <div className="sb-checks">
          <label className="sb-check">
            <input type="checkbox" checked={termsRead}
              onChange={(e) => setTermsRead(e.target.checked)} />
            {t("competition.read")}
          </label>
          <label className="sb-check">
            <input type="checkbox" checked={termsApproved}
              onChange={(e) => setTermsApproved(e.target.checked)} />
            {t("competition.approve")}
          </label>
        </div>

        <button
          className="sb-btn"
          disabled={!termsRead || !termsApproved}
          onClick={() => setShowForm(true)}
        >
          {t("competition.continue")}
        </button>
      </Shell>
    );
  }

  /* ── Form ── */
  return (
    <Shell dir={dir}>
      <Head session={card} eyebrow={t("booking.eyebrow")} />

      <form onSubmit={handleSubmit} noValidate>
        <Field label={t("competition.riderLabel")}>
          {(id) => (
            <input id={id} className="sb-input" type="text" value={form.riderName}
              placeholder={t("competition.riderPlaceholder")}
              onChange={set("riderName")} autoComplete="name" />
          )}
        </Field>

        <Field label={t("competition.contactLabel")}>
          {(id) => (
            <input id={id} className="sb-input" type="text" value={form.contact}
              placeholder={t("competition.contactPlaceholder")}
              onChange={set("contact")} />
          )}
        </Field>

        <Field label={t("booking.dateLabel")} hint={t("booking.dateHint")}>
          {(id) => (
            <input id={id} className="sb-input" type="text" value={form.preferredDate}
              placeholder={t("booking.datePlaceholder")}
              onChange={set("preferredDate")} />
          )}
        </Field>

        <Field label={t("booking.locationLabel")}>
          {(id) => (
            <input id={id} className="sb-input" type="text" value={form.location}
              placeholder={t("booking.locationPlaceholder")}
              onChange={set("location")} />
          )}
        </Field>

        <Field label={t("booking.horseLabel")}>
          {(id) => (
            <input id={id} className="sb-input" type="text" value={form.horseName}
              placeholder={t("booking.horsePlaceholder")}
              onChange={set("horseName")} />
          )}
        </Field>

        {/* Only asked where it changes the price — see `extras` in
            src/lib/sessions.js. */}
        {session.extras.horses && (
          <Field
            label={t("booking.horseCountLabel")}
            hint={t("booking.horseCountHint", { price: prices.money("extraHorseSession") })}
          >
            {(id) => (
              <input id={id} className="sb-input" type="number" min="1" max="6"
                value={form.horseCount} onChange={set("horseCount")} inputMode="numeric" />
            )}
          </Field>
        )}

        {session.extras.animal && (
          <Field
            label={t("booking.extraAnimalLabel")}
            hint={t("booking.extraAnimalHint", { price: prices.money("extraAnimal") })}
          >
            {(id) => (
              <input id={id} className="sb-input" type="text" value={form.extraAnimal}
                placeholder={t("booking.extraAnimalPlaceholder")}
                onChange={set("extraAnimal")} />
            )}
          </Field>
        )}

        <div className="sb-field">
          <span className="sb-label" id="publish-label">{t("competition.publishLabel")}</span>
          <p className="sb-hint">
            <span dangerouslySetInnerHTML={{ __html: t("competition.publishNote") }} />
          </p>
          {/* No role or aria-checked on the inputs below: a native radio
              already carries both, and restating them is redundant. The
              discipline buttons on the sign-up page do need them, because a
              <button> conveys neither on its own. */}
          <div role="radiogroup" aria-labelledby="publish-label" className="sb-radios">
            {[
              { v: "yes", l: t("competition.publishYes") },
              { v: "no", l: t("competition.publishNo") },
              { v: "underage", l: t("competition.publishUnderage") },
            ].map((o) => (
              <label key={o.v} className="sb-check">
                <input type="radio" name="publish"
                  checked={form.publishPermission === o.v}
                  onChange={() => setForm((f) => ({ ...f, publishPermission: o.v }))} />
                {o.l}
              </label>
            ))}
          </div>
        </div>

        <Field label={t("booking.notesLabel")}>
          {(id) => (
            <textarea id={id} className="sb-input sb-textarea" rows={3} value={form.notes}
              placeholder={t("booking.notesPlaceholder")}
              onChange={set("notes")} />
          )}
        </Field>

        <p className="sb-deposit-note">
          {t("competition.depositHint", { percent: prices.depositPercent })}
        </p>

        <div className="sb-terms-confirmed">{t("competition.termsConfirmed")}</div>

        {error && <div className="sb-error" role="alert">{error}</div>}

        <button type="submit" className="sb-btn" disabled={loading}>
          {loading ? t("booking.submitting") : t("booking.submit")}
        </button>
      </form>
    </Shell>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function Shell({ children, dir }) {
  return (
    <div className="sb-root" dir={dir}>
      <div className="sb-page">{children}</div>
      <div className="sb-foot">
        <span>© 2025 Lens Dance Photography</span>
      </div>
    </div>
  );
}

function Head({ session, eyebrow }) {
  return (
    <div className="sb-head">
      <span className="sb-eyebrow">{eyebrow}</span>
      <h1 className="sb-title">{session.title}</h1>
      <p className="sb-sub">{session.sub}</p>
      <div className="sb-price">{session.from}</div>
      <div className="sb-rule" />
    </div>
  );
}

/**
 * A labelled field. `children` is a function given a generated id so the label
 * can point at the control with htmlFor — without it a screen reader reads an
 * unnamed text box, and tapping the label does nothing.
 */
function Field({ label, hint, children }) {
  const id = React.useId();
  return (
    <div className="sb-field">
      <label className="sb-label" htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <p className="sb-hint">{hint}</p>}
    </div>
  );
}
