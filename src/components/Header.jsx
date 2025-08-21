import React, { useEffect, useRef, useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "./logo.png";
import menu from "./menu.png";

export default function Header() {
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const menuRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        btnRef.current &&
        !btnRef.current.contains(e.target)
      ) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const isAdmin = !!user && user.email === "lensdance29@gmail.com";

  const handleMenuItemClick = () => {
    setIsMenuOpen(false);
  };

  return (
    <header className="navbar">
      {/* Left side: logo + title */}
      <div className="left-side">
        <Link to="/" className="site-logo" onClick={handleMenuItemClick}>
          <img className="logo-img" src={logo} alt="Lens Dance logo" />
        </Link>
        <div className="site-name">
          <Link to="/" className="site-title" onClick={handleMenuItemClick}>
            Lens Dance
          </Link>
        </div>
      </div>

      {/* Center menu (desktop) */}
      <div className="center-menu">
        <nav className="nav-links">
          <NavLink to="/" end onClick={handleMenuItemClick}>
            Home
          </NavLink>
          <NavLink to="/gallery" onClick={handleMenuItemClick}>
            Gallery
          </NavLink>
          <NavLink to="/me" onClick={handleMenuItemClick}>
            Private Gallery
          </NavLink>
          <NavLink to="/contact" onClick={handleMenuItemClick}>
            Contact
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" onClick={handleMenuItemClick}>
              Admin
            </NavLink>
          )}
        </nav>
      </div>

      {/* Right side: auth + hamburger (auth stays visible on mobile) */}
      <div className="right-side">
        {!user ? (
          <div className="auth-controls">
            <Link to="/login" className="auth-btn">
              Log in
            </Link>
          </div>
        ) : (
          <button
            className="auth-btn"
            onClick={logout}
            type="button"
            aria-label="Logout"
          >
            Logout
          </button>
        )}

        <button
          ref={btnRef}
          className="hamburger-btn"
          onClick={() => setIsMenuOpen((v) => !v)}
          aria-label="Toggle navigation menu"
          aria-expanded={isMenuOpen ? "true" : "false"}
          aria-controls="mobile-menu"
          type="button"
        >
          <img src={menu} alt="Menu" />
        </button>
      </div>

      {/* Mobile dropdown: ONLY nav links */}
      {isMenuOpen && (
        <div
          ref={menuRef}
          id="mobile-menu"
          className="dropdown-menu"
          role="menu"
        >
          <NavLink to="/" onClick={handleMenuItemClick} role="menuitem">
            Home
          </NavLink>
          <NavLink to="/gallery" onClick={handleMenuItemClick} role="menuitem">
            Gallery
          </NavLink>
          <NavLink to="/me" onClick={handleMenuItemClick} role="menuitem">
            Private Gallery
          </NavLink>
          <NavLink to="/contact" onClick={handleMenuItemClick} role="menuitem">
            Contact
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" onClick={handleMenuItemClick} role="menuitem">
              Admin
            </NavLink>
          )}
        </div>
      )}
    </header>
  );
}
