import React, { useEffect, useRef, useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (!menuRef.current || !btnRef.current) return;
      if (
        !menuRef.current.contains(e.target) &&
        !btnRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const isAdmin = !!user && user.email === "lensdance29@gmail.com";

  return (
    <header className="navbar">
      <div className="logo-container">
        <img className="logo" src="/pics/logo.png" alt="Lens Dance logo" />
        <Link to="/" className="site-title">Lens Dance</Link>
      </div>

      <nav className="nav-links">
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/gallery">Gallery</NavLink>
        <NavLink to="/me">My Pics</NavLink>
        <NavLink to="/contact">Contact</NavLink>
        {isAdmin && <NavLink to="/admin">Admin</NavLink>}
      </nav>

      <div className="auth-controls">
        {!user ? (
          <>
            <Link to="/login" className="auth-btn">Log in</Link>
            <Link to="/signup" className="auth-btn">Sign up</Link>
          </>
        ) : (
          <div className="user-menu">
            <button
              ref={btnRef}
              className="account-icon"
              onClick={() => setOpen((v) => !v)}
              aria-label="Account menu"
              title={user.email}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 12c2.761 0 5-2.686 5-6s-2.239-6-5-6-5 2.686-5 6 2.239 6 5 6zm0 2c-4.418 0-8 2.239-8 5v3h16v-3c0-2.761-3.582-5-8-5z"/>
              </svg>
            </button>

            {open && (
              <div ref={menuRef} className="user-dropdown">
                <div className="user-dropdown-header">
                  <div className="user-name">{user.displayName || user.email.split("@")[0]}</div>
                  <div className="user-sub">{user.email}</div>
                </div>
                {isAdmin && (
                  <NavLink to="/admin" className="dropdown-item" onClick={() => setOpen(false)}>
                    Admin console
                  </NavLink>
                )}
                <NavLink to="/account" className="dropdown-item" onClick={() => setOpen(false)}>
                  Change password
                </NavLink>
                <button className="dropdown-item" onClick={logout}>Logout</button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
