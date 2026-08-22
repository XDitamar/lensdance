import React, { useState, useEffect } from "react";
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { useTranslation } from "react-i18next";
import { useGeoPrice } from "../hooks/useGeoPrice";
import { ADMIN_EMAIL } from "../constants";
import {
  PRIORITY_FULL,
  PRIORITY_PACKAGE_ID,
  claimPrioritySlot,
  watchPrioritySlots,
} from "../lib/priority";

// The packages come from useGeoPrice: amounts/currency per the visitor's
// country (src/config/pricing.js), wording per their language
// (src/locales/*.json → "pricing.packages"). The ids — photos / video / short —
// are a data contract with AdminRegistrationsPage; never rename them.

// The terms live in src/locales/*.json ("competition.terms"). Hebrew is the
// binding version; the English one is a convenience translation and says so.

/* The stored value is the Hebrew day name, because that is what every existing
   registration document already contains — only the label is translated. */
const DAYS = [
  { value: "חמישי", key: "thursday" },
  { value: "שישי",  key: "friday" },
  { value: "רביעי", key: "wednesday" },
];

export default function CompetitionPage() {
  const { t, i18n } = useTranslation();
  const [user, authLoading] = useAuthState(auth);
  const isAdmin = user?.email === ADMIN_EMAIL;
  const { prices } = useGeoPrice();
  // Priority is not a package you tick alongside the others — it is capped per
  // competition, so it gets its own field below with a live count of what is
  // left. Everything else stays a plain checkbox list.
  const packages = prices.packages.filter((pkg) => pkg.id !== PRIORITY_PACKAGE_ID);
  const priorityPackage = prices.packages.find((pkg) => pkg.id === PRIORITY_PACKAGE_ID);

  // Competition title state
  const [title, setTitle] = useState("…");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // Terms state
  const [termsRead, setTermsRead] = useState(false);
  const [termsApproved, setTermsApproved] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [form, setForm] = useState({
    day: "",
    riderName: "",
    horseName: "",
    deposit: "",
    packages: [],
    contact: "",
    receiptWanted: "",
    publishPermission: "",
    underAge: false,
  });
  const [wantsPriority, setWantsPriority] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // How many priority places this competition has left. Null until the first
  // snapshot arrives, so the field can stay quiet rather than flash "5 left"
  // and correct itself a moment later.
  const [slots, setSlots] = useState(null);

  // Load competition title from Firestore
  useEffect(() => {
    getDoc(doc(db, "settings", "competition")).then(snap => {
      if (snap.exists()) {
        setTitle(snap.data().title || t("competition.pageTitle"));
        setTitleDraft(snap.data().title || "");
      }
    });
  }, [t]);

  // Live priority count for the competition on screen. A subscription rather
  // than a one-off read: someone else can take the last place while this form
  // is open, and the rider should see that before they submit, not after.
  useEffect(() => {
    if (!title || title === "…") return undefined;
    return watchPrioritySlots(title, setSlots);
  }, [title]);

  // Places ran out while the box was ticked — untick it rather than let the
  // rider submit something that is going to be refused.
  useEffect(() => {
    if (slots?.full) setWantsPriority(false);
  }, [slots?.full]);

  // Admin: save new title
  const saveTitle = async () => {
    await setDoc(doc(db, "settings", "competition"), { title: titleDraft }, { merge: true });
    setTitle(titleDraft);
    setEditingTitle(false);
  };

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const togglePkg = pkg => setForm(f => ({
    ...f,
    packages: f.packages.includes(pkg)
      ? f.packages.filter(p => p !== pkg)
      : [...f.packages, pkg],
  }));

  const validate = () => {
    if (!form.day)            return t("competition.errors.day");
    if (!form.riderName.trim()) return t("competition.errors.rider");
    if (!form.horseName.trim()) return t("competition.errors.horse");
    if (!form.deposit.trim())   return t("competition.errors.deposit");
    if (form.packages.length === 0) return t("competition.errors.packages");
    if (!form.contact.trim())   return t("competition.errors.contact");
    if (!form.receiptWanted)    return t("competition.errors.receipt");
    if (!form.publishPermission) return t("competition.errors.publish");
    if (!termsApproved)         return t("competition.errors.terms");
    return null;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError("");
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    try {
      // Take the priority place FIRST. The transaction is what stops two riders
      // being promised the same last slot, and claiming before writing means a
      // failure leaves a place held rather than double-booked. The admin page
      // recounts from the registrations and repairs any drift — see
      // src/lib/priority.js.
      if (wantsPriority) {
        try {
          await claimPrioritySlot(title);
        } catch (claimErr) {
          if (claimErr?.message === PRIORITY_FULL) {
            setWantsPriority(false);
            setError(t("competition.errors.priorityTaken"));
            setLoading(false);
            return;
          }
          // Anything else — the counter collection unreachable, rules not
          // deployed, network — is a bookkeeping problem, not the rider's.
          // Let the sign-up through: the registration is what matters, and
          // /admin/registrations recomputes the tally from the registrations
          // themselves. Failing here instead would lose a booking over a
          // number only the admin ever acts on.
          console.warn("Priority slot claim failed, continuing:", claimErr);
        }
      }

      await addDoc(collection(db, "registrations"), {
        ...form,
        // Priority is stored as a package id like any other, so the admin list
        // and the deposit maths keep working unchanged.
        packages: wantsPriority
          ? [...form.packages, PRIORITY_PACKAGE_ID]
          : form.packages,
        competitionTitle: title,
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

  // ── AUTH GATE ──
  // Registrations require a signed-in user (Firestore rules). Show a clear
  // call-to-action instead of letting a logged-out visitor fill the whole
  // form and hit a silent failure.
  if (authLoading) {
    return (
      <Page>
        <div style={{ textAlign: "center", padding: "60px 0", direction: i18n.dir() }}>
          <span style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#B2967D", letterSpacing: ".14em" }}>
            {t("common.loading")}
          </span>
        </div>
      </Page>
    );
  }
  if (!user) {
    return (
      <Page>
        <div style={{ textAlign: "center", padding: "40px 0", direction: i18n.dir() }}>
          <div style={{ fontSize: 30, marginBottom: 16 }}>✦</div>
          <h2 style={{ fontFamily: "Georgia,serif", fontSize: 22, fontWeight: 400, color: "#2C1E12", marginBottom: 14 }}>
            {t("competition.needAccountTitle")}
          </h2>
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 12, color: "#8A7868", lineHeight: 1.85, marginBottom: 24 }}>
            <span dangerouslySetInnerHTML={{ __html: t("competition.needAccountBody") }} />
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/login" style={{ ...s.btn, width: "auto", padding: "13px 28px", textDecoration: "none", display: "inline-block" }}>
              {t("competition.login")}
            </a>
            <a href="/signup" style={{ fontFamily: "Arial,sans-serif", fontSize: 10, letterSpacing: ".22em", textTransform: "uppercase", color: "#4A3525", border: "1px solid #B2967D", padding: "13px 28px", textDecoration: "none", display: "inline-block" }}>
              {t("competition.signup")}
            </a>
          </div>
        </div>
      </Page>
    );
  }

  // ── TERMS PAGE ──
  if (!showForm) {
    return (
      <Page>
        <TitleBlock title={title} isAdmin={isAdmin}
          editingTitle={editingTitle} titleDraft={titleDraft}
          setEditingTitle={setEditingTitle} setTitleDraft={setTitleDraft}
          saveTitle={saveTitle} />

        {/* Intro text */}
        <div style={{ background: "#FDFAF5", border: "1px solid #E2D9CE", padding: "28px 32px", marginBottom: 24, direction: i18n.dir(), lineHeight: 1.85 }}>
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 12, color: "#4A3525", marginBottom: 14 }}>
            <span dangerouslySetInnerHTML={{ __html: t("competition.introA") + t("competition.introB") }} />
          </p>
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 12, color: "#4A3525", marginBottom: 14 }}>
            {t("competition.depositNote")}
          </p>
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#8A2A1F", fontWeight: 600 }}>
            <span dangerouslySetInnerHTML={{ __html: t("competition.warnings") }} />
          </p>
        </div>

        {/* Terms box */}
        <div style={{ marginBottom: 20 }}>
          <label style={s.label}>{t("competition.termsLabel")}</label>
          <div style={{
            background: "#F5F1EA", border: "1px solid #D7C9B8",
            padding: "16px 18px", height: 200, overflowY: "auto",
            fontFamily: "Arial,sans-serif", fontSize: 11, color: "#4A3525",
            lineHeight: 1.85, direction: i18n.dir(), whiteSpace: "pre-line",
          }}>
            {t("competition.terms")}
          </div>
        </div>

        {/* Terms checkboxes */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, direction: i18n.dir(), marginBottom: 28 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontFamily: "Arial,sans-serif", fontSize: 12, color: "#4A3525" }}>
            <input type="checkbox" checked={termsRead} onChange={e => setTermsRead(e.target.checked)}
              style={{ accentColor: "#B2967D", width: 15, height: 15 }} />
            {t("competition.read")}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontFamily: "Arial,sans-serif", fontSize: 12, color: "#4A3525" }}>
            <input type="checkbox" checked={termsApproved} onChange={e => setTermsApproved(e.target.checked)}
              style={{ accentColor: "#B2967D", width: 15, height: 15 }} />
            {t("competition.approve")}
          </label>
        </div>

        <button
          disabled={!termsRead || !termsApproved}
          onClick={() => setShowForm(true)}
          style={{ ...s.btn, opacity: (!termsRead || !termsApproved) ? 0.45 : 1, cursor: (!termsRead || !termsApproved) ? "not-allowed" : "pointer" }}
        >
          {t("competition.continue")}
        </button>
      </Page>
    );
  }

  // ── SUCCESS ──
  if (submitted) {
    return (
      <Page>
        <div style={{ textAlign: "center", padding: "40px 0", direction: i18n.dir() }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>✦</div>
          <h2 style={{ fontFamily: "Georgia,serif", fontSize: 22, fontWeight: 400, color: "#2C1E12", marginBottom: 14 }}>
            {t("competition.successTitle")}
          </h2>
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 12, color: "#8A7868", lineHeight: 1.85, marginBottom: 10 }}>
            <span dangerouslySetInnerHTML={{ __html: t("competition.successBody") }} />
          </p>
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#B2967D" }}>
            {t("competition.successFooter")}
          </p>
        </div>
      </Page>
    );
  }

  // ── FORM ──
  return (
    <Page>
      <TitleBlock title={title} isAdmin={isAdmin}
        editingTitle={editingTitle} titleDraft={titleDraft}
        setEditingTitle={setEditingTitle} setTitleDraft={setTitleDraft}
        saveTitle={saveTitle} />

      <form onSubmit={handleSubmit} noValidate style={{ direction: i18n.dir() }}>

        {/* Day */}
        <Field label={t("competition.dayLabel")}>
          {/* The VALUE stays Hebrew — it is what the admin list already stores.
              Only the visible label follows the language. */}
          {DAYS.map(({ value, key }) => (
            <label key={value} style={s.radioLabel}>
              <input type="radio" name="day" value={value}
                checked={form.day === value} onChange={set("day")}
                style={{ accentColor: "#B2967D" }} />
              {t(`competition.days.${key}`)}
            </label>
          ))}
        </Field>

        {/* Rider name */}
        <Field label={t("competition.riderLabel")}>
          <input style={s.input} type="text" value={form.riderName}
            placeholder={t("competition.riderPlaceholder")}
            onChange={set("riderName")} required />
        </Field>

        {/* Horse name + number */}
        <Field label={t("competition.horseLabel")}>
          <input style={s.input} type="text" value={form.horseName}
            placeholder={t("competition.horsePlaceholder")}
            onChange={set("horseName")} required />
        </Field>

        {/* Deposit */}
        <Field label={t("competition.depositLabel")}>
          <input style={s.input} type="text" value={form.deposit}
            placeholder={t("competition.depositPlaceholder")}
            onChange={set("deposit")} required />
          {/* The rate lives in src/config/pricing.js and reaches here through
              useGeoPrice, so the form, the pricing cards and the terms can
              never quote three different numbers. */}
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 10, color: "#8A7868", lineHeight: 1.7, marginTop: 8 }}>
            {t("competition.depositHint", { percent: prices.depositPercent })}
          </p>
        </Field>

        {/* Package selection */}
        <Field label={t("competition.deliveryLabel")}>
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 10, color: "#8A7868", marginBottom: 10, lineHeight: 1.65 }}>
            {t("competition.deliveryBody")}
          </p>
          {packages.map(pkg => (
            <label key={pkg.id} style={s.checkLabel}>
              <input type="checkbox"
                checked={form.packages.includes(pkg.id)}
                onChange={() => togglePkg(pkg.id)}
                style={{ accentColor: "#B2967D", width: 15, height: 15 }} />
              {pkg.label}
            </label>
          ))}
        </Field>

        {/* Priority — its own field, because unlike the packages above there is
            a limited number of them and the rider needs to see how many are
            left before they choose. The count is live: it drops as other
            riders claim places. */}
        <Field label={t("competition.priorityLabel")}>
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 10, color: "#8A7868", marginBottom: 10, lineHeight: 1.65 }}>
            {priorityPackage?.label || prices.priority.sub}
          </p>

          {slots && (
            <div style={{
              fontFamily: "Arial,sans-serif", fontSize: 10, lineHeight: 1.6,
              color: slots.full ? "#8A2A1F" : "#3B6D11",
              background: slots.full ? "#FFF0EE" : "#F2F7EA",
              border: `1px solid ${slots.full ? "#E8C4BC" : "#C0DD97"}`,
              padding: "8px 12px", marginBottom: 10, alignSelf: "flex-start",
            }}>
              {slots.full
                ? t("competition.priorityFull")
                : t("competition.priorityRemaining", {
                    remaining: slots.remaining,
                    total: slots.total,
                  })}
            </div>
          )}

          {[
            { v: true,  l: t("competition.priorityYes") },
            { v: false, l: t("competition.priorityNo") },
          ].map((o) => (
            <label
              key={String(o.v)}
              style={{
                ...s.radioLabel,
                opacity: o.v && slots?.full ? 0.45 : 1,
                cursor: o.v && slots?.full ? "not-allowed" : "pointer",
              }}
            >
              <input
                type="radio"
                name="priority"
                checked={wantsPriority === o.v}
                disabled={o.v && slots?.full}
                onChange={() => setWantsPriority(o.v)}
                style={{ accentColor: "#B2967D" }}
              />
              {o.l}
            </label>
          ))}
        </Field>

        {/* Contact */}
        <Field label={t("competition.contactLabel")}>
          <input style={s.input} type="text" value={form.contact}
            placeholder={t("competition.contactPlaceholder")}
            onChange={set("contact")} required />
        </Field>

        {/* Receipt */}
        <Field label={t("competition.receiptLabel")}>
          {[{ v: "yes", l: t("competition.receiptYes") }, { v: "no", l: t("competition.receiptNo") }].map(o => (
            <label key={o.v} style={s.radioLabel}>
              <input type="radio" name="receipt" value={o.v}
                checked={form.receiptWanted === o.v} onChange={set("receiptWanted")}
                style={{ accentColor: "#B2967D" }} />
              {o.l}
            </label>
          ))}
        </Field>

        {/* Publish permission */}
        <Field label={t("competition.publishLabel")}>
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 10, color: "#8A7868", marginBottom: 10, lineHeight: 1.65 }}>
            <span dangerouslySetInnerHTML={{ __html: t("competition.publishNote") }} />
          </p>
          {[
            { v: "yes",      l: t("competition.publishYes") },
            { v: "no",       l: t("competition.publishNo") },
            { v: "underage", l: t("competition.publishUnderage") },
          ].map(o => (
            <label key={o.v} style={s.checkLabel}>
              <input type="checkbox"
                checked={form.publishPermission === o.v}
                onChange={() => setForm(f => ({ ...f, publishPermission: o.v }))}
                style={{ accentColor: "#B2967D", width: 15, height: 15 }} />
              {o.l}
            </label>
          ))}
        </Field>

        {/* Terms reminder */}
        <div style={{ background: "#EDE8DF", border: "1px solid #D7C9B8", padding: "14px 18px", marginBottom: 22 }}>
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#4A3525", lineHeight: 1.7 }}>
            {t("competition.termsConfirmed")}
          </p>
        </div>

        {error && <div style={s.error}>{error}</div>}

        <button type="submit" disabled={loading}
          style={{ ...s.btn, opacity: loading ? 0.65 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? t("competition.submitting") : t("competition.submit")}
        </button>

      </form>
    </Page>
  );
}

