import React, { useState } from "react";
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState("");
  const [newPw,   setNewPw]   = useState("");
  const [confirm, setConfirm] = useState("");
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const doChange = async (e) => {
    e.preventDefault();
    setError(""); setSuccess(false);
    if (newPw.length < 6) { setError("הסיסמה החדשה חייבת להכיל לפחות 6 תווים."); return; }
    if (newPw !== confirm) { setError("הסיסמאות אינן זהות."); return; }
    setLoading(true);
    try {
      const user = auth.currentUser;
      const cred = EmailAuthProvider.credential(user.email, current);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPw);
      setSuccess(true);
      setTimeout(() => navigate("/me"), 2000);
    } catch (err) {
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setError("הסיסמה הנוכחית שגויה.");
      } else {
        setError("אירעה שגיאה. נסי שוב.");
      }
    } finally {
      setLoading(false);
    }
  };

  return <SettingsLayout title="שנה סיסמא" back="/me">
    <form onSubmit={doChange} noValidate>
      <Field label="סיסמה נוכחית">
        <input style={s.input} type="password" value={current}
          placeholder="הכניסי את הסיסמה הנוכחית"
          onChange={e => setCurrent(e.target.value)} required />
      </Field>
      <Field label="סיסמה חדשה">
        <input style={s.input} type="password" value={newPw}
          placeholder="לפחות 6 תווים"
          onChange={e => setNewPw(e.target.value)} required />
      </Field>
      <Field label="אימות סיסמה חדשה">
        <input style={s.input} type="password" value={confirm}
          placeholder="חזרי על הסיסמה החדשה"
          onChange={e => setConfirm(e.target.value)} required />
      </Field>
      {error   && <div style={s.error}>{error}</div>}
      {success && <div style={s.success}>הסיסמה עודכנה בהצלחה ✦</div>}
      <button type="submit" disabled={loading} style={{ ...s.btn, opacity: loading ? 0.65 : 1 }}>
        {loading ? "מעדכן..." : "עדכון סיסמה"}
      </button>
    </form>
  </SettingsLayout>;
}

// ── Shared layout & helpers ────────────────────

function SettingsLayout({ title, back, children }) {
  return (
    <div style={{ background: "#F5F1EA", minHeight: "100vh", display: "flex", flexDirection: "column" }} dir="rtl">
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "60px 24px", flex: 1, width: "100%" }}>

        {/* Back link */}
        <a href={back} style={{
          fontFamily: "Arial, sans-serif", fontSize: 9,
          letterSpacing: ".18em", textTransform: "uppercase",
          color: "#B2967D", textDecoration: "none",
          borderBottom: "1px solid #B2967D", paddingBottom: 1,
          display: "inline-block", marginBottom: 36,
        }}>
          ← חזרה
        </a>

        {/* Title */}
        <div style={{ marginBottom: 32 }}>
          <span style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".22em", textTransform: "uppercase", color: "#B2967D", display: "block", marginBottom: 6 }}>
            Settings
          </span>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 400, color: "#2C1E12", margin: 0 }}>
            {title}
          </h1>
          <div style={{ height: 1, width: 28, background: "#B2967D", marginTop: 14 }} />
        </div>

        {/* Card */}
        <div style={{
          background: "#FDFAF5",
          border: "1px solid #E2D9CE",
          padding: "36px 32px",
        }}>
          {children}
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
  input:   { width: "100%", background: "transparent", border: "none", borderBottom: "1px solid #D7C9B8", padding: "10px 0", fontFamily: "Georgia, serif", fontSize: 13, color: "#2C1E12", outline: "none", direction: "rtl", boxSizing: "border-box" },
  btn:     { width: "100%", background: "#4A3525", color: "#F5F1EA", border: "none", padding: "13px 0", fontFamily: "Arial, sans-serif", fontSize: 10, letterSpacing: ".22em", textTransform: "uppercase", cursor: "pointer", transition: "background .2s", marginTop: 4 },
  error:   { background: "#FFF0EE", border: "1px solid #E8C4BC", color: "#8A2A1F", padding: "10px 14px", fontFamily: "Arial, sans-serif", fontSize: 11, lineHeight: 1.6, marginBottom: 16 },
  success: { background: "#F0F7F0", border: "1px solid #B8D4B8", color: "#2A5A2A", padding: "10px 14px", fontFamily: "Arial, sans-serif", fontSize: 11, lineHeight: 1.6, marginBottom: 16 },
};