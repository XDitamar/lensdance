// api/_verify.js
//
// Drawing, signing and checking prizes. Shared by api/spin.js (draws and signs
// the prize for one order) and api/verify-prize.js (checks prizes, and checks
// whether one may be redeemed on a given later order).
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FLOW (one spin per order)
// ─────────────────────────────────────────────────────────────────────────────
//  1. A customer submits a registration (an "order"). They may spin for it at
//     once; no deposit is needed to SPIN.
//  2. The draw is DETERMINISTIC per order: the outcome is a function of
//     HMAC(SPIN_SECRET, uid | orderId), mapped onto the weights in
//     ./_prizes.js. Spinning the same order again can only give the same prize,
//     so there is no reroll and no "already used" flag to store (the server
//     cannot write to Firestore). The draw does not look at anything the
//     client sends except the order id, so it cannot be steered.
//  3. The prize is signed over { uid, prizeId, code, issuedAt, validUntil,
//     orderId } and the browser stores it in users/{uid}.prizes.
//  4. It can be REDEEMED only on a LATER order whose deposit is marked paid,
//     never on the order that produced it (canRedeemOn below), and only if it
//     is verified, unexpired and, for the six capped prizes, the customer's
//     earliest one (evaluatePrizes below).
//
// ─────────────────────────────────────────────────────────────────────────────
// HONEST LIMITS
// ─────────────────────────────────────────────────────────────────────────────
// A winner writes their own record to a document they own, so a stored prize
// proves nothing by itself: the HMAC does. A signature cannot prove the
// customer showed us every prize they ever won, which is why the "one capped
// prize per customer" rule is enforced at REDEMPTION (when Alina looks), not at
// spin time. The real fix for all of it is working FIREBASE_* credentials on
// Vercel, so this server can write each result somewhere clients cannot touch.
// Until then, redemption-time verification is the enforcement.

const crypto = require("crypto");
const { TOTAL_WEIGHT, pickPrize, isExpired, isCapped } = require("./_prizes");

const WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY || "AIzaSyCTL0IcIZ4cXhevCucMDJdTn5SKUArbdw8";
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "lensdance-8d29c";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "lensdance29@gmail.com").toLowerCase();

const secret = () => process.env.SPIN_SECRET || null;

/**
 * The signed payload. orderId is the last field and is only present on prizes
 * drawn since orders became the unit: older prizes (signed before that, with
 * no orderId) keep verifying against their original 5-field payload.
 */
const payloadOf = (uid, prizeId, code, issuedAt, validUntil, orderId) =>
  [uid, prizeId, code, issuedAt, validUntil].concat(orderId ? [orderId] : []).join("|");

function hmac(message) {
  const key = secret();
  return key ? crypto.createHmac("sha256", key).update(message).digest("hex") : null;
}

const sign = (payload) => {
  const h = hmac(payload);
  return h ? h.slice(0, 32) : null;
};

/**
 * The prize for one order. Deterministic: the same (uid, orderId) always gives
 * the same prize and the same code. Returns null when SPIN_SECRET is not set
 * (the caller reports "not configured" rather than drawing unsigned prizes).
 *
 * 48 bits of the HMAC mod 1000: the modulo bias is about 4e-12, far below
 * anything the weights can express.
 */
function drawForOrder(uid, orderId) {
  const h = hmac(`draw|${uid}|${orderId}`);
  if (!h) return null;
  const roll = parseInt(h.slice(0, 12), 16) % TOTAL_WEIGHT;
  // No 0/O/1/I: the code gets read aloud and typed from a screenshot.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i += 1) code += alphabet[parseInt(h.slice(12 + i * 2, 14 + i * 2), 16) % alphabet.length];
  return { prize: pickPrize(roll), code: `LD-${code}` };
}

