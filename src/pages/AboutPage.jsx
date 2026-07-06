import React from "react";
import { Link } from "react-router-dom";

export default function AboutPage() {
  return (
    <div style={{ background: "#FAF7F2", minHeight: "100vh", direction: "rtl" }}>

      {/* HEADER */}
      <div style={{ padding: "44px 36px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <div style={{ height: 1, flex: 1, background: "#DDD8CF" }} />
          <div style={{ width: 5, height: 5, border: "1px solid #B2967D", transform: "rotate(45deg)" }} />
          <span style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".24em", textTransform: "uppercase", color: "#B2967D", whiteSpace: "nowrap" }}>
            Field Notes · מי אני
          </span>
          <div style={{ width: 5, height: 5, border: "1px solid #B2967D", transform: "rotate(45deg)" }} />
          <div style={{ height: 1, flex: 1, background: "#DDD8CF" }} />
        </div>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, fontWeight: 400, color: "#2C1E12", marginBottom: 10 }}>
            מי אני
          </h1>
          <div style={{ height: 1, width: 28, background: "#B2967D", margin: "0 auto" }} />
        </div>
      </div>

      {/* PHOTO + BIO */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr", borderTop: "1px solid #E8E0D4", borderBottom: "1px solid #E8E0D4" }}>
        <div style={{ overflow: "hidden", minHeight: 380 }}>
          <img
            src="/pics/portrait.webp"
            alt="אלינה — Lens Dance"
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }}
          />
        </div>
        <div style={{ padding: "44px 44px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 18, background: "#FAF7F2" }}>
          <div>
            <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 22, color: "#2C1E12", marginBottom: 4 }}>אלינה</div>
            <span style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".12em", color: "#B2967D" }}>צלמת סוסים · ישראל ואירופה</span>
          </div>
          <div style={{ height: 1, width: 36, background: "#E2D9CE" }} />
          <p style={{ fontFamily: "Arial, sans-serif", fontSize: 12, lineHeight: 1.95, color: "#4A3525" }}>
            נעים מאוד, אני אלינה והסיפור שלי עם סוסים התחיל הרבה לפני שלקחתי מצלמה ליד. כרוכבת בעברי, אני מכירה מקרוב את הדופק המואץ לפני המקצה, את הקשר השקט עם הסוס ואת השאיפה לשלמות בכל תנועה.
          </p>
          <p style={{ fontFamily: "Arial, sans-serif", fontSize: 11, lineHeight: 1.95, color: "#8A7868" }}>
            השירות הצבאי שלי אמנם יצר הפסקה זמנית ברכיבה, אבל הוא רק חידד אצלי את הצורך להישאר מחוברת לעולם הזה בדרך אחרת. היום, אני בונה את Lens Dance מתוך הזווית שתמיד חיפשתי כרוכבת: צילום נקי, מדויק וחסר פשרות.
          </p>
        </div>
      </div>

      {/* PULL QUOTE */}
      <div style={{ background: "#EDE8DF", padding: "40px 80px", textAlign: "center", borderBottom: "1px solid #DDD8CF" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
          <div style={{ height: 1, flex: 1, background: "#C8B8A8" }} />
          <div style={{ width: 5, height: 5, border: "1px solid #B2967D", transform: "rotate(45deg)", flexShrink: 0 }} />
          <div style={{ height: 1, flex: 1, background: "#C8B8A8" }} />
        </div>
        <p style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 17, color: "#4A3525", lineHeight: 1.75, maxWidth: 480, margin: "0 auto 14px" }}>
          "אני לא כאן כדי לתעד אירוע, אלא כדי ללכוד רגע בזמן — תחושה וזיכרון שיישארו לכל החיים"
        </p>
        <span style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".16em", color: "#B2967D" }}>— אלינה, Lens Dance Photography</span>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 18 }}>
          <div style={{ height: 1, flex: 1, background: "#C8B8A8" }} />
          <div style={{ width: 5, height: 5, border: "1px solid #B2967D", transform: "rotate(45deg)", flexShrink: 0 }} />
          <div style={{ height: 1, flex: 1, background: "#C8B8A8" }} />
        </div>
      </div>

      {/* FULL BIO + Q&A */}
      <div style={{ padding: "40px 36px", maxWidth: 640, margin: "0 auto", width: "100%" }}>
        <p style={{ fontFamily: "Arial, sans-serif", fontSize: 12, lineHeight: 1.95, color: "#4A3525", marginBottom: 32 }}>
          הדגש שלי הוא על יצירתיות, תשומת לב לפרטים הקטנים וסגנון נקי, שמשנים את המשמעות של "תמונה פשוטה" והופכים אותה ליצירת אמנות.
        </p>

        <span style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: "#B2967D" }}>
          שאלות ותשובות
        </span>

        {[
          ["מה הכי אוהבת לצלם?", "קפיצות ראווה — הרגע שבין הסוס לחסם הוא הכי טהור. אבל גם פורטרטים של סוסים — כשהם מסתכלים ישר אליך, כל המילים מיותרות."],
          ["מה מייחד אותך כצלמת סוסים?", "הרקע שלי כרוכבת. אני מכירה את הרגע לפני שהוא קורה — אני יודעת מתי הסוס עומד לקפוץ, מתי הרוכב מתמקד, ואיפה הקסם נמצא."],
          ["גם בחו\"ל?", "כן, עובדת בישראל ואירופה. כל תחרות בחו\"ל היא הרפתקה חדשה — שפה אחרת, אקלים אחר, אבל הסוסים תמיד אותם סוסים."],
        ].map(([q, a]) => (
          <div key={q} style={{ padding: "18px 0", borderBottom: "1px solid #E2D9CE" }}>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 13, color: "#2C1E12", marginBottom: 7 }}>{q}</div>
            <span style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: "#8A7868", lineHeight: 1.85 }}>{a}</span>
          </div>
        ))}

        <div style={{ textAlign: "center", marginTop: 28 }}>
          <Link to="/register" style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: "#4A3525", borderBottom: "1px solid #B2967D", paddingBottom: 2, textDecoration: "none" }}>
            לקביעת צילום →
          </Link>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ background: "#2C1E12", padding: "18px 36px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".18em", textTransform: "uppercase", color: "rgba(255,255,255,.25)" }}>
          © 2025 Lens Dance
        </span>
        <div style={{ display: "flex", gap: 20 }}>
          <span style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".14em", color: "rgba(255,255,255,.4)" }}>Instagram</span>
          <span style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".14em", color: "rgba(255,255,255,.4)" }}>WhatsApp</span>
        </div>
      </div>
    </div>
  );
}