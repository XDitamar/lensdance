// src/pages/ForgotPasswordPage.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

// ✅ No env vars. Use your absolute Cloud Function URL:
const SEND_RESET_URL = "https://us-central1-<YOUR-PROJECT-ID>.cloudfunctions.net/sendResetEmail";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  const sendCode = async (e) => {
    e.preventDefault();
    setErr(""); setMsg(""); setLoading(true);
    try {
      const res = await fetch(SEND_RESET_URL, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ email: email.trim() })
      });
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const data = ct.includes("application/json") ? await res.json() : { error: await res.text() };
      if (!res.ok) throw new Error(data.error || "Failed to send email");
      setMsg("If an account exists for that address, we’ve emailed a reset link.");
      setStep(2);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const confirm = async (e) => {
    e.preventDefault();
    setErr(""); setMsg(""); setLoading(true);
    if (pw !== pw2) {
      setErr("Passwords do not match.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${SEND_RESET_URL.replace("sendResetEmail","confirmRecoveryCode")}`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ email: email.trim(), code: code.trim(), newPassword: pw })
      });
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const data = ct.includes("application/json") ? await res.json() : { error: await res.text() };
      if (!res.ok) throw new Error(data.error || "Failed to reset password");
      setMsg("Password changed. You can sign in now.");
      setTimeout(() => navigate("/login", { replace: true, state: { email } }), 600);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-header">
          <p className="auth-subtitle">Reset your password</p>
          <h1 className="auth-title">Forgot password</h1>
        </div>

        {step === 1 && (
          <form onSubmit={sendCode} className="auth-form">
            <label className="auth-label">
              Account email
              <input
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </label>
            {err && <div className="auth-error">{err}</div>}
            {msg && <div className="auth-success">{msg}</div>}
            <button className="auth-primary" type="submit" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </button>
            <p className="auth-switch" style={{ marginTop: 12 }}>
              <Link to="/login" className="auth-link">Back to sign in</Link>
            </p>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={confirm} className="auth-form">
            <label className="auth-label">
              Verification code
              <input
                className="auth-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </label>
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
            {err && <div className="auth-error">{err}</div>}
            {msg && <div className="auth-success">{msg}</div>}
            <button className="auth-primary" type="submit" disabled={loading}>
              {loading ? "Updating…" : "Change password"}
            </button>
            <p className="auth-switch" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="auth-link"
                onClick={() => { setStep(1); setErr(""); setMsg(""); }}
              >
                Resend link
              </button>
              {" · "}
              <Link to="/login" className="auth-link">Back to sign in</Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
