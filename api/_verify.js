// api/_verify.js
//
// Who is calling a Vercel function? The identity check and the admin test that
// api/send-roster.js (and api/_lib/rosterData.js) use.
//
// This file used to also draw, sign and verify prizes for the prize wheel (an
// HMAC with a secret key, api/spin.js, api/verify-prize.js). All of that is gone:
// the wheel's server side now lives in Firebase Cloud Functions (functions/),
// which write the prize documents themselves, so nothing needs signing. See
// functions/lib/wheel.js and firestore.rules (users/{uid}/prizes).

const WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY || "AIzaSyCTL0IcIZ4cXhevCucMDJdTn5SKUArbdw8";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "lensdance29@gmail.com").toLowerCase();

/**
 * Who is calling? The identitytoolkit check, which works where firebase-admin
 * does not. Returns { uid, email } or null.
 */
async function verifyCaller(idToken) {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );
  if (r.status === 400 || r.status === 401 || r.status === 403) return null;
  if (!r.ok) throw new Error(`identitytoolkit HTTP ${r.status}`);
  const data = await r.json();
  const u = data.users?.[0];
  return u?.localId ? { uid: u.localId, email: String(u.email || "").toLowerCase() } : null;
}

const isAdminEmail = (email) => !!email && email === ADMIN_EMAIL;

module.exports = { verifyCaller, isAdminEmail };
