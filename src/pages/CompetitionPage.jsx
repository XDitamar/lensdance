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
import {
  competitionDays,
  competitionLabel,
  fetchCompetitions,
  formatRange,
  visibleCompetitions,
} from "../lib/competitions";
import { detectCountry } from "../hooks/useGeoPrice";
import { getWhatsAppInternational } from "../config/contact";

// The packages come from useGeoPrice: amounts/currency per the visitor's
// country (src/config/pricing.js), wording per their language
// (src/locales/*.json → "pricing.packages"). The ids — photos / video / short —
// are a data contract with AdminRegistrationsPage; never rename them.

// The terms live in src/locales/*.json ("competition.terms"). Hebrew is the
// binding version; the English one is a convenience translation and says so.

/* Fallback days, used only when there are no competition records yet.
   Once Alina creates a competition the options come from its date range
   instead — see competitionDays() in src/lib/competitions.js. A show's days
   change with every event, so hardcoding three names was right by coincidence
   at best. The stored value stays the Hebrew day name here, because that is
   what every registration made before this change already contains. */
const FALLBACK_DAYS = [
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
  const [comps, setComps] = useState([]);
  /* How many competition records exist at all, regardless of date or country.
     This distinguishes two states that look identical from `comps` alone:
     "nothing is coming up right now" — which deserves a friendly note — and
     "competitions were never set up here", where the page must keep working
     the way it did before this feature existed. null while unknown. */
  const [compsTotal, setCompsTotal] = useState(null);
  const [form, setForm] = useState({
    competitionId: "",
    day: "",
    riderName: "",
    horseName: "",
    classEntry: "",
    packages: [],
    contact: "",
    receiptWanted: "",
    publishPermission: "",
    underAge: false,
  });
  const [wantsPriority, setWantsPriority] = useState(false);
  /** Which package's "?" is open. One at a time — this is a form, not a menu. */
  const [openPkg, setOpenPkg] = useState(null);
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

  /* The competitions this visitor can actually sign up to.
     Filtered to their country and to dates that have not passed — see
     visibleCompetitions() in src/lib/competitions.js, which deliberately shows
     everything rather than nothing when the country lookup fails. */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [all, country] = await Promise.all([fetchCompetitions(), detectCountry()]);
        if (!alive) return;
        const list = visibleCompetitions(all, country);
        setCompsTotal(all.length);
        setComps(list);
        // One option is not a choice — preselect it so nobody has to click a
        // dropdown with a single entry.
        if (list.length === 1) setForm((f) => ({ ...f, competitionId: list[0].id }));
      } catch (err) {
        console.warn("Failed to load competitions:", err);
        // A failed read must not look like "no competitions" — that would show
        // the closed notice to everyone over a network blip. Leaving the total
        // unknown keeps the form available.
        if (alive) setCompsTotal(null);
      }
    })();
    return () => { alive = false; };
  }, []);

  /** The competition record the rider picked, if any exist to pick from. */
  const chosenComp = comps.find((c) => c.id === form.competitionId);
  /* What the sign-up is filed under, and what the priority tally is keyed on.
     A chosen competition wins; otherwise fall back to the single title in
     settings/competition, which is how every registration was filed before
     competitions became records of their own.
     Declared above the effects below because they read it — a `const` used
     before its line throws rather than reading as undefined. */
  const filedUnder = chosenComp ? competitionLabel(chosenComp) : title;

  /* The days on offer. Real dates from the chosen competition; the old fixed
     three only when no competition exists to read them from. Both shapes are
     { value, label } so the radio list below does not care which it got. */
  const dayOptions = chosenComp
    ? competitionDays(chosenComp, i18n.language).map((d) => ({
        value: `${d.label} · ${d.date}`,
        label: d.label,
      }))
    : FALLBACK_DAYS.map(({ value, key }) => ({
        value,
        label: t(`competition.days.${key}`),
      }));

  /* Switching competition invalidates whatever day was picked — the dates
     belong to the other event. Clearing it is better than silently submitting
     a day that is not in this competition at all. */
  useEffect(() => {
    setForm((f) => (f.day ? { ...f, day: "" } : f));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.competitionId]);

  // Live priority count for the competition on screen. A subscription rather
  // than a one-off read: someone else can take the last place while this form
  // is open, and the rider should see that before they submit, not after.
  useEffect(() => {
    if (!filedUnder || filedUnder === "…") return undefined;
    return watchPrioritySlots(filedUnder, setSlots);
  }, [filedUnder]);

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
    if (comps.length > 0 && !form.competitionId) return t("competition.errors.choose");
    if (!form.day)            return t("competition.errors.day");
    if (!form.riderName.trim()) return t("competition.errors.rider");
    if (!form.horseName.trim()) return t("competition.errors.horse");
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
          await claimPrioritySlot(filedUnder);
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
        // The title is what the admin list groups by, and it is written once
        // at submit time so the archive keeps reading correctly even after the
        // competition itself is removed from the list.
        competitionTitle: filedUnder,
        competitionCountry: chosenComp?.country || null,
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
  /* ── NOTHING COMING UP ──
     Competitions exist in the system but none of them is still ahead of the
     visitor's own date and country. Saying so plainly beats an empty dropdown
     over a form nobody can usefully fill in.
     Shown before the sign-in gate on purpose: "there is no competition right
     now" is more use to a visitor than being asked to create an account first.
     The admin is let through so she can still open the form to check it. */
  if (compsTotal !== null && compsTotal > 0 && comps.length === 0 && !isAdmin) {
    return (
      <Page>
        <div style={{ textAlign: "center", padding: "40px 0", direction: i18n.dir() }}>
          <div style={{ fontSize: 30, marginBottom: 16, color: "#B2967D" }}>✦</div>
          <h2 style={{ fontFamily: "Georgia,serif", fontSize: 22, fontWeight: 400, color: "#2C1E12", marginBottom: 14 }}>
            {t("competition.noneUpcomingTitle")}
          </h2>
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 12, color: "#8A7868", lineHeight: 1.85, marginBottom: 24 }}>
            {t("competition.noneUpcomingBody")}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a
              href={`https://wa.me/${getWhatsAppInternational()}`}
              target="_blank" rel="noreferrer"
              style={{ ...s.btn, width: "auto", padding: "13px 28px", textDecoration: "none", display: "inline-block" }}
            >
              {t("competition.noneUpcomingCta")}
            </a>
            <a href="/pricing" style={{ fontFamily: "Arial,sans-serif", fontSize: 10, letterSpacing: ".22em", textTransform: "uppercase", color: "#4A3525", border: "1px solid #B2967D", padding: "13px 28px", textDecoration: "none", display: "inline-block" }}>
              {t("pricing.pageTitle")}
            </a>
          </div>
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

        {/* Which competition. Only shown once there are real competition
            records — before that the page is about the single event named in
            settings/competition, and a dropdown with nothing in it would be
            worse than no dropdown. */}
        {comps.length > 0 && (
          <Field label={t("competition.chooseLabel")}>
            <select
              style={{ ...s.input, background: "transparent" }}
              value={form.competitionId}
              onChange={set("competitionId")}
            >
              <option value="">—</option>
              {comps.map((c) => (
                <option key={c.id} value={c.id}>
                  {[competitionLabel(c), formatRange(c)].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </Field>
        )}

        {/* Day — the real dates of the chosen competition, or the old fixed
            list when no competition has been created yet. */}
        <Field label={t("competition.dayLabel")}>
          {dayOptions.map(({ value, label }) => (
            <label key={value} style={s.radioLabel}>
              <input type="radio" name="day" value={value}
                checked={form.day === value} onChange={set("day")}
                style={{ accentColor: "#B2967D" }} />
              {label}
            </label>
          ))}
          {dayOptions.length === 0 && (
            <p style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#8A7868" }}>
              {t("competition.noDays")}
            </p>
          )}
        </Field>

        {/* Rider name */}
        <Field label={t("competition.riderLabel")}>
          <input style={s.input} type="text" value={form.riderName}
            placeholder={t("competition.riderPlaceholder")}
            onChange={set("riderName")} required />
        </Field>

        {/* The horse, and the class, are two different things. They used to
            share one box — "horse name + class number if known" — so answers
            came back as one run-on string that had to be read apart by hand on
            the day. Two fields, each asking one question. */}
        <Field label={t("competition.horseLabel")}>
          <input style={s.input} type="text" value={form.horseName}
            placeholder={t("competition.horsePlaceholder")}
            onChange={set("horseName")} required />
        </Field>

        {/* Optional: a rider often does not have the entry number yet when
            they sign up, and refusing the form over it would cost a booking. */}
        <Field label={t("competition.classLabel")}>
          <input style={s.input} type="text" value={form.classEntry}
            placeholder={t("competition.classPlaceholder")}
            onChange={set("classEntry")} />
        </Field>

        {/* The deposit amount used to be typed in here by the rider, which
            asked them to work out a number the site already knows. The rate
            lives in src/config/pricing.js and reaches this line through
            useGeoPrice, so the form, the pricing cards and the terms can never
            quote three different figures. */}
        <p style={{
          fontFamily: "Arial,sans-serif", fontSize: 11, lineHeight: 1.75,
          color: "#4A3525", background: "#F2F7EA", border: "1px solid #C0DD97",
          padding: "12px 16px", marginBottom: 24,
        }}>
          {t("competition.depositHint", { percent: prices.depositPercent })}
        </p>

        {/* Package selection. Each one carries a "?" that opens the same list
            of contents the pricing page shows — a name and a price alone did
            not tell anyone what they were actually ordering. */}
        <Field label={t("competition.packagesLabel")}>
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 10, color: "#8A7868", marginBottom: 10, lineHeight: 1.65 }}>
            {t("competition.deliveryBody")}
          </p>
          {packages.map(pkg => {
            const open = openPkg === pkg.id;
            const lines = Array.isArray(pkg.includes) ? pkg.includes : [];
            return (
              <div key={pkg.id}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <label style={{ ...s.checkLabel, flex: 1 }}>
                    <input type="checkbox"
                      checked={form.packages.includes(pkg.id)}
                      onChange={() => togglePkg(pkg.id)}
                      style={{ accentColor: "#B2967D", width: 15, height: 15 }} />
                    {pkg.label}
                  </label>
                  {lines.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setOpenPkg(open ? null : pkg.id)}
                      aria-expanded={open}
                      aria-label={t("competition.whatsIncluded")}
                      title={t("competition.whatsIncluded")}
                      style={{
                        flexShrink: 0, width: 22, height: 22, borderRadius: "50%",
                        border: `1px solid ${open ? "#B2967D" : "#D7C9B8"}`,
                        background: open ? "#B2967D" : "transparent",
                        color: open ? "#FDFAF5" : "#B2967D",
                        fontFamily: "Arial,sans-serif", fontSize: 11, lineHeight: 1,
                        cursor: "pointer", padding: 0,
                      }}
                    >
                      ?
                    </button>
                  )}
                </div>
                {open && (
                  <ul style={{
                    listStyle: "none", margin: "6px 0 10px",
                    paddingInlineStart: 26, paddingBlock: 0,
                  }}>
                    {lines.map((line) => (
                      <li key={line} style={{
                        fontFamily: "Arial,sans-serif", fontSize: 11,
                        lineHeight: 1.8, color: "#6A5A50",
                      }}>
                        · {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
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