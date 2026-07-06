import React, { useState, useEffect } from "react";
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { useGeoPrice } from "../hooks/useGeoPrice";
import { ADMIN_EMAIL } from "../constants";

// Package prices per region (ids must stay the same — the admin page maps them)
const PACKAGES_IL = [
  { id: "photos", label: "תמונות 60 ₪" },
  { id: "video",  label: "סרטון 150₪" },
  { id: "short",  label: "סרטון של מקסימום 15 שניות 70₪" },
];
const PACKAGES_INTL = [
  { id: "photos", label: "Photos — $100 per person" },
  { id: "video",  label: "Video — $350" },
  { id: "short",  label: "Short video (max 15 seconds) — $150" },
];

const TERMS = `תקנון הזמנת תמונות/סרטונים מתחרויות רכיבה על סוסים

1. כללי:
שירות זה מציע צילום תמונות ו/או סרטונים מאירועי רכיבה על סוסים, וכן אספקת התוצר. על ידי הזמנת השירות, הלקוח מסכים לתנאים המפורטים בתקנון זה.

2. ביצוע ההזמנה:
הזמנת שירותי הצילום תתבצע בתיאום מראש. יש לוודא שפרטי הלקוח, פרטי הסוס והרוכב, וכן פרטי התחרות והמקצה — מדויקים.

3. מועדי אספקה:
מועד אספקה רגיל: התמונות ו/או הסרטונים יישלחו ללקוח בתוך 10 ימי עסקים מיום סיום. מועד אספקה במצב חירום: במקרה של מצב חירום במדינה (כגון מלחמה, מבצע צבאי) — המועד יתואם בנפרד.

4. איכות ותוכן:
הצילומים נעשים באופן מקצועי, אך לא ניתן להבטיח תמונה מושלמת של כל רגע ורגע. התוצרים שיימסרו ללקוח יעברו עריכה בסיסית וטיוב (כגון תיקון צבע ותאורה) לפי שיקול הצלמת.

5. שימוש בתוצרים:
הלקוח רשאי להשתמש בתמונות ו/או בסרטונים לשימוש אישי בלבד, כולל העלאה לרשתות החברתיות. יש לתת קרדיט לצלמת בעת פרסום (תיוג או ציון שם). חל איסור על שימוש מסחרי בתוצרים ללא אישור מפורש מראש. בעת אישור פרסום — הצלמת רשאית להשתמש בתמונות לצרכי שיווק תוך ציון שם הלקוח.

6. תשלום:
פרטי התשלום יסוכמו מול הלקוח טרם ביצוע הצילומים. התשלום מהווה אישור סופי של הלקוח לתקנון. ביטול עד 10 שעות לפני התחרות — המקדמה תוחזר. ביטול פחות מ-10 שעות לפני, או אי הגעה — המקדמה לא תוחזר. לאחר קבלת התמונות/סרטונים — לא יינתן החזר כספי.

7. התנהלות וכיבוד הדדי:
השירות ניתן על בסיס של כבוד הדדי ותקשורת נעימה. במידה ולקוח מתנהג בצורה לא מכובדת, הצלמת שומרת לעצמה את הזכות לסרב לשירות.

8. אישור:
התשלום מהווה אישור סופי של הלקוח לתקנון.`;

