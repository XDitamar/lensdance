// api/_lib/email.js
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.MAIL_FROM;

export async function sendResetCodeEmail(to, code) {
  if (!FROM_EMAIL) throw new Error("MAIL_FROM is not set");
  const subject = "קוד לאיפוס סיסמה באתר LensDance";
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial">
      <h2 style="margin:0 0 8px">איפוס סיסמה</h2>
      <p>השתמשו בקוד הבא כדי לאפס את הסיסמה:</p>
      <p style="font-size:26px;font-weight:700;letter-spacing:3px">${code}</p>
      <p>הקוד יפוג בעוד 10 דקות.</p>
      <hr style="margin:16px 0;border:none;border-top:1px solid #eee"/>
      <p style="color:#666;font-size:12px">
        המייל נשלח על ידי <strong>lensdance.com</strong>. אם לא ביקשתם איפוס, אפשר להתעלם מהודעה זו.
      </p>
    </div>
  `;
  await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
}
