import React, { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";
import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { getWhatsAppInternational } from "../config/contact";
import "./auth-page.css";

// Firebase error code → i18n key, so the message arrives in the visitor's language.
const ERROR_KEYS = {
  "auth/invalid-email":          "errors.invalidEmail",
  "auth/user-not-found":         "errors.userNotFound",
  "auth/missing-email":          "errors.emailRequired",
  "auth/too-many-requests":      "errors.tooManyRequests",
  "auth/network-request-failed": "errors.network",
};

export default function ForgotPasswordPage() {
  const { t, i18n } = useTranslation();
  const [email,   setEmail]   = useState("");
  const [error,   setError]   = useState("");
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);

  const doReset = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (err) {
      // Note: for privacy Firebase may still succeed on unknown emails.
      setError(ERROR_KEYS[err?.code] ? t(ERROR_KEYS[err.code]) : t("common.genericError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: "#F5F1EA", minHeight: "100vh", display: "flex", flexDirection: "column" }} dir={i18n.dir()}>

      {/* Two columns on a desktop, stacked on a phone.
          The split used to be an inline style, and an inline style cannot
          carry a media query — so on a phone the dark panel and the form
          each took half the WIDTH, which is how a client ended up reading
          "ellachicamella@gmail.co…" with the rest of the sentence off the
          edge of the screen. Same mistake as the login page had; the rule
          lives in auth-page.css now, where a breakpoint can reach it. */}
      <div className="forgot-split">

        {/* ── Left dark panel ── */}
        <div style={{
          background: "#2C1E12", padding: "60px 44px",
          display: "flex", flexDirection: "column", justifyContent: "center", gap: 20,
        }}>
          <div style={{ width: 36, height: 1, background: "rgba(255,255,255,.2)" }} />
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 400, color: "#F5F1EA", lineHeight: 1.4, margin: 0 }}>
            {t("forgot.panelTitle")}
          </h2>
          <p style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: "rgba(255,255,255,.45)", lineHeight: 1.85, margin: 0 }}>
            {t("forgot.panelBody")}
          </p>
          <div style={{ width: 36, height: 1, background: "rgba(255,255,255,.2)" }} />
          <span style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".14em", color: "rgba(255,255,255,.25)" }}>
            Lens Dance Photography
          </span>
        </div>

        {/* ── Right form ── */}
        <div style={{ background: "#FDFAF5", padding: "60px 52px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <span style={s.eyebrow}>{t("forgot.heading")}</span>
          <h1 style={s.title}>{t("forgot.title")}</h1>

          {sent ? (
            <div>
              <div style={{ ...s.error, background: "#F0F7F0", borderColor: "#C4E0C4", color: "#2A5A2A" }}>
                <Trans i18nKey="forgot.sent" values={{ email }} components={{ strong: <strong /> }} />
              </div>
              {/* A way out when the mail does not arrive.
                  Reset mail is the one message a locked-out person cannot
                  work around: if it lands in spam or nowhere, the page as it
                  stood just said "we sent it" and left them there. The
                  deliverability fix is a DNS one, but even a perfect sender
                  reaches somebody's junk folder eventually, so there has to
                  be a human at the end of it.
                  The client sends the message themselves rather than the page
                  notifying Alina: an endpoint that pushes to her phone without
                  a signed-in user — and a locked-out user has none — is an
                  open line for anyone to shout down. */}
              <div style={{ marginTop: 26, borderTop: "1px solid #E2D9CE", paddingTop: 20 }}>
                <p style={{ fontFamily: "Arial, sans-serif", fontSize: 11, lineHeight: 1.85, color: "#8A7868", margin: "0 0 14px", textAlign: "center" }}>
                  {t("forgot.notArrived")}
                </p>
                <a
                  href={`https://wa.me/${getWhatsAppInternational()}?text=${encodeURIComponent(
                    t("forgot.whatsappMessage", { email })
                  )}`}
                  target="_blank" rel="noreferrer"
                  style={{ ...s.btn, display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}
                >
                  {t("forgot.whatsapp")}
                </a>
              </div>

              <p style={{ marginTop: 22, textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: 11, color: "#8A7868" }}>
                <Link to="/login" style={s.link}>{t("common.backToLogin")}</Link>
              </p>
            </div>
          ) : (
            <>
              <form onSubmit={doReset} noValidate>
                <Field label={t("forgot.email")}>
                  <input
                    style={{ ...s.input, direction: "ltr", textAlign: "left" }}
                    type="email" value={email} placeholder="your@email.com"
                    onChange={e => setEmail(e.target.value)}
                    required autoComplete="email" autoFocus
                  />
                </Field>

                {error && <div style={s.error}>{error}</div>}

                <button type="submit" disabled={loading} style={{ ...s.btn, opacity: loading ? 0.65 : 1 }}>
                  {loading ? t("common.sending") : t("forgot.submit")}
                </button>
              </form>

              <p style={{ marginTop: 22, textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: 11, color: "#8A7868" }}>
                {t("forgot.remembered")}{" "}
                <Link to="/login" style={s.link}>{t("common.backToLogin")}</Link>
              </p>
            </>
          )}
        </div>
      </div>

      <div style={{ background: "#2C1E12", padding: "14px 36px", textAlign: "center" }}>
        <span style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".1em", color: "#4A3A28" }}>
          © 2025 Lens Dance Photography
        </span>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <label style={{ display: "block", fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: "#B2967D", marginBottom: 8 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const s = {
  eyebrow: { fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".22em", textTransform: "uppercase", color: "#B2967D", display: "block", marginBottom: 6 },
  title:   { fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 400, color: "#2C1E12", margin: "0 0 30px" },
  input:   { width: "100%", background: "transparent", border: "none", borderBottom: "1px solid #D7C9B8", padding: "10px 0", fontFamily: "Georgia, serif", fontSize: 13, color: "#2C1E12", outline: "none", direction: "inherit", boxSizing: "border-box" },
  btn:     { width: "100%", background: "#4A3525", color: "#F5F1EA", border: "none", padding: "13px 0", fontFamily: "Arial, sans-serif", fontSize: 10, letterSpacing: ".22em", textTransform: "uppercase", cursor: "pointer", transition: "background .2s" },
  link:    { color: "#4A3525", textDecoration: "none", borderBottom: "1px solid #B2967D", paddingBottom: 1, fontFamily: "Arial, sans-serif", fontSize: 11 },
  error:   { background: "#FFF0EE", border: "1px solid #E8C4BC", color: "#8A2A1F", padding: "10px 14px", fontFamily: "Arial, sans-serif", fontSize: 11, lineHeight: 1.6, marginBottom: 16 },
};
