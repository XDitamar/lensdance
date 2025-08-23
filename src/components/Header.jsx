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
  const handleMenuItemClick = () => setIsMenuOpen(false);

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
          <NavLink to="/contact" onClick={handleMenuItemClick}>
            {t("Book-Now")}
          </NavLink>
          {/* Book Now intentionally NOT here (desktop shouldn’t show it) */}
          {isAdmin && (
            <NavLink to="/admin" onClick={handleMenuItemClick}>
              {t("admin")}
            </NavLink>
          )}
        </nav>
      </div>

      {/* Right side: mobile Book Now + auth + hamburger */}
      <div className="right-side">
        {/* Mobile-only Book Now (appears next to Login on small screens) */}
        <Link to="/contact" className="book-now-mobile">
          {t("Book-Now")}
        </Link>

        {!user ? (
          <div className="auth-controls">
            <Link to="/login" className="auth-btn">
              {t("login")}
            </Link>
          </div>
        ) : (
          <button
            className="auth-btn"
            onClick={logout}
            type="button"
            aria-label={t("logout")}
          >
            {t("logout")}
          </button>
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

      {/* Mobile dropdown: NO Book Now here (it's on the right bar in mobile) */}
      {isMenuOpen && (
        <div
          ref={menuRef}
          id="mobile-menu"
          className="dropdown-menu"
          role="menu"
        >
          <NavLink to="/" onClick={handleMenuItemClick} role="menuitem">
            {t("home")}
          </NavLink>
          <NavLink to="/gallery" onClick={handleMenuItemClick} role="menuitem">
            {t("gallery")}
          </NavLink>
          <NavLink to="/me" onClick={handleMenuItemClick} role="menuitem">
            {t("privateGallery")}
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
