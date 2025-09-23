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

  // Extract oobCode from the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oob = params.get("oobCode") || "";
    setCode(oob);

    if (!oob) {
      setError("קישור לא חוקי לאיפוס סיסמה.");
      setStatus("error");
      return;
    }

    (async () => {
      try {
        const restoredEmail = await verifyPasswordResetCode(auth, oob);
        setEmail(restoredEmail);
        setStatus("ready");
      } catch {
        setError("קישור האיפוס לא תקף או שפג תוקפו.");
        setStatus("error");
      }
    })();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) {
      setError("הסיסמאות אינן תואמות.");
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
      setError("לא ניתן לאפס את הסיסמה. ייתכן שהקישור פג תוקף.");
      setStatus("error");
    }
  };

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-header">
          <p className="auth-subtitle">בחר סיסמה חדשה</p>
          <h1 className="auth-title">איפוס סיסמה</h1>
        </div>

        {status === "verifying" && <div>מאמת קישור…</div>}

        {status === "ready" && (
          <form onSubmit={onSubmit} className="auth-form">
            <div className="auth-hint" style={{ marginBottom: 8 }}>
              מאפס סיסמה עבור <strong>{email}</strong>
            </div>

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
              אשר סיסמה חדשה
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
              {status === "submitting" ? "מעדכן…" : "קבע סיסמה חדשה"}
            </button>

            <p className="auth-switch" style={{ marginTop: 12 }}>
              <Link to="/login" className="auth-link">חזרה להתחברות</Link>
            </p>
          </form>
        )}

        {status === "done" && (
          <div className="auth-success">
            <p>הסיסמה עודכנה. כעת תוכל להתחבר.</p>
            <p className="auth-switch" style={{ marginTop: 12 }}>
              <Link to="/login" className="auth-link">עבור להתחברות</Link>
            </p>
          </div>
        )}

        {status === "error" && (
          <div>
            <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>
            <p className="auth-switch">
              <Link to="/forgot-password" className="auth-link">בקש קישור איפוס חדש</Link>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