export default function CompetitionPage() {
  const [user] = useAuthState(auth);
  const isAdmin = user?.email === ADMIN_EMAIL;
  const { isIsrael } = useGeoPrice();
  const packages = isIsrael === false ? PACKAGES_INTL : PACKAGES_IL;

  // Competition title state
  const [title, setTitle] = useState("טוען...");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // Terms state
  const [termsRead, setTermsRead] = useState(false);
  const [termsApproved, setTermsApproved] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [form, setForm] = useState({
    day: "",
    riderName: "",
    horseName: "",
    deposit: "",
    packages: [],
    contact: "",
    receiptWanted: "",
    publishPermission: "",
    underAge: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load competition title from Firestore
  useEffect(() => {
    getDoc(doc(db, "settings", "competition")).then(snap => {
      if (snap.exists()) {
        setTitle(snap.data().title || "תחרות קפיצות");
        setTitleDraft(snap.data().title || "");
      }
    });
  }, []);

  // Admin: save new title
  const saveTitle = async () => {
    await setDoc(doc(db, "settings", "competition"), { title: titleDraft }, { merge: true });
    setTitle(titleDraft);
    setEditingTitle(false);
  };

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const togglePkg = pkg => setForm(f => ({
    ...f,
    packages: f.packages.includes(pkg)
      ? f.packages.filter(p => p !== pkg)
      : [...f.packages, pkg],
  }));

  const validate = () => {
    if (!form.day)            return "נא לבחור יום תחרות.";
    if (!form.riderName.trim()) return "נא להזין שם רוכב/ת.";
    if (!form.horseName.trim()) return "נא להזין שם וקוד סוס.";
    if (!form.deposit.trim())   return "נא להזין פרטי מקדמה.";
    if (form.packages.length === 0) return "נא לבחור חבילה אחת לפחות.";
    if (!form.contact.trim())   return "נא להזין פרטי יצירת קשר.";
    if (!form.receiptWanted)    return "נא לבחור אם תרצו קבלה.";
    if (!form.publishPermission) return "נא לבחור העדפת פרסום.";
    if (!termsApproved)         return "נא לאשר את התקנון.";
    return null;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError("");
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    try {
      await addDoc(collection(db, "registrations"), {
        ...form,
        competitionTitle: title,
        userId: user?.uid || null,
        submittedAt: serverTimestamp(),
      });
      setSubmitted(true);
    } catch {
      setError("אירעה שגיאה. נסו שוב.");
    } finally {
      setLoading(false);
    }
  };

  // ── TERMS PAGE ──
  if (!showForm) {
    return (
      <Page>
        <TitleBlock title={title} isAdmin={isAdmin}
          editingTitle={editingTitle} titleDraft={titleDraft}
          setEditingTitle={setEditingTitle} setTitleDraft={setTitleDraft}
          saveTitle={saveTitle} />

        {/* Intro text */}
        <div style={{ background: "#FDFAF5", border: "1px solid #E2D9CE", padding: "28px 32px", marginBottom: 24, direction: "rtl", lineHeight: 1.85 }}>
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 12, color: "#4A3525", marginBottom: 14 }}>
            📋 אם אתם רוצים שאצלם אתכם, מוזמנים למלא את הטופס הבא.<br />
            עדיפות ליצירת קשר בוואטסאפ <strong>0525078189</strong> — lens.dance או דרך האינסטגרם :)
          </p>
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 12, color: "#4A3525", marginBottom: 14 }}>
            לאור המרחק והמאמץ לעריכת כל תמונה ותמונה — הבטחת ההרשמה כרוכה בתשלום מקדמה.
          </p>
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#8A2A1F", fontWeight: 600 }}>
            ❗ מי שלא יירשם לא יצולם בימי התחרות<br />
            ❗ ההרשמה כרוכה בתשלום מקדמה סמלי, לאור המרחק<br />
            ❗ אין החזר כספי לאחר קבלת תמונה ותמונה<br />
          </p>
        </div>

        {/* Terms box */}
        <div style={{ marginBottom: 20 }}>
          <label style={s.label}>תקנון — נא לקרוא לפני ההמשך</label>
          <div style={{
            background: "#F5F1EA", border: "1px solid #D7C9B8",
            padding: "16px 18px", height: 200, overflowY: "auto",
            fontFamily: "Arial,sans-serif", fontSize: 11, color: "#4A3525",
            lineHeight: 1.85, direction: "rtl", whiteSpace: "pre-line",
          }}>
            {TERMS}
          </div>
        </div>

        {/* Terms checkboxes */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, direction: "rtl", marginBottom: 28 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontFamily: "Arial,sans-serif", fontSize: 12, color: "#4A3525" }}>
            <input type="checkbox" checked={termsRead} onChange={e => setTermsRead(e.target.checked)}
              style={{ accentColor: "#B2967D", width: 15, height: 15 }} />
            קראתי את התקנון
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontFamily: "Arial,sans-serif", fontSize: 12, color: "#4A3525" }}>
            <input type="checkbox" checked={termsApproved} onChange={e => setTermsApproved(e.target.checked)}
              style={{ accentColor: "#B2967D", width: 15, height: 15 }} />
            אני מאשר/ת את התקנון
          </label>
        </div>

        <button
          disabled={!termsRead || !termsApproved}
          onClick={() => setShowForm(true)}
          style={{ ...s.btn, opacity: (!termsRead || !termsApproved) ? 0.45 : 1, cursor: (!termsRead || !termsApproved) ? "not-allowed" : "pointer" }}
        >
          המשך לטופס ההרשמה →
        </button>
      </Page>
    );
  }

  // ── SUCCESS ──
  if (submitted) {
    return (
      <Page>
        <div style={{ textAlign: "center", padding: "40px 0", direction: "rtl" }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>✦</div>
          <h2 style={{ fontFamily: "Georgia,serif", fontSize: 22, fontWeight: 400, color: "#2C1E12", marginBottom: 14 }}>
            ההרשמה התקבלה!
          </h2>
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 12, color: "#8A7868", lineHeight: 1.85, marginBottom: 10 }}>
            שימו לב! לפני שאתם עוזבים תודאו שקראתם את התקנון ומסכימים ומסכימות 😊<br />
            לפרטים בנוגע למחירי חבילות צילום מוזמנים לשלוח הודעה באתר / באינסטגרם / בוואטסאפ
          </p>
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#B2967D" }}>
            נחזור אליכם בהקדם לאישור ♡
          </p>
        </div>
      </Page>
    );
  }

  // ── FORM ──
  return (
    <Page>
      <TitleBlock title={title} isAdmin={isAdmin}
        editingTitle={editingTitle} titleDraft={titleDraft}
        setEditingTitle={setEditingTitle} setTitleDraft={setTitleDraft}
        saveTitle={saveTitle} />

      <form onSubmit={handleSubmit} noValidate style={{ direction: "rtl" }}>

        {/* Day */}
        <Field label="איזה ימים את/ה מתחרה? *">
          {["חמישי", "שישי", "רביעי"].map(d => (
            <label key={d} style={s.radioLabel}>
              <input type="radio" name="day" value={d}
                checked={form.day === d} onChange={set("day")}
                style={{ accentColor: "#B2967D" }} />
              {d}
            </label>
          ))}
        </Field>

        {/* Rider name */}
        <Field label="שם הרוכב/ת *">
          <input style={s.input} type="text" value={form.riderName}
            placeholder="שם פרטי ומשפחה"
            onChange={set("riderName")} required />
        </Field>

        {/* Horse name + number */}
        <Field label="שם ומספר סוס/ה *">
          <input style={s.input} type="text" value={form.horseName}
            placeholder="שם הסוס + מספר מקצה אם ידוע"
            onChange={set("horseName")} required />
        </Field>

        {/* Deposit */}
        <Field label="מקדמה + כניסה אם יש *">
          <input style={s.input} type="text" value={form.deposit}
            placeholder="סכום המקדמה + דמי כניסה אם רלוונטי"
            onChange={set("deposit")} required />
        </Field>

        {/* Package selection */}
        <Field label="שימו לב גם אי אפשר זה מוריד איכות לתמונות *">
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 10, color: "#8A7868", marginBottom: 10, lineHeight: 1.65 }}>
            אני שולחת את התמונות דרך האתר שלי — כדי שתוכלו לקבל אותן תצטרכו לפתוח חשבון באתר
            (אם אתם מסתבכים תמיד מזמינים לשלוח לי הודעה ואעזור לכם).
            שימו לב שאני שולחת את התמונות גם לענף קפיצות ולפעמים גם לחווה שבה היתה התחרות.
          </p>
          {packages.map(pkg => (
            <label key={pkg.id} style={s.checkLabel}>
              <input type="checkbox"
                checked={form.packages.includes(pkg.id)}
                onChange={() => togglePkg(pkg.id)}
                style={{ accentColor: "#B2967D", width: 15, height: 15 }} />
              {pkg.label}
            </label>
          ))}
        </Field>

        {/* Contact */}
        <Field label="דרך ליצירת קשר (טלפון/אינסטגרם וכו) *">
          <input style={s.input} type="text" value={form.contact}
            placeholder="טלפון / @instagram / וואטסאפ"
            onChange={set("contact")} required />
        </Field>

        {/* Receipt */}
        <Field label="קבלת קבלה לאחר תשלום *">
          {[{ v: "yes", l: "כן אשמח" }, { v: "no", l: "לא" }].map(o => (
            <label key={o.v} style={s.radioLabel}>
              <input type="radio" name="receipt" value={o.v}
                checked={form.receiptWanted === o.v} onChange={set("receiptWanted")}
                style={{ accentColor: "#B2967D" }} />
              {o.l}
            </label>
          ))}
        </Field>

        {/* Publish permission */}
        <Field label="אישור פרסום — האם אתם נותנים לי אישור לפרסם את התמונות בעמוד האינסטגרם / טיקטוק שלי? *">
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 10, color: "#8A7868", marginBottom: 10, lineHeight: 1.65 }}>
            *אם בחרתם בתשובה "לא" אתם יכולים להיות בטוחים ב-100% שלא אפרסם.<br />
            **במידה ואתם מתחת לגיל 16 נדרש אישור הורה
          </p>
          {[
            { v: "yes",      l: "כן, אני מאשר/ת פרסום" },
            { v: "no",       l: "לא, רוצה לשמור על פרטיות" },
            { v: "underage", l: "אני מתחת לגיל 16 ומאשר/ת פרסום (אם בחרת בזה אני מחויבת לאישור הורה)" },
          ].map(o => (
            <label key={o.v} style={s.checkLabel}>
              <input type="checkbox"
                checked={form.publishPermission === o.v}
                onChange={() => setForm(f => ({ ...f, publishPermission: o.v }))}
                style={{ accentColor: "#B2967D", width: 15, height: 15 }} />
              {o.l}
            </label>
          ))}
        </Field>

        {/* Terms reminder */}
        <div style={{ background: "#EDE8DF", border: "1px solid #D7C9B8", padding: "14px 18px", marginBottom: 22 }}>
          <p style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#4A3525", lineHeight: 1.7 }}>
            ✓ קראת ואישרת את התקנון בשלב הקודם. התשלום מהווה אישור סופי.
          </p>
        </div>

        {error && <div style={s.error}>{error}</div>}

        <button type="submit" disabled={loading}
          style={{ ...s.btn, opacity: loading ? 0.65 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "שולח הרשמה..." : "שליחת הרשמה ✦"}
        </button>

      </form>
    </Page>
  );
}

