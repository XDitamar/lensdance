// src/pages/ResetPasswordPage.jsx
import React, { useEffect, useState } from "react";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "../firebase";
import { Trans, useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [status, setStatus] = useState("verifying"); // verifying | ready | submitting | done | error
  const [error, setError] = useState("");
  /** What the client pasted when the link itself did not carry a usable code. */
  const [pasted, setPasted] = useState("");
  const navigate = useNavigate();

  /**
   * Pull the reset code out of whatever was pasted.
   *
   * People paste the whole address from the mail, the address without its
   * tail, or just the code. All three have to work — asking somebody locked
   * out of their account to identify which part of a URL is "the code" is
   * asking the wrong person at the worst moment.
   */
  const extractCode = (raw) => {
    const text = String(raw || "").trim().replace(/&amp;/g, "&");
    const fromUrl = text.match(/[?&]oobCode=([^&\s]+)/i);
    if (fromUrl) return decodeURIComponent(fromUrl[1]);
    // A bare code: no spaces, no scheme, long enough to be one.
    if (!/\s/.test(text) && !/^https?:/i.test(text) && text.length > 15) return text;
    return "";
  };

  const verify = React.useCallback(async (oob) => {
    try {
      const restoredEmail = await verifyPasswordResetCode(auth, oob);
      setCode(oob);
      setEmail(restoredEmail);
      setError("");
      setStatus("ready");
      return true;
    } catch {
      setError(t("errors.resetLinkExpired"));
      setStatus("error");
      return false;
    }
  }, [t]);

  const retryWithPasted = async (e) => {
    e.preventDefault();
    const oob = extractCode(pasted);
    if (!oob) { setError(t("errors.resetLinkInvalid")); return; }
    setStatus("verifying");
    await verify(oob);
  };

  // Extract oobCode from the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oob = params.get("oobCode") || "";
    setCode(oob);

    if (!oob) {
      setError(t("errors.resetLinkInvalid"));
      setStatus("error");
      return;
    }

    verify(oob);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) {
      setError(t("errors.passwordMismatch"));
      return;
    }
    setStatus("submitting");
    setError("");

    try {
      await confirmPasswordReset(auth, code, pw);
      setStatus("done");
      // optional: navigate to login after a moment
      setTimeout(() => navigate("/login", { replace: true, state: { email } }), 800);
    } catch {
      setError(t("errors.resetFailed"));
      setStatus("error");
    }
  };

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-header">
          <p className="auth-subtitle">{t("reset.heading")}</p>
          <h1 className="auth-title">{t("reset.title")}</h1>
        </div>

        {status === "verifying" && <div>{t("reset.verifying")}</div>}

        {status === "ready" && (
          <form onSubmit={onSubmit} className="auth-form">
            <div className="auth-hint" style={{ marginBottom: 8 }}>
              <Trans i18nKey="reset.resettingFor" values={{ email }} components={{ strong: <strong /> }} />
            </div>

            <label className="auth-label">
              {t("reset.newPasswordLabel")}
              <input
                className="auth-input"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                required
              />
            </label>

            <label className="auth-label">
              {t("reset.confirmLabel")}
              <input
                className="auth-input"
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                required
              />
            </label>

            {error && <div className="auth-error">{error}</div>}

            <button className="auth-primary" type="submit" disabled={status === "submitting"}>
              {status === "submitting" ? t("common.updating") : t("reset.submit")}
            </button>

            <p className="auth-switch" style={{ marginTop: 12 }}>
              <Link to="/login" className="auth-link">{t("common.backToLogin")}</Link>
            </p>
          </form>
        )}

        {status === "done" && (
          <div className="auth-success">
            <p>{t("reset.done")}</p>
            <p className="auth-switch" style={{ marginTop: 12 }}>
              <Link to="/login" className="auth-link">{t("reset.goToLogin")}</Link>
            </p>
          </div>
        )}

        {status === "error" && (
          <div>
            <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>

            {/* A WAY FORWARD, NOT A DEAD END.
                This screen used to be a red message and a link, with nowhere
                to type anything — a client who got the mail and pressed the
                button landed here and reported, accurately, that there was
                nowhere to put the code. Whatever went wrong on the way (a
                mail scanner that opened the link first and used up the code,
                an hour gone by, a link copied without its tail), she can
                paste what she has and try again from here. */}
            <form onSubmit={retryWithPasted} className="auth-form">
              <label className="auth-label">
                {t("reset.pasteLabel")}
                <input
                  className="auth-input"
                  type="text"
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder={t("reset.pastePlaceholder")}
                  style={{ direction: "ltr", textAlign: "left" }}
                  autoComplete="off"
                />
              </label>
              <p className="auth-hint" style={{ marginTop: -4, marginBottom: 10 }}>
                {t("reset.pasteHint")}
              </p>
              <button className="auth-primary" type="submit" disabled={!pasted.trim()}>
                {t("reset.pasteSubmit")}
              </button>
            </form>

            <p className="auth-hint" style={{ marginTop: 14 }}>
              {t("reset.linkOnce")}
            </p>
            <p className="auth-switch">
              <Link to="/forgot-password" className="auth-link">{t("reset.requestNew")}</Link>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
