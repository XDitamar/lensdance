import React, { useId, useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db, storage } from "../firebase";
import { ref, uploadBytes } from "firebase/storage";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DISCIPLINES, disciplineKey } from "../constants";
// Layout lives in CSS because it has to change at a breakpoint, and inline
// styles cannot carry media queries. Shared with /login.
import "./auth-page.css";

// The discipline list is shared (src/constants.js) so the ids stay identical
// to the ones /change-discipline and the admin page use.

// Firebase error code → i18n key, so the message arrives in the visitor's language.
const ERROR_KEYS = {
  "auth/email-already-in-use":   "errors.emailInUse",
  "auth/invalid-email":          "errors.invalidEmail",
  "auth/weak-password":          "errors.weakPassword",
  "auth/network-request-failed": "errors.network",
  "auth/too-many-requests":      "errors.tooManyRequests",
};

export default function SignupPage() {
  const { t, i18n } = useTranslation();
  const [name,       setName]       = useState("");
  const [username,   setUsername]   = useState("");
  const [email,      setEmail]      = useState("");
  const [pw,         setPw]         = useState("");
  const [confirmPw,  setConfirmPw]  = useState("");
  const [showPw,     setShowPw]     = useState(false);
  const [showConf,   setShowConf]   = useState(false);
  const [discipline, setDiscipline] = useState("");
  const [error,      setError]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const navigate = useNavigate();

  function validate() {
    if (!name.trim())           return t("errors.nameRequired");
    if (!username.trim())       return t("errors.usernameRequired");
    if (username.includes(" ")) return t("errors.usernameSpaces");
    if (pw.length < 6)          return t("errors.passwordTooShort");
    if (pw !== confirmPw)       return t("errors.passwordMismatch");
    return null;
  }

  const doSignup = async (e) => {
    e.preventDefault();
    setError("");
    const err = validate();
    if (err) { setError(err); return; }

    setLoading(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, pw);
      // Save the full name on the Auth profile so the header/admin can show it.
      // Best-effort: profile/folder steps must not fail the whole signup.
      try {
        await updateProfile(user, { displayName: name.trim() });
      } catch (e) { console.warn("updateProfile failed:", e); }
      try {
        await setDoc(doc(db, "users", user.uid), {
          name:       name.trim(),
          username:   username.trim().toLowerCase(),
          email:      user.email,
          // Canonical Storage folder key, stored once so pages don't have to
          // guess sanitized-email variants later.
          folderKey:  email.replace(/[.#$[\]]/g, "_"),
          discipline: discipline || "other",
          role:       "client",
          createdAt:  new Date(),
        });
      } catch (e) {
        console.error("users doc write failed:", e);
        setError(t("errors.profileSaveFailed", { detail: e?.code || e?.message || "" }));
      }
      try {
        const sanitizedEmail = email.replace(/[.#$[\]]/g, "_");
        await uploadBytes(ref(storage, `${sanitizedEmail}/.placeholder`), new Blob([], { type: "text/plain" }));
      } catch (e) { console.warn("placeholder upload failed:", e); }
      navigate("/me");
    } catch (err) {
      console.error("Signup failed:", err);
      setError(ERROR_KEYS[err?.code] ? t(ERROR_KEYS[err.code]) : t("common.errorWithCode", { detail: err?.code || err?.message || "" }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-root" dir={i18n.dir()}>

      <div className="auth-split is-signup">

        {/* ── Dark brand panel. Beside the form on a desktop, a short header
               strip on a phone — see auth-page.css. ── */}
        <div className="auth-panel">
          <div className="auth-panel-rule" />
          <h2 className="auth-panel-title">
            <span dangerouslySetInnerHTML={{ __html: t("signup.panelTitle") }} />
          </h2>
          <p className="auth-panel-body">{t("signup.panelBody")}</p>
          <div className="auth-panel-rule" />
          {(t("signup.perks", { returnObjects: true }) || []).map(perk => (
            <span key={perk} className="auth-panel-perk">{perk}</span>
          ))}
        </div>

        {/* ── Form ── */}
        <div className="auth-form-side is-scroll">
          <span style={s.eyebrow}>{t("signup.heading")}</span>
          <h1 style={s.title}>{t("signup.title")}</h1>

          <form onSubmit={doSignup} noValidate>

            {/* Name + Username — side by side on a desktop, stacked on a
                phone (.auth-row), where two half-width inputs would leave
                neither wide enough to read what you had typed. */}
            <div className="auth-row">
              <Field label={t("signup.fullName")}>
                {(id) => (
                  <input id={id} className="auth-input" type="text" value={name}
                    placeholder={t("signup.fullNamePlaceholder")}
                    onChange={e => setName(e.target.value)} required autoComplete="name" />
                )}
              </Field>
              <Field label={t("signup.username")}>
                {(id) => (
                  <input id={id} className="auth-input" type="text" value={username}
                    placeholder={t("signup.usernamePlaceholder")}
                    onChange={e => setUsername(e.target.value.replace(/\s/g, ""))}
                    required autoComplete="username"
                    autoCapitalize="none" autoCorrect="off" spellCheck="false" />
                )}
              </Field>
            </div>

            {/* Email */}
            <Field label={t("signup.email")}>
              {(id) => (
                <input id={id} className="auth-input" style={{ direction: "ltr", textAlign: "left" }}
                  type="email" value={email} placeholder="your@email.com"
                  onChange={e => setEmail(e.target.value)} required
                  autoComplete="email" inputMode="email"
                  autoCapitalize="none" autoCorrect="off" spellCheck="false" />
              )}
            </Field>

            {/* Passwords */}
            <div className="auth-row">
              <Field label={t("signup.password")}>
                {(id) => (
                  <div style={{ position: "relative" }}>
                    <input id={id} className="auth-input" style={{ paddingInlineStart: 46 }}
                      type={showPw ? "text" : "password"} value={pw}
                      placeholder={t("signup.passwordPlaceholder")}
                      onChange={e => setPw(e.target.value)} required autoComplete="new-password" />
                    <button type="button" className="auth-toggle" onClick={() => setShowPw(v => !v)}>
                      {showPw ? t("common.hide") : t("common.show")}
                    </button>
                  </div>
                )}
              </Field>
              <Field label={t("signup.confirmPassword")}>
                {(id) => (
                  <div style={{ position: "relative" }}>
                    <input id={id} className="auth-input" style={{ paddingInlineStart: 46 }}
                      type={showConf ? "text" : "password"} value={confirmPw}
                      placeholder={t("signup.confirmPasswordPlaceholder")}
                      onChange={e => setConfirmPw(e.target.value)} required autoComplete="new-password" />
                    <button type="button" className="auth-toggle" onClick={() => setShowConf(v => !v)}>
                      {showConf ? t("common.hide") : t("common.show")}
                    </button>
                  </div>
                )}
              </Field>
            </div>

            {/* Discipline — a group of buttons, not an input, so it gets a
                labelled radiogroup rather than a <label> pointing at nothing. */}
            <div className="auth-field">
              <span className="auth-label" id="discipline-label">{t("signup.discipline")}</span>
              <div className="auth-disciplines" role="radiogroup" aria-labelledby="discipline-label">
                {DISCIPLINES.map(d => (
                  <button key={d.id} type="button" role="radio"
                    aria-checked={discipline === d.id}
                    onClick={() => setDiscipline(d.id)}
                    style={{
                      border: `1px solid ${discipline === d.id ? "#B2967D" : "#D7C9B8"}`,
                      background: discipline === d.id ? "#F5F0E8" : "transparent",
                      padding: "12px 6px", cursor: "pointer", transition: "all .2s",
                      fontFamily: "Arial, sans-serif", fontSize: 10,
                      letterSpacing: ".06em", color: "#4A3525",
                      minHeight: 44,
                    }}>
                    {t(disciplineKey(d.id))}
                  </button>
                ))}
              </div>
            </div>

            {error && <div style={s.error} role="alert">{error}</div>}

            <button type="submit" disabled={loading} className="auth-submit"
              style={{ opacity: loading ? 0.65 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? t("signup.submitting") : t("signup.submit")}
            </button>
          </form>

          <p style={{ marginTop: 20, textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: 11, color: "#8A7868" }}>
            {t("signup.haveAccount")}{" "}
            <Link to="/login" style={s.link}>{t("signup.loginPrompt")}</Link>
          </p>
        </div>
      </div>

      <div className="auth-foot">
        <span style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".1em", color: "#4A3A28" }}>
          © 2025 Lens Dance Photography
        </span>
      </div>
    </div>
  );
}

/**
 * A labelled field. `children` is a function given a generated id so the
 * <label> can point at the input with htmlFor — see the longer note on the
 * matching component in LoginPage.jsx.
 */
function Field({ label, children }) {
  const id = useId();
  return (
    <div className="auth-field">
      <label className="auth-label" htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

const s = {
  eyebrow: { fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".22em", textTransform: "uppercase", color: "#B2967D", display: "block", marginBottom: 6 },
  title:   { fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 400, color: "#2C1E12", margin: "0 0 28px" },
  link:    { color: "#4A3525", textDecoration: "none", borderBottom: "1px solid #B2967D", paddingBottom: 1, fontFamily: "Arial, sans-serif", fontSize: 11 },
  error:   { background: "#FFF0EE", border: "1px solid #E8C4BC", color: "#8A2A1F", padding: "10px 14px", fontFamily: "Arial, sans-serif", fontSize: 11, lineHeight: 1.6, marginBottom: 16 },
};