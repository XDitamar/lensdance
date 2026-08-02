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
  const navigate = useNavigate();

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

    (async () => {
      try {
        const restoredEmail = await verifyPasswordResetCode(auth, oob);
        setEmail(restoredEmail);
        setStatus("ready");
      } catch {
        setError(t("errors.resetLinkExpired"));
        setStatus("error");
      }
    })();
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
            <p className="auth-switch">
              <Link to="/forgot-password" className="auth-link">{t("reset.requestNew")}</Link>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
