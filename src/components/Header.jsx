import React, { useState, useEffect } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { useTranslation } from "react-i18next";
import { isRtlLang } from "../i18n";

const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL || "lensdance29@gmail.com";

// Initial theme: saved choice, else the OS preference.
function getInitialTheme() {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") return saved;
  } catch {}
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

export default function Header() {
  const { t, i18n } = useTranslation();
  const [user] = useAuthState(auth);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);
  const navigate = useNavigate();
  // Dropdowns used to hardcode direction:"rtl"; follow the active language now.
  const dir = isRtlLang(i18n.language) ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("theme", theme); } catch {}
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === "dark" ? "light" : "dark"));

  const isAdmin = !!user && user.email === ADMIN_EMAIL;

  const handleLogout = async () => {
    await signOut(auth);
    setMenuOpen(false);
    navigate("/");
  };

  const closeMenu = () => setMenuOpen(false);

  const linkStyle = ({ isActive }) => ({
    fontFamily: "Arial, sans-serif",
    fontSize: 10,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: isActive ? "var(--link-active)" : "var(--link)",
    textDecoration: "none",
    borderBottom: isActive ? "1px solid var(--link-active)" : "none",
    paddingBottom: isActive ? 2 : 0,
    whiteSpace: "nowrap",
    transition: "color 0.2s",
  });

  return (
    <header style={{
      background: "var(--bg)",
      borderBottom: "1px solid var(--border)",
      position: "sticky",
      top: 0,
      zIndex: 1000,
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 36px",
        minHeight: 56,
        gap: 16,
      }}>

        {/* ── LOGO ── */}
        <Link to="/" style={{ textDecoration: "none", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 1, height: 28, background: "var(--link)" }} />
            <span style={{
              fontFamily: "Georgia, serif",
              fontSize: 13,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: "var(--ink)",
              lineHeight: 1,
            }}>
              LENS DANCE
            </span>
            <div style={{ width: 1, height: 28, background: "var(--link)" }} />
          </div>
        </Link>

        {/* ── DESKTOP NAV ── */}
        <nav style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
          flex: 1,
          justifyContent: "center",
        }}
          className="desktop-nav"
        >
          <NavLink to="/gallery"  style={linkStyle}>{t("nav.gallery")}</NavLink>
          <NavLink to="/pricing"  style={linkStyle}>{t("nav.pricing")}</NavLink>
          <NavLink to="/about"    style={linkStyle}>{t("nav.about")}</NavLink>
          <NavLink to="/register" style={linkStyle}>{t("nav.register")}</NavLink>

          {/* Private gallery — only when signed in */}
          {user && (
            <NavLink to="/me" style={({ isActive }) => ({
              ...linkStyle({ isActive }),
              color: isActive ? "var(--link-active)" : "var(--link-active)",
              fontWeight: 500,
            })}>
              {t("nav.privateGallery")}
            </NavLink>
          )}

          {/* Admin links — admin only */}
          {isAdmin && (
            <>
              <NavLink to="/admin" style={({ isActive }) => ({
                ...linkStyle({ isActive }),
                color: isActive ? "#8A2A1F" : "#8A2A1F",
                fontWeight: 600,
              })}>
                {t("nav.admin")}
              </NavLink>
              <NavLink to="/admin/registrations" style={({ isActive }) => ({
                ...linkStyle({ isActive }),
                color: isActive ? "#8A2A1F" : "#8A2A1F",
                fontWeight: 600,
              })}>
                {t("nav.registrations")}
              </NavLink>
            </>
          )}
        </nav>

        {/* ── RIGHT — Auth ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          {/* Dark mode toggle */}
          <button
            onClick={toggleTheme}
            className="theme-toggle"
            aria-label={theme === "dark" ? t("theme.toLight") : t("theme.toDark")}
            title={theme === "dark" ? t("theme.toLight") : t("theme.toDark")}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>

          {user ? (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setSettingsOpen(o => !o)}
                style={{
                  fontFamily: "Arial, sans-serif",
                  fontSize: 10,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--link-active)",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--link-active)",
                  paddingBottom: 2,
                  cursor: "pointer",
                }}
              >
                {t("auth.settings")}
              </button>

              {settingsOpen && (
                <>
                  {/* backdrop to close on outside click */}
                  <div
                    onClick={() => setSettingsOpen(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 998 }}
                  />
                  <div style={{
                    position: "absolute",
                    top: "calc(100% + 12px)",
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    boxShadow: "0 8px 28px rgba(44,30,18,.1)",
                    minWidth: 180,
                    zIndex: 999,
                    direction: dir,
                  }}>
                    {[
                      { label: t("settings.changeName"),       to: "/change-name" },
                      { label: t("settings.changeDiscipline"), to: "/change-discipline" },
                      { label: t("settings.changePassword"),   to: "/change-password" },
                    ].map(item => (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setSettingsOpen(false)}
                        style={{
                          display: "block",
                          fontFamily: "Arial, sans-serif",
                          fontSize: 10,
                          letterSpacing: "0.12em",
                          color: "var(--muted)",
                          padding: "13px 18px",
                          borderBottom: "1px solid var(--border)",
                          textDecoration: "none",
                          transition: "background .15s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--bg)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        {item.label}
                      </Link>
                    ))}
                    <button
                      onClick={handleLogout}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: dir === "rtl" ? "right" : "left",
                        fontFamily: "Arial, sans-serif",
                        fontSize: 10,
                        letterSpacing: "0.12em",
                        color: "#8A2A1F",
                        padding: "13px 18px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        transition: "background .15s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--border)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      {t("auth.logout")}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Logged out — show the log-in link */
            <Link to="/login" style={{
              fontFamily: "Arial, sans-serif", fontSize: 10,
              letterSpacing: "0.16em", textTransform: "uppercase",
              color: "var(--link-active)", textDecoration: "none",
              borderBottom: "1px solid var(--link-active)", paddingBottom: 2,
            }}>
              {t("auth.login")}
            </Link>
          )}

          {/* ── HAMBURGER (mobile) ── */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="hamburger-btn"
            aria-label={t("nav.menu")}
            style={{
              display: "none", /* shown via CSS on mobile */
              background: "none", border: "none", cursor: "pointer",
              padding: 4, flexDirection: "column", gap: 4,
            }}
          >
            <span style={{ display: "block", width: 20, height: 1, background: "var(--link-active)" }} />
            <span style={{ display: "block", width: 20, height: 1, background: "var(--link-active)" }} />
            <span style={{ display: "block", width: 20, height: 1, background: "var(--link-active)" }} />
          </button>
        </div>
      </div>

      {/* ── MOBILE DROPDOWN ── */}
      {menuOpen && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          background: "var(--bg)", borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          boxShadow: "0 8px 24px rgba(44,30,18,.08)",
          zIndex: 999, direction: dir,
        }}>
          {[
            { to: "/gallery",  label: t("nav.gallery") },
            { to: "/pricing",  label: t("nav.pricing") },
            { to: "/about",    label: t("nav.about") },
            { to: "/register", label: t("nav.register") },
            ...(user ? [{ to: "/me", label: t("nav.privateGallery"), bold: true }] : []),
            ...(isAdmin ? [
              { to: "/admin", label: t("nav.admin"), admin: true },
              { to: "/admin/registrations", label: t("nav.registrations"), admin: true }
            ] : []),
          ].map(item => (
            <Link key={item.to} to={item.to} onClick={closeMenu} style={{
              display: "block",
              fontFamily: "Arial, sans-serif", fontSize: 10,
              letterSpacing: "0.14em", textTransform: "uppercase",
              color: item.admin ? "#8A2A1F" : (item.bold ? "var(--link-active)" : "var(--link)"),
              fontWeight: item.admin ? 600 : (item.bold ? 500 : 400),
              padding: "14px 24px",
              borderBottom: "1px solid var(--border)",
              textDecoration: "none",
            }}>
              {item.label}
            </Link>
          ))}

          {/* Auth row in mobile */}
          <div style={{ padding: "14px 24px" }}>
            {user ? (
              <button onClick={handleLogout} style={{
                fontFamily: "Arial, sans-serif", fontSize: 10,
                letterSpacing: "0.14em", textTransform: "uppercase",
                color: "var(--muted)", background: "transparent",
                border: "none", cursor: "pointer",
              }}>
                {t("auth.signOut", { name: user.displayName || user.email })}
              </button>
            ) : (
              <Link to="/login" onClick={closeMenu} style={{
                fontFamily: "Arial, sans-serif", fontSize: 10,
                letterSpacing: "0.14em", textTransform: "uppercase",
                color: "var(--link-active)", textDecoration: "none",
                borderBottom: "1px solid var(--link-active)", paddingBottom: 2,
              }}>
                {t("auth.login")}
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}