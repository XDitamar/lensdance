// src/pages/ForgotPasswordCodePage.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function ForgotPasswordCodePage() {
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
    setLoading(true); setErr(""); setMsg("");
    try {
      const res = await fetch(`/api/sendRecoveryCode`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ email: email.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "נכשל שליחת קוד.");
      setMsg("אם קיים חשבון עבור הכתובת, נשלח קוד בן 6 ספרות.");
      setStep(2);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const confirm = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(""); setMsg("");
    if (pw !== pw2) {
      setErr("הסיסמאות אינן תואמות.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/confirmRecoveryCode`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ email: email.trim(), code: code.trim(), newPassword: pw })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "נכשל איפוס סיסמה.");
      setMsg("הסיסמה שונתה. אפשר להתחבר כעת.");
      setTimeout(() => navigate("/login", { replace: true, state: { email } }), 800);
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
          <p className="auth-subtitle">איפוס סיסמה באמצעות קוד</p>
          <h1 className="auth-title">שחזור סיסמה</h1>
        </div>

        {step === 1 && (
          <form onSubmit={sendCode} className="auth-form">
            <label className="auth-label">
              אימייל של החשבון
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
              {loading ? "שולח…" : "שלח קוד בן 6 ספרות"}
            </button>

            <p className="auth-switch" style={{ marginTop: 12 }}>
              <Link to="/login" className="auth-link">חזרה להתחברות</Link>
            </p>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={confirm} className="auth-form">
            <label className="auth-label">
              קוד אימות
              <input
                className="auth-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="6 ספרות"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </label>

            <label className="auth-label">
              סיסמה חדשה
              <input
                className="auth-input"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                required
              />
            </label>

            <label className="auth-label">
              אימות סיסמה חדשה
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
              {loading ? "מעדכן…" : "שנה סיסמה"}
            </button>

            <p className="auth-switch" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="auth-link"
                onClick={() => { setStep(1); setErr(""); setMsg(""); }}
              >
                שלח קוד מחדש
              </button>
              {" · "}
              <Link to="/login" className="auth-link">חזרה להתחברות</Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
