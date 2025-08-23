import React from "react";
import { NavLink, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import logo from "./logo.png";

export default function Header() {
  const { t } = useTranslation("common");
  const { user, logout } = useAuth();

  const isAdmin = !!user && user.email === "lensdance29@gmail.com";

  return (
    <header className="navbar">
      {/* Left: logo + title */}
      <div className="left-side">
        <Link to="/" className="site-logo">
          <img className="logo-img" src={logo} alt={`${t("siteName")} logo`} />
        </Link>
        <div className="site-name">
          <Link to="/" className="site-title">
            {t("siteName")}
          </Link>
        </div>
      </div>

      {/* Center: desktop-style nav (also on mobile) */}
      <div className="center-menu">
        <nav className="nav-links">
          <NavLink to="/" end>{t("home")}</NavLink>
          <NavLink to="/gallery">{t("gallery")}</NavLink>
          <NavLink to="/me">{t("privateGallery")}</NavLink>
          <NavLink to="/contact">{t("bookNow")}</NavLink>
          {isAdmin && <NavLink to="/admin">{t("admin")}</NavLink>}
        </nav>
      </div>

      {/* Right: auth only */}
      <div className="right-side">
        {!user ? (
          <div className="auth-controls">
            <Link to="/login" className="auth-btn">{t("login")}</Link>
          </div>
        ) : (
          <button className="auth-btn" onClick={logout} type="button" aria-label={t("logout")}>
            {t("logout")}
          </button>
        )}
      </div>
    </header>
  );
}
