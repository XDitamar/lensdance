// api/_verify.js
//
// Signing and checking prizes. Shared by api/spin.js (signs, and checks a
// customer's earlier prizes before a draw) and api/verify-prize.js (checks,
// for the customer's own page and for Alina's admin page).
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS, AND ITS HONEST LIMIT
// ─────────────────────────────────────────────────────────────────────────────
// A winner stores their own prize in `users/{uid}.prizes`, a document they are
// allowed to write, so a record in Firestore proves nothing by itself. Every
// prize therefore carries an HMAC that only this server can produce, over
// { uid, prizeId, code, issuedAt, validUntil }, and Alina's admin page only
// offers "redeemed" on a prize whose signature checks out.
//
// What a signature cannot prove:
//   * that the customer was ENTITLED to the spin, and
//   * that they have shown us every prize they ever won. A client can withhold
//     or delete its history, so the "one capped prize per customer" rule is a
//     best-effort redraw at spin time, and the REAL enforcement is at
//     redemption (evaluatePrizes below), when Alina looks at the record.
//
// The real fix is working FIREBASE_* credentials on Vercel, so that this
// server can write each result to a collection no client can touch. Until
// then, redemption-time verification is the enforcement.

const crypto = require("crypto");
const { isExpired, isCapped } = require("./_prizes");

const WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY || "AIzaSyCTL0IcIZ4cXhevCucMDJdTn5SKUArbdw8";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "lensdance29@gmail.com").toLowerCase();

/** The signed payload. validUntil is inside it, so it cannot be extended by hand. */
const payloadOf = (uid, prizeId, code, issuedAt, validUntil) =>
  `${uid}|${prizeId}|${code}|${issuedAt}|${validUntil}`;

function sign(payload) {
  const secret = process.env.SPIN_SECRET;
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
}

/** Does this prize record carry a signature this server produced for `uid`? */
function isAuthentic(uid, p) {
  if (!p || !p.signature || !p.prizeId || !p.code || !p.issuedAt || !p.validUntil) return false;
  const expected = sign(payloadOf(uid, p.prizeId, p.code, p.issuedAt, p.validUntil));
  if (!expected) return false;
  const a = Buffer.from(String(p.signature));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Judge every prize a customer holds.
 *
 *   valid       the signature checks out
 *   expired     past its signed validUntil (Israel date)
 *   capped      one of the six prizes honoured once per customer
 *   redeemable  valid, not expired, and (if capped) the EARLIEST valid capped
 *               prize by signed timestamp
 *   reason      why not: "unverified" | "expired" | "capped-limit" | null
 */
function evaluatePrizes(uid, prizes, now = new Date()) {
  const list = Array.isArray(prizes) ? prizes : [];
  const rows = list.map((p) => ({
    code: p?.code,
    issuedAt: Number(p?.issuedAt) || 0,
    valid: isAuthentic(uid, p),
    expired: isExpired(p?.validUntil, now),
    capped: isCapped(p?.prizeId),
  }));

  const firstCapped = rows
    .filter((r) => r.valid && r.capped)
    .sort((a, b) => a.issuedAt - b.issuedAt || String(a.code).localeCompare(String(b.code)))[0];

  return rows.map((r) => {
    let reason = null;
    if (!r.valid) reason = "unverified";
    else if (r.expired) reason = "expired";
    else if (r.capped && r !== firstCapped) reason = "capped-limit";
    return { code: r.code, valid: r.valid, expired: r.expired, capped: r.capped, redeemable: !reason, reason };
  });
}

/** Does the customer already hold a capped prize? (Authentic ones only.) */
const holdsCapped = (uid, prizes) =>
  (Array.isArray(prizes) ? prizes : []).some((p) => isCapped(p?.prizeId) && isAuthentic(uid, p));

/**
 * Who is calling? Same identitytoolkit check the other endpoints use; it works
 * where firebase-admin does not. Returns { uid, email } or null.
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

module.exports = {
  payloadOf, sign, isAuthentic, evaluatePrizes, holdsCapped, verifyCaller, isAdminEmail,
};
