// src/pages/LoginPage.jsx
import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { Link, useNavigate } from "react-router-dom";
import { FaEye, FaEyeSlash } from "react-icons/fa";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const doLogin = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, pw);
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-header">
          <p className="auth-subtitle">אנא הזן את פרטיך</p>
          <h1 className="auth-title">ברוך שובך</h1>
        </div>

        <form onSubmit={doLogin} className="auth-form">
          <label className="auth-label">
            כתובת אימייל
            <input
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
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
              />
              <button
                type="button"
                className="eye-btn"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? "הסתר סיסמה" : "הצג סיסמה"}
              >
                {showPw ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button className="auth-primary" type="submit">התחברות</button>
        </form>

        {/* קישור חדש: שחזור סיסמה */}
        <p className="auth-switch" style={{ marginTop: 12 }}>
          <Link to="/forgot-password" state={{ email }} className="auth-link">
            שכחת את הסיסמה?
          </Link>
        </p>

        <p className="auth-switch">
          אין לך חשבון?{" "}
          <Link to="/signup" className="auth-link">הירשם</Link>
        </p>
      </div>
    </main>
  );
}
