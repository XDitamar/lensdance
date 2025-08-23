import React, { useEffect, useRef, useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import logo from "./logo.png";
import menu from "./menu.png";

export default function Header() {
  const { t } = useTranslation("common");
  const { user, logout } = useAuth();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const menuRef = useRef(null);
  const btnRef = useRef(null);

  const userMenuRef = useRef(null);
  const userBtnRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      // close mobile menu
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        btnRef.current &&
        !btnRef.current.contains(e.target)
      ) {
        setIsMenuOpen(false);
      }
      // close user dropdown
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target) &&
        userBtnRef.current &&
        !userBtnRef.current.contains(e.target)
      ) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const isAdmin = !!user && user.email === "lensdance29@gmail.com";
  const handleMenuItemClick = () => setIsMenuOpen(false);

  const displayName = user?.displayName || user?.email || "";

  return (
    <header className="navbar">
      {/* Left side: logo + title */}
      <div className="left-side">
        <Link to="/" className="site-logo" onClick={handleMenuItemClick}>
          <img className="logo-img" src={logo} alt={`${t("siteName")} logo`} />
        </Link>
        <div className="site-name">
          <Link to="/" className="site-title" onClick={handleMenuItemClick}>
            {t("siteName")}
          </Link>
        </div>
      </div>

      {/* Center menu (desktop) */}
      <div className="center-menu">
        <nav className="nav-links">
          <NavLink to="/" end onClick={handleMenuItemClick}>
            {t("home")}
          </NavLink>
          <NavLink to="/gallery" onClick={handleMenuItemClick}>
            {t("gallery")}
          </NavLink>
          <NavLink to="/me" onClick={handleMenuItemClick}>
            {t("privateGallery")}
          </NavLink>
          {/* Book Now intentionally NOT here (desktop shouldn’t show it) */}
          {isAdmin && (
            <NavLink to="/admin" onClick={handleMenuItemClick}>
              {t("admin")}
            </NavLink>
          )}
        </nav>
      </div>

      {/* Right side: Book Now + mobile inline auth + desktop account + hamburger */}
      <div className="right-side">
        {/* Mobile-only Book Now */}
        <Link to="/contact" className="book-now-mobile">
          {t("Nook-Now")}
        </Link>

        {/* Mobile-only: Login/Logout placed next to Book Now */}
        <div className="mobile-only mobile-auth-inline">
          {!user ? (
            <Link to="/login" className="auth-btn">
              {t("login")}
            </Link>
          ) : (
            <button className="auth-btn" onClick={logout} type="button">
              {t("logout")}
            </button>
          )}
        </div>

        {/* Desktop auth / account */}
        {!user ? (
          <div className="auth-controls desktop-only">
            <Link to="/login" className="auth-btn">
              {t("login")}
            </Link>
          </div>
        ) : (
          <>
            {/* Desktop account menu (icon + dropdown) */}
            <div className="user-menu desktop-only">
              <button
                ref={userBtnRef}
                type="button"
                className="account-icon"
                aria-haspopup="true"
                aria-expanded={isUserMenuOpen ? "true" : "false"}
                onClick={() => setIsUserMenuOpen((v) => !v)}
                title={displayName}
                style={{ fontSize: 0 }}
              >
                {/* Simple inline SVG user icon */}
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 12c2.761 0 5-2.686 5-6s-2.239-6-5-6-5 2.686-5 6 2.239 6 5 6zm0 2c-4.337 0-8 2.239-8 5v1h16v-1c0-2.761-3.663-5-8-5z"/>
                </svg>
              </button>

              {isUserMenuOpen && (
                <div ref={userMenuRef} className="user-dropdown" role="menu">
                  <div className="user-dropdown-header">
                    <div className="user-name">{displayName}</div>
                    <div className="user-sub">{t("account") || "Account"}</div>
                  </div>

                  <Link
                    to="/change-password"
                    className="dropdown-item"
                    role="menuitem"
                    onClick={() => setIsUserMenuOpen(false)}
                  >
                    {t("changePassword") || "Change Password"}
                  </Link>

                 
                </div>
              )}
            </div>

            {/* (Optional) Keep a separate desktop logout. Remove if you want it ONLY in dropdown. */}
            <button
              className="auth-btn desktop-only"
              onClick={logout}
              type="button"
              aria-label={t("logout")}
            >
              {t("logout")}
            </button>
          </>
        )}

        {/* hamburger for mobile */}
        <button
          ref={btnRef}
          className="hamburger-btn"
          onClick={() => setIsMenuOpen((v) => !v)}
          aria-label={t("menu")}
          aria-expanded={isMenuOpen ? "true" : "false"}
          aria-controls="mobile-menu"
          type="button"
        >
          <img src={menu} alt={t("menu")} />
        </button>
      </div>

      {/* Mobile dropdown (no login/logout here now to avoid duplication) */}
      {isMenuOpen && (
        <div
          ref={menuRef}
          id="mobile-menu"
          className="dropdown-menu"
          role="menu"
        >
          {user && (
            <div
              style={{
                padding: "10px",
                fontWeight: "bold",
                borderBottom: "1px solid #eee",
                marginBottom: "8px",
              }}
            >
              {displayName}
            </div>
          )}

          <NavLink to="/" onClick={handleMenuItemClick} role="menuitem">
            {t("home")}
          </NavLink>
          <NavLink to="/gallery" onClick={handleMenuItemClick} role="menuitem">
            {t("gallery")}
          </NavLink>
          <NavLink to="/me" onClick={handleMenuItemClick} role="menuitem">
            {t("privateGallery")}
          </NavLink>
          <NavLink
            to="/change-password"
            onClick={handleMenuItemClick}
            role="menuitem"
          >
            {t("change-password")}
          </NavLink>

          {isAdmin && (
            <NavLink to="/admin" onClick={handleMenuItemClick} role="menuitem">
              {t("admin")}
            </NavLink>
          )}
        </div>
      )}
    </header>
  );
}
