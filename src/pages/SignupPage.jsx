import React, { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, storage } from "../firebase";
import { ref, uploadBytes } from "firebase/storage";
import { Link, useNavigate } from "react-router-dom";
import { FaEye, FaEyeSlash } from "react-icons/fa";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // מיפוי קודי שגיאה של Firebase להודעות בעברית
  const errorMessages = {
    "auth/email-already-in-use": "כתובת הדוא\"ל כבר בשימוש.",
    "auth/invalid-email": "כתובת הדוא\"ל אינה תקינה.",
    "auth/weak-password": "הסיסמה חלשה מדי (לפחות 6 תווים).",
    "auth/network-request-failed": "שגיאת רשת. בדקו את החיבור ונסו שוב.",
    "auth/too-many-requests": "בוצעו יותר מדי ניסיונות. נסו שוב מאוחר יותר.",
  };

  const doSignup = async (e) => {
    e.preventDefault();
    setError("");

    if (pw !== confirmPw) {
      setError("הסיסמאות אינן זהות.");
      return;
    }

    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, pw);

      if (name) {
        await updateProfile(user, { displayName: name });
      }

      // יצירת תיקייה ב‑Firebase Storage לפי כתובת הדוא"ל של המשתמש
      const sanitizedEmail = email.replace(/[.#$[\]]/g, "_");
      const placeholderFileRef = ref(storage, `${sanitizedEmail}/.placeholder`);
      const emptyBlob = new Blob([], { type: "text/plain" });
      await uploadBytes(placeholderFileRef, emptyBlob);

      navigate("/");
    } catch (err) {
      const msg = errorMessages[err?.code] || "אירעה שגיאה. נסו שוב.";
      setError(msg);
    }
  };

  return (
    <main className="auth-wrap" dir="rtl" lang="he">
      <div className="auth-card">
        <div className="auth-header">
          <p className="auth-subtitle">אנא הזינו את הפרטים שלכם</p>
          <h1 className="auth-title">צרו חשבון</h1>
        </div>

        <form onSubmit={doSignup} className="auth-form">
          <label className="auth-label">
            שם מלא
            <input
              className="auth-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="הקלידו את שמכם"
              autoComplete="name"
            />
          </label>

          <label className="auth-label">
            דוא"ל
            <input
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="name@example.com"
              autoComplete="email"
              inputMode="email"
            />
          </label>

          <label className="auth-label">
            סיסמה
            <div className="pw-wrap">
              <input
                className="auth-input"
                type={showPw ? "text" : "password"}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                required
                aria-label="סיסמה"
                placeholder="הקלידו סיסמה"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="eye-btn"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? "הסתר סיסמה" : "הצג סיסמה"}
                title={showPw ? "הסתר סיסמה" : "הצג סיסמה"}
              >
                {showPw ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </label>

          <label className="auth-label">
            אימות סיסמה
            <div className="pw-wrap">
              <input
                className="auth-input"
                type={showConfirm ? "text" : "password"}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
                aria-label="אימות סיסמה"
                placeholder="הקלידו שוב את הסיסמה"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="eye-btn"
                onClick={() => setShowConfirm((s) => !s)}
                aria-label={showConfirm ? "הסתר סיסמה" : "הצג סיסמה"}
                title={showConfirm ? "הסתר סיסמה" : "הצג סיסמה"}
              >
                {showConfirm ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button className="auth-primary" type="submit">
            הרשמה
          </button>
        </form>

        <p className="auth-switch">
          כבר יש לכם חשבון? {" "}
          <Link to="/login" className="auth-link">
            התחברו
          </Link>
        </p>
      </div>
    </main>
  );
}
