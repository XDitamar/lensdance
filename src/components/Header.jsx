import React, { useState, useEffect } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuthState } from "react-firebase-hooks/auth";

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
  const [user] = useAuthState(auth);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);
  const navigate = useNavigate();

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
          <NavLink to="/gallery"  style={linkStyle}>גלריה</NavLink>
          {/* <NavLink to="/contact"  style={linkStyle}>הזמן</NavLink> */}
          <NavLink to="/pricing"  style={linkStyle}>מחירים</NavLink>
          <NavLink to="/about"    style={linkStyle}>מי אני</NavLink>
          <NavLink to="/register" style={linkStyle}>הרשמה לתחרות</NavLink>

          {/* גלריה פרטית — רק כשמחובר */}
          {user && (
            <NavLink to="/me" style={({ isActive }) => ({
              ...linkStyle({ isActive }),
              color: isActive ? "var(--link-active)" : "var(--link-active)",
              fontWeight: 500,
            })}>
              גלריה פרטית
            </NavLink>
          )}

          {/* Admin links — רק עבור אדמין */}
          {isAdmin && (
            <>
              <NavLink to="/admin" style={({ isActive }) => ({
                ...linkStyle({ isActive }),
                color: isActive ? "#8A2A1F" : "#8A2A1F",
                fontWeight: 600,
              })}>
                ניהול
              </NavLink>
              <NavLink to="/admin/registrations" style={({ isActive }) => ({
                ...linkStyle({ isActive }),
                color: isActive ? "#8A2A1F" : "#8A2A1F",
                fontWeight: 600,
              })}>
                הרשמות
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
            aria-label={theme === "dark" ? "מצב בהיר" : "מצב כהה"}
            title={theme === "dark" ? "מצב בהיר" : "מצב כהה"}
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
                Settings
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
                    direction: "rtl",
                  }}>
                    {[
                      { label: "שנה שם",       to: "/change-name" },
                      { label: "שנה קטגוריה", to: "/change-discipline" },
                      { label: "שנה סיסמא",   to: "/change-password" },
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
                        textAlign: "right",
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
                      התנתק
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Logged out — show כניסה */
            <Link to="/login" style={{
              fontFamily: "Arial, sans-serif", fontSize: 10,
              letterSpacing: "0.16em", textTransform: "uppercase",
              color: "var(--link-active)", textDecoration: "none",
              borderBottom: "1px solid var(--link-active)", paddingBottom: 2,
            }}>
              כניסה
            </Link>
          )}

          {/* ── HAMBURGER (mobile) ── */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="hamburger-btn"
            aria-label="תפריט"
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
          zIndex: 999, direction: "rtl",
        }}>
          {[
            { to: "/gallery",  label: "גלריה" },
            // { to: "/contact",  label: "הזמן" },
            { to: "/pricing",  label: "מחירים" },
            // { to: "/about",    label: "אודות" },
            { to: "/register", label: "הרשמה לתחרות" },
            ...(user ? [{ to: "/me", label: "גלריה פרטית", bold: true }] : []),
            ...(isAdmin ? [
              { to: "/admin", label: "ניהול", admin: true },
              { to: "/admin/registrations", label: "הרשמות", admin: true }
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
                יציאה ({user.displayName || user.email})
              </button>
            ) : (
              <Link to="/login" onClick={closeMenu} style={{
                fontFamily: "Arial, sans-serif", fontSize: 10,
                letterSpacing: "0.14em", textTransform: "uppercase",
                color: "var(--link-active)", textDecoration: "none",
                borderBottom: "1px solid var(--link-active)", paddingBottom: 2,
              }}>
                כניסה
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}