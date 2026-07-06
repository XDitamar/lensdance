import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { Link, useNavigate } from "react-router-dom";

const ERROR_MAP = {
  "auth/user-not-found":         'לא נמצא חשבון עם דוא"ל זה.',
  "auth/wrong-password":         "סיסמה שגויה.",
  "auth/invalid-email":          'כתובת הדוא"ל אינה תקינה.',
  "auth/too-many-requests":      "יותר מדי ניסיונות. נסו שוב מאוחר יותר.",
  "auth/network-request-failed": "שגיאת רשת. בדקו את החיבור ונסו שוב.",
  "auth/invalid-credential":     "אימייל או סיסמה שגויים.",
};

export default function LoginPage() {
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
      setError(ERROR_MAP[err?.code] || "אירעה שגיאה. נסו שוב.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: "#F5F1EA", minHeight: "100vh", display: "flex", flexDirection: "column" }} dir="rtl">

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", flex: 1 }}>

        {/* ── Left dark panel ── */}
        <div style={{
          background: "#2C1E12", padding: "60px 44px",
          display: "flex", flexDirection: "column", justifyContent: "center", gap: 20,
        }}>
          <div style={{ width: 36, height: 1, background: "rgba(255,255,255,.2)" }} />
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 400, color: "#F5F1EA", lineHeight: 1.4, margin: 0 }}>
            ברוכים השבים<br />ל-Lens Dance
          </h2>
          <p style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 15, color: "rgba(255,255,255,.45)", lineHeight: 1.8, margin: 0 }}>
            "כל סוס הוא עולם<br />בפני עצמו"
          </p>
          <div style={{ width: 36, height: 1, background: "rgba(255,255,255,.2)" }} />
          <span style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".14em", color: "rgba(255,255,255,.25)" }}>
            Lens Dance Photography
          </span>
        </div>

        {/* ── Right form ── */}
        <div style={{ background: "#FDFAF5", padding: "60px 52px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <span style={s.eyebrow}>ברוכה השבה</span>
          <h1 style={s.title}>כניסה לחשבון</h1>

          <form onSubmit={doLogin} noValidate>
            <Field label="אימייל">
              <input
                style={{ ...s.input, direction: "ltr", textAlign: "left" }}
                type="email" value={email} placeholder="your@email.com"
                onChange={e => setEmail(e.target.value)}
                required autoComplete="email"
              />
            </Field>

            <Field label="סיסמה">
              <div style={{ position: "relative" }}>
                <input
                  style={{ ...s.input, paddingLeft: 56 }}
                  type={showPw ? "text" : "password"} value={pw}
                  placeholder="••••••••"
                  onChange={e => setPw(e.target.value)}
                  required autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{
                    position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    fontFamily: "Arial, sans-serif", fontSize: 9,
                    letterSpacing: ".1em", color: "#B2967D", padding: 0,
                  }}
                >
                  {showPw ? "הסתר" : "הצג"}
                </button>
              </div>
            </Field>

            <div style={{ textAlign: "left", marginTop: -10, marginBottom: 24 }}>
              <Link to="/forgot-password" style={s.link}>שכחת סיסמה?</Link>
            </div>

            {error && <div style={s.error}>{error}</div>}

            <button type="submit" disabled={loading} style={{ ...s.btn, opacity: loading ? 0.65 : 1 }}>
              {loading ? "מתחבר..." : "כניסה"}
            </button>
          </form>

          <p style={{ marginTop: 22, textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: 11, color: "#8A7868" }}>
            אין לכם חשבון עדיין?{" "}
            <Link to="/signup" style={s.link}>הירשמו כאן</Link>
          </p>
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
  input:   { width: "100%", background: "transparent", border: "none", borderBottom: "1px solid #D7C9B8", padding: "10px 0", fontFamily: "Georgia, serif", fontSize: 13, color: "#2C1E12", outline: "none", direction: "rtl", boxSizing: "border-box" },
  btn:     { width: "100%", background: "#4A3525", color: "#F5F1EA", border: "none", padding: "13px 0", fontFamily: "Arial, sans-serif", fontSize: 10, letterSpacing: ".22em", textTransform: "uppercase", cursor: "pointer", transition: "background .2s" },
  link:    { color: "#4A3525", textDecoration: "none", borderBottom: "1px solid #B2967D", paddingBottom: 1, fontFamily: "Arial, sans-serif", fontSize: 11 },
  error:   { background: "#FFF0EE", border: "1px solid #E8C4BC", color: "#8A2A1F", padding: "10px 14px", fontFamily: "Arial, sans-serif", fontSize: 11, lineHeight: 1.6, marginBottom: 16 },
};