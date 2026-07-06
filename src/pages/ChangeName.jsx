import React, { useState, useEffect } from "react";
import { updateProfile } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { useNavigate } from "react-router-dom";

export default function ChangeName() {
  const [user, authLoading] = useAuthState(auth);
  const [name,    setName]    = useState("");
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Seed the field with the current full name once auth resolves. Reading it
  // from `auth.currentUser` directly used to fail on a fresh page load because
  // auth restores asynchronously — so we wait for useAuthState here.
  useEffect(() => {
    if (!user) return;
    setName(user.displayName || "");
    getDoc(doc(db, "users", user.uid))
      .then((snap) => { if (snap.exists() && snap.data().name) setName(snap.data().name); })
      .catch(() => {});
  }, [user]);

  const doChange = async (e) => {
    e.preventDefault();
    setError(""); setSuccess(false);
    if (!user) { setError("צריך להתחבר כדי לשנות שם."); return; }
    if (!name.trim()) { setError("נא להזין שם מלא."); return; }
    setLoading(true);
    try {
      // Best-effort: also mirror the name onto the auth profile (for the header).
      try {
        await updateProfile(user, { displayName: name.trim() });
      } catch (e) {
        console.warn("updateProfile failed:", e);
      }
      // setDoc + merge creates the profile doc if it doesn't exist yet — updateDoc
      // used to throw "No document to update" for older accounts. We also store
      // the email so the admin can match this user to their photo folder.
      await setDoc(
        doc(db, "users", user.uid),
        { name: name.trim(), email: user.email || null },
        { merge: true }
      );
      setSuccess(true);
      setTimeout(() => navigate("/me"), 1400);
    } catch (err) {
      console.error("Failed to update name:", err);
      setError("אירעה שגיאה: " + (err?.code || err?.message || "נסי שוב."));
    } finally {
      setLoading(false);
    }
  };

  return <SettingsLayout title="שנה שם מלא" back="/me">
    {authLoading ? (
      <p style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: "#8A7868" }}>טוען…</p>
    ) : (
      <form onSubmit={doChange} noValidate>
        <Field label="שם מלא">
          <input style={s.input} type="text" value={name}
            placeholder="שם פרטי ומשפחה"
            onChange={e => setName(e.target.value)} required />
        </Field>
        <p style={{ fontFamily: "Arial, sans-serif", fontSize: 10, color: "#8A7868", lineHeight: 1.7, marginTop: -8, marginBottom: 18 }}>
          השם המלא הוא מה שיוצג לצלמת כדי לשייך אליך את התמונות הנכונות.
        </p>
        {error   && <div style={s.error}>{error}</div>}
        {success && <div style={s.success}>השם עודכן בהצלחה ✦</div>}
        <button type="submit" disabled={loading} style={{ ...s.btn, opacity: loading ? 0.65 : 1 }}>
          {loading ? "מעדכן..." : "עדכון שם"}
        </button>
      </form>
    )}
  </SettingsLayout>;
}

// ── Shared layout & helpers ────────────────────

function SettingsLayout({ title, back, children }) {
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

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <label style={{ display: "block", fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: "#B2967D", marginBottom: 8 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const s = {
  input:   { width: "100%", background: "transparent", border: "none", borderBottom: "1px solid #D7C9B8", padding: "10px 0", fontFamily: "Georgia, serif", fontSize: 13, color: "#2C1E12", outline: "none", direction: "rtl", boxSizing: "border-box" },
  btn:     { width: "100%", background: "#4A3525", color: "#F5F1EA", border: "none", padding: "13px 0", fontFamily: "Arial, sans-serif", fontSize: 10, letterSpacing: ".22em", textTransform: "uppercase", cursor: "pointer", transition: "background .2s", marginTop: 4 },
  error:   { background: "#FFF0EE", border: "1px solid #E8C4BC", color: "#8A2A1F", padding: "10px 14px", fontFamily: "Arial, sans-serif", fontSize: 11, lineHeight: 1.6, marginBottom: 16 },
  success: { background: "#F0F7F0", border: "1px solid #B8D4B8", color: "#2A5A2A", padding: "10px 14px", fontFamily: "Arial, sans-serif", fontSize: 11, lineHeight: 1.6, marginBottom: 16 },
};