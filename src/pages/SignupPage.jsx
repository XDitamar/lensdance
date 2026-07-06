import React, { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db, storage } from "../firebase";
import { ref, uploadBytes } from "firebase/storage";
import { Link, useNavigate } from "react-router-dom";

const DISCIPLINES = [
  { id: "jumping",      label: "קפיצות ראווה" },
  { id: "dressage",     label: "דרסאז'" },
  { id: "crosscountry", label: "קרוס קאנטרי" },
  { id: "endurance",    label: "סבולת" },
  { id: "driving",      label: "הרתמה" },
  { id: "other",        label: "אחר" },
];

const ERROR_MAP = {
  "auth/email-already-in-use":   'כתובת הדוא"ל כבר בשימוש.',
  "auth/invalid-email":          'כתובת הדוא"ל אינה תקינה.',
  "auth/weak-password":          "הסיסמה חלשה מדי (לפחות 6 תווים).",
  "auth/network-request-failed": "שגיאת רשת. בדקו את החיבור ונסו שוב.",
  "auth/too-many-requests":      "יותר מדי ניסיונות. נסו שוב מאוחר יותר.",
};

export default function SignupPage() {
  const [name,       setName]       = useState("");
  const [username,   setUsername]   = useState("");
  const [email,      setEmail]      = useState("");
  const [pw,         setPw]         = useState("");
  const [confirmPw,  setConfirmPw]  = useState("");
  const [showPw,     setShowPw]     = useState(false);
  const [showConf,   setShowConf]   = useState(false);
  const [discipline, setDiscipline] = useState("");
  const [error,      setError]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const navigate = useNavigate();

  function validate() {
    if (!name.trim())           return "נא להזין שם מלא.";
    if (!username.trim())       return "נא לבחור שם משתמש.";
    if (username.includes(" ")) return "שם המשתמש לא יכול להכיל רווחים.";
    if (pw.length < 6)          return "הסיסמה חייבת להכיל לפחות 6 תווים.";
    if (pw !== confirmPw)       return "הסיסמאות אינן זהות.";
    return null;
  }

  const doSignup = async (e) => {
    e.preventDefault();
    setError("");
    const err = validate();
    if (err) { setError(err); return; }

    setLoading(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, pw);
      // Save the full name on the Auth profile so the header/admin can show it.
      // Best-effort: profile/folder steps must not fail the whole signup.
      try {
        await updateProfile(user, { displayName: name.trim() });
      } catch (e) { console.warn("updateProfile failed:", e); }
      try {
        await setDoc(doc(db, "users", user.uid), {
          name:       name.trim(),
          username:   username.trim().toLowerCase(),
          email:      user.email,
          discipline: discipline || "other",
          role:       "client",
          createdAt:  new Date(),
        });
      } catch (e) {
        console.error("users doc write failed:", e);
        setError("החשבון נוצר אך שמירת הפרופיל נכשלה (" + (e?.code || e?.message) + "). ניתן לעדכן שם וקטגוריה מתפריט ההגדרות.");
      }
      try {
        const sanitizedEmail = email.replace(/[.#$[\]]/g, "_");
        await uploadBytes(ref(storage, `${sanitizedEmail}/.placeholder`), new Blob([], { type: "text/plain" }));
      } catch (e) { console.warn("placeholder upload failed:", e); }
      navigate("/me");
    } catch (err) {
      console.error("Signup failed:", err);
      setError(ERROR_MAP[err?.code] || "אירעה שגיאה: " + (err?.code || err?.message || "נסו שוב."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: "#F5F1EA", minHeight: "100vh", display: "flex", flexDirection: "column" }} dir="rtl">

      <div style={{ display: "grid", gridTemplateColumns: "5fr 7fr", flex: 1 }}>

        {/* ── Left dark panel ── */}
        <div style={{
          background: "#2C1E12", padding: "52px 44px",
          display: "flex", flexDirection: "column", justifyContent: "center", gap: 18,
        }}>
          <div style={{ width: 36, height: 1, background: "rgba(255,255,255,.2)" }} />
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 400, color: "#F5F1EA", lineHeight: 1.4, margin: 0 }}>
            ברוכים הבאים<br />למשפחת Lens Dance
          </h2>
          <p style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: "rgba(255,255,255,.45)", lineHeight: 1.85, margin: 0 }}>
            צרו חשבון אישי — גישה לגלריה הפרטית, הורדת תמונות, ומעקב אחרי הצילומים מכל תחרות.
          </p>
          <div style={{ width: 36, height: 1, background: "rgba(255,255,255,.2)" }} />
          {["✦ גישה לגלריה האישית שלכם", "✦ הורדת תמונות בלחיצה", "✦ היסטוריית כל התחרויות", "✦ מחירים מותאמים למיקום"].map(t => (
            <span key={t} style={{ fontFamily: "Arial, sans-serif", fontSize: 10, color: "rgba(255,255,255,.35)", letterSpacing: ".04em" }}>{t}</span>
          ))}
        </div>

        {/* ── Right form ── */}
        <div style={{ background: "#FDFAF5", padding: "44px 52px", overflowY: "auto" }}>
          <span style={s.eyebrow}>צרו חשבון</span>
          <h1 style={s.title}>הרשמה</h1>

          <form onSubmit={doSignup} noValidate>

            {/* Name + Username */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              <Field label="שם מלא">
                <input style={s.input} type="text" value={name}
                  placeholder="שם פרטי ומשפחה"
                  onChange={e => setName(e.target.value)} required />
              </Field>
              <Field label="שם משתמש">
                <input style={s.input} type="text" value={username}
                  placeholder="username ללא רווחים"
                  onChange={e => setUsername(e.target.value.replace(/\s/g, ""))} required />
              </Field>
            </div>

            {/* Email */}
            <Field label="אימייל">
              <input style={{ ...s.input, direction: "ltr", textAlign: "left" }}
                type="email" value={email} placeholder="your@email.com"
                onChange={e => setEmail(e.target.value)} required autoComplete="email" />
            </Field>

            {/* Passwords */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              <Field label="סיסמה">
                <div style={{ position: "relative" }}>
                  <input style={{ ...s.input, paddingLeft: 46 }}
                    type={showPw ? "text" : "password"} value={pw}
                    placeholder="לפחות 6 תווים"
                    onChange={e => setPw(e.target.value)} required />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    style={s.toggle}>{showPw ? "הסתר" : "הצג"}</button>
                </div>
              </Field>
              <Field label="אימות סיסמה">
                <div style={{ position: "relative" }}>
                  <input style={{ ...s.input, paddingLeft: 46 }}
                    type={showConf ? "text" : "password"} value={confirmPw}
                    placeholder="חזרו על הסיסמה"
                    onChange={e => setConfirmPw(e.target.value)} required />
                  <button type="button" onClick={() => setShowConf(v => !v)}
                    style={s.toggle}>{showConf ? "הסתר" : "הצג"}</button>
                </div>
              </Field>
            </div>

            {/* Discipline */}
            <Field label="סוג רכיבה">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 8 }}>
                {DISCIPLINES.map(d => (
                  <button key={d.id} type="button" onClick={() => setDiscipline(d.id)}
                    style={{
                      border: `1px solid ${discipline === d.id ? "#B2967D" : "#D7C9B8"}`,
                      background: discipline === d.id ? "#F5F0E8" : "transparent",
                      padding: "10px 6px", cursor: "pointer", transition: "all .2s",
                      fontFamily: "Arial, sans-serif", fontSize: 10,
                      letterSpacing: ".06em", color: "#4A3525",
                    }}>
                    {d.label}
                  </button>
                ))}
              </div>
            </Field>

            {error && <div style={s.error}>{error}</div>}

            <button type="submit" disabled={loading}
              style={{ ...s.btn, opacity: loading ? 0.65 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "יוצר חשבון..." : "יצירת חשבון"}
            </button>
          </form>

          <p style={{ marginTop: 20, textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: 11, color: "#8A7868" }}>
            כבר יש לכם חשבון?{" "}
            <Link to="/login" style={s.link}>התחברו כאן</Link>
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
  title:   { fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 400, color: "#2C1E12", margin: "0 0 28px" },
  input:   { width: "100%", background: "transparent", border: "none", borderBottom: "1px solid #D7C9B8", padding: "10px 0", fontFamily: "Georgia, serif", fontSize: 13, color: "#2C1E12", outline: "none", direction: "rtl", boxSizing: "border-box" },
  btn:     { width: "100%", background: "#4A3525", color: "#F5F1EA", border: "none", padding: "13px 0", fontFamily: "Arial, sans-serif", fontSize: 10, letterSpacing: ".22em", textTransform: "uppercase", cursor: "pointer", transition: "background .2s" },
  link:    { color: "#4A3525", textDecoration: "none", borderBottom: "1px solid #B2967D", paddingBottom: 1, fontFamily: "Arial, sans-serif", fontSize: 11 },
  error:   { background: "#FFF0EE", border: "1px solid #E8C4BC", color: "#8A2A1F", padding: "10px 14px", fontFamily: "Arial, sans-serif", fontSize: 11, lineHeight: 1.6, marginBottom: 16 },
  toggle:  { position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".1em", color: "#B2967D", padding: 0 },
};