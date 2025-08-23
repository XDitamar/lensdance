// api/sendRecoveryCode.js
import { authAdmin, db } from "./_lib/firebaseAdmin.js";
import bcrypt from "bcryptjs";
import { sendResetCodeEmail } from "./_lib/email.js";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 דקות
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 3;
const SALT_ROUNDS = 10;

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 ספרות
}

async function rateLimitOk(email) {
  const ref = db.collection("password_recovery_rate").doc(email);
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    let data = snap.exists ? snap.data() : { count: 0, windowStart: now };
    if (now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
      data = { count: 0, windowStart: now };
    }
    data.count += 1;
    tx.set(ref, data);
    if (data.count > RATE_LIMIT_MAX) {
      throw new Error("too-many");
    }
  });
  return true;
}

export default async function handler(req, res) {
  // Vercel: method-based
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const email = String(req.body?.email || "").toLowerCase().trim();
    if (!email) return res.status(400).json({ error: "נדרשת כתובת אימייל." });

    // Rate limit (תשובה כללית כדי לא לחשוף אם יש משתמש כזה)
    try {
      await rateLimitOk(email);
    } catch {
      return res.status(429).json({ error: "יותר מדי בקשות. נסו שוב מאוחר יותר." });
    }

    let user;
    try {
      user = await authAdmin.getUserByEmail(email);
    } catch {
      // לא נחשוף אם אין משתמש – נחזיר הצלחה מזויפת
      return res.json({ ok: true });
    }

    const code = genCode();
    const hash = await bcrypt.hash(code, SALT_ROUNDS);
    const expiresAt = Date.now() + CODE_TTL_MS;

    await db.collection("password_recovery_codes").doc(user.uid).set({
      email,
      hash,
      expiresAt,
      attempts: 0
    });

    await sendResetCodeEmail(email, code);

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "שגיאת שרת." });
  }
}
