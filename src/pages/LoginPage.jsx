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
            <p className="auth-subtitle">Please enter your details</p>
            <h1 className="auth-title">Welcome back</h1>
          </div>

          <form onSubmit={doLogin} className="auth-form">
            <label className="auth-label">
              Email address
              <input
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="auth-label">
              Password
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
                >
                  {showPw ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </label>

            {error && <div className="auth-error">{error}</div>}

            <button className="auth-primary" type="submit">Sign in</button>
          </form>

          <p className="auth-switch">
            Don’t have an account?{" "}
            <Link to="/signup" className="auth-link">Sign up</Link>
          </p>
        </div>
      </main>
    );
  }