/** Does this prize record carry a signature this server produced for `uid`? */
function isAuthentic(uid, p) {
  if (!p || !p.signature || !p.prizeId || !p.code || !p.issuedAt || !p.validUntil) return false;
  const expected = sign(payloadOf(uid, p.prizeId, p.code, p.issuedAt, p.validUntil, p.orderId));
  if (!expected) return false;
  const a = Buffer.from(String(p.signature));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Judge every prize a customer holds, on its own merits (not yet against a
 * particular order; see canRedeemOn for that).
 *
 *   valid       the signature checks out
 *   expired     past its signed validUntil (Israel date)
 *   capped      one of the six prizes honoured once per customer
 *   redeemable  valid, not expired, not a repeat record for the same order, and
 *               (if capped) the EARLIEST valid capped prize by signed timestamp
 *   reason      why not: "unverified" | "expired" | "duplicate-order" |
 *               "capped-limit" | null
 */
function evaluatePrizes(uid, prizes, now = new Date()) {
  const list = Array.isArray(prizes) ? prizes : [];
  const rows = list.map((p) => ({
    code: p?.code,
    orderId: p?.orderId || null,
    issuedAt: Number(p?.issuedAt) || 0,
    valid: isAuthentic(uid, p),
    expired: isExpired(p?.validUntil, now),
    capped: isCapped(p?.prizeId),
  }));
  const byTime = (a, b) => a.issuedAt - b.issuedAt || String(a.code).localeCompare(String(b.code));

  // One order, one prize: a second record for the same order (the draw is
  // deterministic, so it would be identical, but never rely on that) is dead.
  const firstForOrder = new Map();
  for (const r of rows.filter((x) => x.valid && x.orderId).sort(byTime)) {
    if (!firstForOrder.has(r.orderId)) firstForOrder.set(r.orderId, r);
  }
  const isDuplicate = (r) => !!r.orderId && firstForOrder.get(r.orderId) !== r;

  const firstCapped = rows
    .filter((r) => r.valid && r.capped && !isDuplicate(r))
    .sort(byTime)[0];

  return rows.map((r) => {
    let reason = null;
    if (!r.valid) reason = "unverified";
    else if (r.expired) reason = "expired";
    else if (isDuplicate(r)) reason = "duplicate-order";
    else if (r.capped && r !== firstCapped) reason = "capped-limit";
    return {
      code: r.code,
      orderId: r.orderId,
      valid: r.valid,
      expired: r.expired,
      capped: r.capped,
      redeemable: !reason,
      reason,
    };
  });
}

/**
 * May this prize be spent on this order?
 *   * the order is the customer's own,
 *   * its deposit is marked paid,
 *   * it is not the order the prize was won on, and
 *   * it was placed AFTER the prize was won (issuedAt is the winning order's
 *     submission time; for a prize older than orders, the time it was drawn).
 * `order` = { id, userId, depositPaid, submittedAt (ms) }.
 */
function canRedeemOn(uid, prize, order) {
  if (!order || order.userId !== uid) return { ok: false, reason: "wrong-owner" };
  if (prize.orderId && order.id === prize.orderId) return { ok: false, reason: "same-order" };
  if (order.depositPaid !== true) return { ok: false, reason: "unpaid" };
  if (!(Number(order.submittedAt) > Number(prize.issuedAt))) return { ok: false, reason: "not-later" };
  return { ok: true, reason: null };
}

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

/** Firestore auto-ids are 20 letters and digits. Anything else is not an order. */
const isOrderId = (id) => typeof id === "string" && /^[A-Za-z0-9]{10,40}$/.test(id);

/**
 * Read one registration through the Firestore REST API, as the CALLER (their
 * own ID token is the bearer), so the security rules decide who may see it:
 * an owner reads their own order, the admin reads any. The server needs no
 * credentials of its own, which is the point while firebase-admin is broken.
 *
 *   { status: "ok", order }   the order, normalised
 *   { status: "denied" }      missing, or not readable by this caller (the rules
 *                             answer 403 for both, so they cannot be told apart)
 * Anything else (rules unreachable, 5xx) throws.
 */
async function fetchOrder(orderId, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/registrations/${orderId}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (r.status === 403 || r.status === 404) return { status: "denied" };
  if (!r.ok) throw new Error(`firestore HTTP ${r.status}`);
  const f = (await r.json()).fields || {};
  const ts = f.submittedAt?.timestampValue;
  return {
    status: "ok",
    order: {
      id: orderId,
      userId: f.userId?.stringValue || null,
      depositPaid: f.depositPaid?.booleanValue === true,
      submittedAt: ts ? Date.parse(ts) : null,
    },
  };
}

module.exports = {
  payloadOf, sign, drawForOrder, isAuthentic, evaluatePrizes, canRedeemOn,
  verifyCaller, isAdminEmail, isOrderId, fetchOrder,
};