// ── Shared layout ──────────────────────────────
function Page({ children }) {
  return (
    <div style={{ background: "#F5F1EA", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "48px 24px", flex: 1, width: "100%" }}>
        {children}
      </div>
      <div style={{ background: "#2C1E12", padding: "14px 36px", textAlign: "center" }}>
        <span style={{ fontFamily: "Arial,sans-serif", fontSize: 9, letterSpacing: ".1em", color: "#4A3A28" }}>
          © 2025 Lens Dance Photography
        </span>
      </div>
    </div>
  );
}

function TitleBlock({ title, isAdmin, editingTitle, titleDraft, setEditingTitle, setTitleDraft, saveTitle }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 32, direction: "rtl" }}>
      <span style={{ fontFamily: "Arial,sans-serif", fontSize: 9, letterSpacing: ".22em", textTransform: "uppercase", color: "#B2967D", display: "block", marginBottom: 8 }}>
        הרשמה לצילום
      </span>
      {editingTitle ? (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            style={{ fontFamily: "Georgia,serif", fontSize: 20, border: "none", borderBottom: "2px solid #B2967D", background: "transparent", outline: "none", color: "#2C1E12", textAlign: "center", minWidth: 260 }}
          />
          <button onClick={saveTitle} style={{ ...s.btn, padding: "8px 18px", fontSize: 10 }}>שמור</button>
          <button onClick={() => setEditingTitle(false)} style={{ fontFamily: "Arial,sans-serif", fontSize: 10, color: "#B2967D", background: "none", border: "none", cursor: "pointer" }}>ביטול</button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <h1 style={{ fontFamily: "Georgia,serif", fontSize: 24, fontWeight: 400, color: "#2C1E12", margin: 0 }}>{title}</h1>
          {isAdmin && (
            <button onClick={() => { setEditingTitle(true); setTitleDraft(title); }}
              title="ערוך כותרת (אדמין בלבד)"
              style={{ background: "none", border: "none", cursor: "pointer", color: "#B2967D", fontSize: 14 }}>
              ✏️
            </button>
          )}
        </div>
      )}

      {/* Admin link — only visible to admin */}
      {isAdmin && (
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <a href="/admin/registrations" style={{
            fontFamily: "Arial, sans-serif",
            fontSize: 9,
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: "#B2967D",
            textDecoration: "none",
            borderBottom: "1px solid #B2967D",
            paddingBottom: 1,
          }}>
            ← צפייה ברשימות הרשמה
          </a>
        </div>
      )}

      <div style={{ height: 1, width: 36, background: "#B2967D", margin: "14px auto 0" }} />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <label style={s.label}>{label}</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>{children}</div>
    </div>
  );
}

