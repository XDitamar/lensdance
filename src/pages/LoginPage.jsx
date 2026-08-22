import React, { useId, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
// Layout lives in CSS because it has to change at a breakpoint, and inline
// styles cannot carry media queries. See the header comment in that file.
import "./auth-page.css";

// Firebase error code → i18n key, so the message arrives in the visitor's language.
const ERROR_KEYS = {
  "auth/user-not-found":         "errors.userNotFound",
  "auth/wrong-password":         "errors.wrongPassword",
  "auth/invalid-email":          "errors.invalidEmail",
  "auth/too-many-requests":      "errors.tooManyRequests",
  "auth/network-request-failed": "errors.network",
  "auth/invalid-credential":     "errors.invalidCredentials",
};

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const [email,   setEmail]   = useState("");
  const [pw,      setPw]      = useState("");
  const [showPw,  setShowPw]  = useState(false);
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const doLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, pw);
      navigate("/me");
    } catch (err) {
      setError(ERROR_KEYS[err?.code] ? t(ERROR_KEYS[err.code]) : t("common.errorWithCode", { detail: err?.code || "unknown" }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-root" dir={i18n.dir()}>

      <div className="auth-split is-login">

        {/* ── Dark brand panel. Beside the form on a desktop, a short header
               strip on a phone — see auth-page.css. ── */}
        <div className="auth-panel">
          <div className="auth-panel-rule" />
          <h2 className="auth-panel-title">
            <span dangerouslySetInnerHTML={{ __html: t("login.panelTitle") }} />
          </h2>
          <p className="auth-panel-quote">
            <span dangerouslySetInnerHTML={{ __html: t("login.panelQuote") }} />
          </p>
          <div className="auth-panel-rule" />
          <span className="auth-panel-sig">Lens Dance Photography</span>
        </div>

        {/* ── Form ── */}
        <div className="auth-form-side">
          <span style={s.eyebrow}>{t("login.welcome")}</span>
          <h1 style={s.title}>{t("login.title")}</h1>

          <form onSubmit={doLogin} noValidate>
            <Field label={t("login.email")}>
              {(id) => (
                <input
                  id={id}
                  className="auth-input"
                  style={{ direction: "ltr", textAlign: "left" }}
                  type="email" value={email} placeholder="your@email.com"
                  onChange={e => setEmail(e.target.value)}
                  required autoComplete="email"
                  inputMode="email"
                />
              )}
            </Field>

            <Field label={t("login.password")}>
              {(id) => (
                <div style={{ position: "relative" }}>
                  <input
                    id={id}
                    className="auth-input"
                    style={{ paddingInlineStart: 56 }}
                    type={showPw ? "text" : "password"} value={pw}
                    placeholder="••••••••"
                    onChange={e => setPw(e.target.value)}
                    required autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="auth-toggle"
                    onClick={() => setShowPw(v => !v)}
                  >
                    {showPw ? t("common.hide") : t("common.show")}
                  </button>
                </div>
              )}
            </Field>

            <div style={{ textAlign: "start", marginTop: -10, marginBottom: 24 }}>
              <Link to="/forgot-password" style={s.link}>{t("login.forgot")}</Link>
            </div>

            {/* role=alert so a screen reader announces the failure instead of
                leaving someone waiting for a page that already answered. */}
            {error && <div style={s.error} role="alert">{error}</div>}

            <button type="submit" disabled={loading} className="auth-submit" style={{ opacity: loading ? 0.65 : 1 }}>
              {loading ? t("login.submitting") : t("login.submit")}
            </button>
          </form>

          <p style={{ marginTop: 22, textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: 11, color: "#8A7868" }}>
            {t("login.noAccount")}{" "}
            <Link to="/signup" style={s.link}>{t("login.signupPrompt")}</Link>
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
 * A labelled field.
 *
 * `children` is a function that receives a generated id, so the <label> can
 * point at the input with htmlFor. Previously the label and the input were
 * siblings with nothing tying them together: a screen reader read "edit text,
 * blank" with no idea which field it was on, and tapping the label — a large,
 * obvious target on a phone — did nothing.
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
  title:   { fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 400, color: "#2C1E12", margin: "0 0 30px" },
  link:    { color: "#4A3525", textDecoration: "none", borderBottom: "1px solid #B2967D", paddingBottom: 1, fontFamily: "Arial, sans-serif", fontSize: 11 },
  error:   { background: "#FFF0EE", border: "1px solid #E8C4BC", color: "#8A2A1F", padding: "10px 14px", fontFamily: "Arial, sans-serif", fontSize: 11, lineHeight: 1.6, marginBottom: 16 },
};