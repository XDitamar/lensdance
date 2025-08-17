import React, { useState } from "react";
import { auth } from "../firebase";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { FaEye, FaEyeSlash } from "react-icons/fa";

export default function ChangePasswordPage() {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const navigate = useNavigate();

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPw !== confirmPw) {
      setError("New passwords do not match");
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user || !user.email) {
        setError("No logged in user");
        return;
      }

      const credential = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPw);

      setSuccess("Password updated successfully ✅");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setTimeout(() => navigate("/"), 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Change Password</h1>
        </div>

        <form onSubmit={handleChangePassword} className="auth-form">
          <label className="auth-label">
            Current Password
            <div className="pw-wrap">
              <input
                className="auth-input"
                type={showCurrent ? "text" : "password"}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                required
              />
              <button type="button" className="eye-btn" onClick={() => setShowCurrent((s) => !s)}>
                {showCurrent ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </label>

          <label className="auth-label">
            New Password
            <div className="pw-wrap">
              <input
                className="auth-input"
                type={showNew ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
              />
              <button type="button" className="eye-btn" onClick={() => setShowNew((s) => !s)}>
                {showNew ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </label>

          <label className="auth-label">
            Confirm New Password
            <div className="pw-wrap">
              <input
                className="auth-input"
                type={showConfirm ? "text" : "password"}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
              />
              <button type="button" className="eye-btn" onClick={() => setShowConfirm((s) => !s)}>
                {showConfirm ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </label>

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <button className="auth-primary" type="submit">Update Password</button>
        </form>
      </div>
    </main>
  );
}