const s = {
  label:      { display: "block", fontFamily: "Arial,sans-serif", fontSize: 9, letterSpacing: ".18em", textTransform: "uppercase", color: "#B2967D", marginBottom: 4 },
  input:      { width: "100%", background: "transparent", border: "none", borderBottom: "1px solid #D7C9B8", padding: "10px 0", fontFamily: "Georgia,serif", fontSize: 13, color: "#2C1E12", outline: "none", direction: "rtl", boxSizing: "border-box" },
  radioLabel: { display: "flex", alignItems: "center", gap: 10, fontFamily: "Arial,sans-serif", fontSize: 12, color: "#4A3525", cursor: "pointer" },
  checkLabel: { display: "flex", alignItems: "flex-start", gap: 10, fontFamily: "Arial,sans-serif", fontSize: 12, color: "#4A3525", cursor: "pointer", lineHeight: 1.6 },
  btn:        { width: "100%", background: "#4A3525", color: "#F5F1EA", border: "none", padding: "13px 0", fontFamily: "Arial,sans-serif", fontSize: 10, letterSpacing: ".22em", textTransform: "uppercase", cursor: "pointer", transition: "background .2s" },
  error:      { background: "#FFF0EE", border: "1px solid #E8C4BC", color: "#8A2A1F", padding: "10px 14px", fontFamily: "Arial,sans-serif", fontSize: 11, lineHeight: 1.6, marginBottom: 16 },
};