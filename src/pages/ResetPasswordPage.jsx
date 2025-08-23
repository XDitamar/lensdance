// src/pages/ResetPasswordPage.jsx
import React, { useEffect, useState } from "react";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "../firebase";
import { Link, useNavigate } from "react-router-dom";

export default function ResetPasswordPage() {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [status, setStatus] = useState("verifying"); // verifying | ready | submitting | done | error
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oob = params.get("oobCode") || "";
    setCode(oob);

    if (!oob) {
      setError("Invalid password reset link.");
      setStatus("error");
      return;
    }

    (async () => {
      try {
        const restoredEmail = await verifyPasswordResetCode(auth, oob);
        setEmail(restoredEmail);
        setStatus("ready");
      } catch {
        setError("This reset link is invalid or expired.");
        setStatus("error");
      }
    })();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) {
      setError("Passwords do not match.");
      return;
    }
    setStatus("submitting");
    setError("");
    try {
      await confirmPasswordReset(auth, code, pw);
      setStatus("done");
      setTimeout(() => navigate("/login", { replace: true, state: { email } }), 800);
    } catch {
      setError("Could not reset password. The link may have expired.");
      setStatus("error");
    }
  };

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-header">
          <p className="auth-subtitle">Choose a new password</p>
          <h1 className="auth-title">Reset password</h1>
        </div>

        {status === "verifying" && <div>Verifying link…</div>}

        {status === "ready" && (
          <form onSubmit={onSubmit} className="auth-form">
            <div className="auth-hint" style={{ marginBottom: 8 }}>
              Resetting password for <strong>{email}</strong>
            </div>

            <label className="auth-label">
              New password
              <input
                className="auth-input"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                required
              />
            </label>

            <label className="auth-label">
              Confirm new password
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
              {status === "submitting" ? "Updating…" : "Set new password"}
            </button>

            <p className="auth-switch" style={{ marginTop: 12 }}>
              <Link to="/login" className="auth-link">Back to sign in</Link>
            </p>
          </form>
        )}

        {status === "done" && (
          <div className="auth-success">
            <p>Password updated. You can sign in now.</p>
            <p className="auth-switch" style={{ marginTop: 12 }}>
              <Link to="/login" className="auth-link">Go to sign in</Link>
            </p>
          </div>
        )}

        {status === "error" && (
          <div>
            <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>
            <p className="auth-switch">
              <Link to="/forgot-password" className="auth-link">Request a new reset link</Link>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
