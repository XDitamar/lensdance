// api/confirmRecoveryCode.js
import { authAdmin, db } from "./_lib/firebaseAdmin.js";
import bcrypt from "bcryptjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const email = String(req.body?.email || "").toLowerCase().trim();
    const code = String(req.body?.code || "").trim();
    const newPassword = String(req.body?.newPassword || "").trim();

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "יש לספק אימייל, קוד וסיסמה חדשה." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "הסיסמה חייבת להיות באורך 6 תווים לפחות." });
    }

    // מאתרים משתמש
    let user;
    try {
      user = await authAdmin.getUserByEmail(email);
    } catch {
      return res.status(400).json({ error: "קוד שגוי או פג תוקף." });
    }

    const ref = db.collection("password_recovery_codes").doc(user.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(400).json({ error: "קוד שגוי או פג תוקף." });
    }

    const data = snap.data();
    if (Date.now() > data.expiresAt) {
      await ref.delete();
      return res.status(400).json({ error: "הקוד פג תוקף. בקשו קוד חדש." });
    }
    if (data.attempts >= 5) {
      await ref.delete();
      return res.status(400).json({ error: "יותר מדי ניסיונות. בקשו קוד חדש." });
    }

    const ok = await bcrypt.compare(code, data.hash);
    if (!ok) {
      await ref.update({ attempts: (data.attempts || 0) + 1 });
      return res.status(400).json({ error: "קוד שגוי." });
    }

    // הקוד נכון → מעדכנים סיסמה
    await authAdmin.updateUser(user.uid, { password: newPassword });
    await ref.delete();

    // אופציונלי: ביטול רענון טוקנים כדי לנתק התחברויות פעילות
    await authAdmin.revokeRefreshTokens(user.uid);

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "שגיאת שרת." });
  }
}
