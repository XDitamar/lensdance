import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function ContactPage() {
  const { user } = useAuth();

  // --- Agreement modal state
  const [showAgreement, setShowAgreement] = useState(true);
  const [readChecked, setReadChecked] = useState(false);
  const [agreeChecked, setAgreeChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  // ===== Hebrew agreement text only =====
  const agreementText = `תקנון הזמנת תמונות/סרטונים מתחרויות רכיבה על סוסים

1. כללי:

שירות זה מציע צילום תמונות ו/או סרטונים מאירועי רכיבה על סוסים, וכן אספקת התוצרים ללקוח.

על ידי הזמנת השירות, הלקוח מסכים לתנאים המפורטים בתקנון זה.

2. ביצוע ההזמנה:

הזמנת שירותי הצילום תתבצע בתיאום מראש.

יש לוודא שהפרטים של הלקוח, פרטי הסוס והרוכב, וכן פרטי התחרות והמקצה, מדויקים ומועברים באופן ברור.

3. מועדי אספקה:

מועד אספקה רגיל: התמונות ו/או הסרטונים יישלחו ללקוח בתוך 10 ימי עסקים מיום סיום התחרות.

מועד אספקה במצב חירום: במקרה של מצב חירום במדינה (כגון מלחמה, מבצע צבאי או אסון טבע), מועד האספקה עשוי להתארך. אספקת התמונות תתחדש לאחר תום מצב החירום, בתוספת זמן סביר לעיבוד התמונות. הלקוח יקבל עדכון על שינויים אלה בהקדם האפשרי.

4. איכות ותוכן:

הצילום נעשה באופן מקצועי, אך לא ניתן להבטיח תמונה מושלמת של כל רגע ורגע.

התוצרים שיימסרו ללקוח יעברו עריכה בסיסית וטיוב (כגון תיקון צבע ותאורה) לפי שיקול דעת הצלם.

5. שימוש בתוצרים:

הלקוח רשאי להשתמש בתמונות ו/או בסרטונים לשימוש אישי בלבד, כולל העלאה לרשתות חברתיות.

יש לתת קרדיט לצלם בעת פרסום התמונות ברשתות החברתיות (כגון תיוג או ציון שם).

פרסום על ידי הצלם: עם אישור הלקוח, הצלם רשאי להשתמש בתמונות ו/או סרטונים שבהם הלקוח מופיע, לצורך פרסום עצמי ברשתות חברתיות או באתר האינטרנט של הצלם. 

יש לציין את שם הלקוח בעת הפרסום, בכדי לתת לו קרדיט.

חל איסור על שימוש מסחרי בתוצרים ללא אישור מפורש מראש.

בעת אישור הלקוח פירסום תמונות שלו אני רשאית להשתמש בתמונות ברשתות חברתיות ובאתר 

6. תשלום:

פרטי התשלום יסוכמו מול הלקוח טרם ביצוע הצילום.

התשלום מהווה אישור סופי של הלקוח לתקנון

במידה והלקוח מעוניין לבטל את ההזמנה לפני התחרות (10 שעות לפני תחילת המקצה ), הוא יקבל החזר כספי מלא.

במידה ושולמה מקדמה עבור השירות והתחרות בוטלה מכל סיבה שהיא, המקדמה תוחזר ללקוח במלואה.

במידה והלקוח מבקש החזר כספי לאחר קבלת התמונות/סרטונים, לא יינתן החזר כספי. ניתן להגיש בקשה לבחינת המקרה לגופו, וההחלטה תתקבל בשיקול דעת הצלם.
במידה וההחזר אושר אין ללקוח אישור להשתמש בתמונות שקיבל בלי הסכמת הצלם 
7. התנהלות וכיבוד הדדי:

השירות ניתן על בסיס של כבוד הדדי ותקשורת נעימה.

במידה ולקוח מתנהג בצורה לא מכובדת או פוגענית, הצלם שומר לעצמו את הזכות לבחור שלא להמשיך לספק שירותים ללקוח זה בעתיד.
8. אישור:

התשלום מהווה אישור סופי של הלקוח לתקנון.`;

  async function handleAgree() {
    if (!user) {
      alert("עליך להתחבר כדי להמשיך.");
      return;
    }
    try {
      setSaving(true);
      await setDoc(
        doc(db, "agreements", `${user.uid}_${Date.now()}`), // new doc EVERY time
        {
          email: user.email || null,
          agreedAt: serverTimestamp(),
          language: "he",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        }
      );
      setSaving(false);
      setShowAgreement(false);
    } catch (err) {
      console.error("Error saving agreement:", err);
      setSaving(false);
      alert("ארעה שגיאה בשמירת ההסכמה (בדוק הרשאות Firestore).");
    }
  }

  const canContinue = readChecked && agreeChecked && !saving;

  return (
    <div className="container">
      <h2 className="section-title">Sign Up for the next competition</h2>
      <p>We'd love to hear from you! Fill out the form below ✨</p>

      <div className="google-form-embed" style={{ maxWidth: 700, margin: "0 auto" }}>
        <iframe
          src="https://docs.google.com/forms/d/1e5riv71cOnKm1Z51rPIjXpctAe1sQTAjrHM62Hz-Ahg/viewform?embedded=true"
          width="100%"
          height="800"
          frameBorder="0"
          marginHeight="0"
          marginWidth="0"
          title="Lens Dance Contact"
        >
          Loading…
        </iframe>
      </div>

      {/* Agreement popup */}
      {showAgreement && (
        <div className="agreement-overlay">
          <div className="agreement-modal" dir="rtl">
            <h3 style={{ marginTop: 0 }}>📜 תקנון</h3>

            <div className="agreement-text">
              <pre style={{ margin: 0 }}>{agreementText}</pre>
            </div>

            <label style={{ display: "block", marginTop: 10 }}>
              <input
                type="checkbox"
                checked={readChecked}
                onChange={(e) => setReadChecked(e.target.checked)}
              />{" "}
              קראתי
            </label>

            <label style={{ display: "block", marginTop: 6 }}>
              <input
                type="checkbox"
                checked={agreeChecked}
                onChange={(e) => setAgreeChecked(e.target.checked)}
              />{" "}
              מאשר
            </label>

            <div className="agreement-actions">
              <button
                disabled={!canContinue}
                onClick={handleAgree}
                className="auth-btn"
              >
                {saving ? "שומר..." : "המשך"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
