import React from "react";

export default function SettingsLayout({ title, back, children }) {
  return (
    <div style={{ background: "#F5F1EA", minHeight: "100vh", display: "flex", flexDirection: "column" }} dir="rtl">
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "60px 24px", flex: 1, width: "100%" }}>

        {/* Back link */}
        <a href={back} style={{
          fontFamily: "Arial, sans-serif", fontSize: 9,
          letterSpacing: ".18em", textTransform: "uppercase",
          color: "#B2967D", textDecoration: "none",
          borderBottom: "1px solid #B2967D", paddingBottom: 1,
          display: "inline-block", marginBottom: 36,
        }}>
          ← חזרה
        </a>

        {/* Title */}
        <div style={{ marginBottom: 32 }}>
          <span style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".22em", textTransform: "uppercase", color: "#B2967D", display: "block", marginBottom: 6 }}>
            Settings
          </span>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 400, color: "#2C1E12", margin: 0 }}>
            {title}
          </h1>
          <div style={{ height: 1, width: 28, background: "#B2967D", marginTop: 14 }} />
        </div>

        {/* Card */}
        <div style={{
          background: "#FDFAF5",
          border: "1px solid #E2D9CE",
          padding: "36px 32px",
        }}>
          {children}
        </div>
      </div>

      <div style={{ background: "#2C1E12", padding: "14px 36px", textAlign: "center" }}>
        <span style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".1em", color: "#4A3A28" }}>
          © 2025 Lens Dance Photography
        </span>
      </div>
    </div>
  );
}