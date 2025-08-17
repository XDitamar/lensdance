import React from "react";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";

export default function AccountPage() {
  const { user } = useAuth();

  return (
    <div className="container">
      <h2 className="section-title">My Account</h2>
      {user ? (
        <>
          <p>Signed in as: <strong>{user.email}</strong></p>
          <div style={{ marginTop: 20 }}>
            <Link className="auth-primary" to="/change-password">Change password</Link>
          </div>
        </>
      ) : (
        <p>
          You’re not logged in. <Link to="/login" className="auth-link">Sign in</Link>
        </p>
      )}
    </div>
  );
}