// ── Shared layout ──────────────────────────────
function Page({ children }) {
  return (
    <div style={{ background: "#F5F1EA", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "48px 24px", flex: 1, width: "100%" }}>
        {children}
      </div>
      <div style={{ background: "#2C1E12", padding: "14px 36px", textAlign: "center" }}>
        <span style={{ fontFamily: "Arial,sans-serif", fontSize: 9, letterSpacing: ".1em", color: "#4A3A28" }}>
          © 2025 Lens Dance Photography
        </span>
      </div>
    </div>
  );
}

function TitleBlock({ title, isAdmin, editingTitle, titleDraft, setEditingTitle, setTitleDraft, saveTitle }) {
  const { t, i18n } = useTranslation();
  return (
    <div style={{ textAlign: "center", marginBottom: 32, direction: i18n.dir() }}>
      <span style={{ fontFamily: "Arial,sans-serif", fontSize: 9, letterSpacing: ".22em", textTransform: "uppercase", color: "#B2967D", display: "block", marginBottom: 8 }}>
        {t("competition.pageTitle")}
      </span>
      {editingTitle ? (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            style={{ fontFamily: "Georgia,serif", fontSize: 20, border: "none", borderBottom: "2px solid #B2967D", background: "transparent", outline: "none", color: "#2C1E12", textAlign: "center", minWidth: 260 }}
          />
          <button onClick={saveTitle} style={{ ...s.btn, padding: "8px 18px", fontSize: 10 }}>{t("common.save")}</button>
          <button onClick={() => setEditingTitle(false)} style={{ fontFamily: "Arial,sans-serif", fontSize: 10, color: "#B2967D", background: "none", border: "none", cursor: "pointer" }}>{t("common.cancel")}</button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <h1 style={{ fontFamily: "Georgia,serif", fontSize: 24, fontWeight: 400, color: "#2C1E12", margin: 0 }}>{title}</h1>
          {isAdmin && (
            <button onClick={() => { setEditingTitle(true); setTitleDraft(title); }}
              title={t("competition.editTitle")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#B2967D", fontSize: 14 }}>
              ✏️
            </button>
          )}
        </div>
      )}

      {/* Admin link — only visible to admin */}
      {isAdmin && (
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <a href="/admin/registrations" style={{
            fontFamily: "Arial, sans-serif",
            fontSize: 9,
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: "#B2967D",
            textDecoration: "none",
            borderBottom: "1px solid #B2967D",
            paddingBottom: 1,
          }}>
            {t("competition.viewRegistrations")}
          </a>
        </div>
      )}

      <div style={{ height: 1, width: 36, background: "#B2967D", margin: "14px auto 0" }} />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <label style={s.label}>{label}</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>{children}</div>
    </div>
  );
}

const s = {
  label:      { display: "block", fontFamily: "Arial,sans-serif", fontSize: 9, letterSpacing: ".18em", textTransform: "uppercase", color: "#B2967D", marginBottom: 4 },
  input:      { width: "100%", background: "transparent", border: "none", borderBottom: "1px solid #D7C9B8", padding: "10px 0", fontFamily: "Georgia,serif", fontSize: 13, color: "#2C1E12", outline: "none", direction: "inherit", boxSizing: "border-box" },
  radioLabel: { display: "flex", alignItems: "center", gap: 10, fontFamily: "Arial,sans-serif", fontSize: 12, color: "#4A3525", cursor: "pointer" },
  checkLabel: { display: "flex", alignItems: "flex-start", gap: 10, fontFamily: "Arial,sans-serif", fontSize: 12, color: "#4A3525", cursor: "pointer", lineHeight: 1.6 },
  btn:        { width: "100%", background: "#4A3525", color: "#F5F1EA", border: "none", padding: "13px 0", fontFamily: "Arial,sans-serif", fontSize: 10, letterSpacing: ".22em", textTransform: "uppercase", cursor: "pointer", transition: "background .2s" },
  error:      { background: "#FFF0EE", border: "1px solid #E8C4BC", color: "#8A2A1F", padding: "10px 14px", fontFamily: "Arial,sans-serif", fontSize: 11, lineHeight: 1.6, marginBottom: 16 },
};