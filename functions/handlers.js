// functions/handlers.js
//
// The three callables of the prize wheel, as a factory over injected
// dependencies (the database, the clock, the error class), so that the logic can
// be tested with a fake Firestore. functions/index.js builds the real thing.
//
//   spin            a customer spins ONE order (or an admin/tester spins a TEST)
//   redeemPrize     the admin spends a prize on a later, paid order
//   savePrizeExtra  the winner gives the details the team / jackpot prizes need
//
// Every write goes through the Admin SDK inside a transaction, and
// firestore.rules lets clients only READ users/{uid}/prizes, so a prize document
// is genuine by construction. Errors are HttpsError whose `details` is a short
// machine code the page turns into a friendly message.

const { ADMIN_EMAIL } = require("./config");
const W = require("./lib/wheel");
const { PRIZES } = require("./prizes");

/** machine code -> HttpsError code */
const CODES = {
  "not-signed-in": "unauthenticated",
  "wheel-ended": "failed-precondition",
  "bad-order": "invalid-argument",
  "bad-request": "invalid-argument",
  "order-not-found": "not-found",
  "order-not-yours": "permission-denied",
  "order-too-late": "failed-precondition",
  "not-tester": "permission-denied",
  "not-admin": "permission-denied",
  "prize-not-found": "not-found",
  "already-submitted": "already-exists",
  // redemption reasons (functions/lib/wheel.js checkRedeem)
  "already-redeemed": "failed-precondition",
  expired: "failed-precondition",
  "capped-limit": "failed-precondition",
  "wrong-owner": "failed-precondition",
  "same-order": "failed-precondition",
  unpaid: "failed-precondition",
  "not-later": "failed-precondition",
  // extra details (validateExtra)
  "wrong-type": "failed-precondition",
  consent: "invalid-argument",
  count: "invalid-argument",
  incomplete: "invalid-argument",
  contact: "invalid-argument",
  duplicate: "invalid-argument",
  same: "invalid-argument",
};

const MESSAGES = {
  "not-signed-in": "Please sign in.",
  "wheel-ended": "The wheel has ended.",
  "not-tester": "Test spins are not available for this account.",
  "not-admin": "Only the admin can do this.",
};

const isOrderId = (id) => typeof id === "string" && /^[A-Za-z0-9]{10,40}$/.test(id);
const isUid = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id);
const lower = (s) => String(s || "").trim().toLowerCase();
const toMs = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : null);

/**
 * @param {object} deps
 *   db               Firestore (Admin SDK or a fake): doc(), collection(), runTransaction()
 *   HttpsError       firebase-functions' error class
 *   now              () => Date
 *   serverTimestamp  () => the field value that stamps the server's time
 *   testEmails       () => comma-separated emails allowed to run TEST spins, besides the admin
 *   randomInt        optional, for tests
 */
function makeHandlers({ db, HttpsError, now, serverTimestamp, testEmails, randomInt }) {
  const fail = (machine) => new HttpsError(CODES[machine] || "internal", MESSAGES[machine] || machine, machine);

  const requireUser = (request) => {
    if (!request.auth || !request.auth.uid) throw fail("not-signed-in");
    return { uid: request.auth.uid, email: lower(request.auth.token && request.auth.token.email) };
  };
  const requireAdmin = (request) => {
    const user = requireUser(request);
    if (user.email !== ADMIN_EMAIL) throw fail("not-admin");
    return user;
  };
  const isTester = (email) =>
    !!email && (email === ADMIN_EMAIL || lower(testEmails()).split(",").map((s) => s.trim()).filter(Boolean).includes(email));

  const prizePath = (uid, orderId) => `users/${uid}/prizes/${orderId}`;
  const shape = (d) => ({
    prize: { id: d.prizeId, label: d.label, tier: d.tier },
    code: d.code,
    validUntil: d.validUntil,
    orderId: d.orderId,
    index: PRIZES.findIndex((p) => p.id === d.prizeId),
  });

  /* ── spin ──────────────────────────────────────────────────────────────── */
  async function spin(request) {
    const { uid, email } = requireUser(request);
    const data = request.data || {};

    // A TEST spin: only the exact value `true` (a click event or the string
    // "true" is a real spin and fails as one). Draws with the real weights,
    // writes NOTHING, needs no order, ignores the end date.
    if (data.test === true) {
      if (!isTester(email)) throw fail("not-tester");
      const prize = W.drawPrize(randomInt);
      return {
        test: true,
        prize: { id: prize.id, label: prize.label, tier: prize.tier },
        code: "TEST",
        validUntil: null,
        orderId: null,
        index: PRIZES.findIndex((p) => p.id === prize.id),
      };
    }

    const { orderId } = data;
    if (!isOrderId(orderId)) throw fail("bad-order");
    if (!W.wheelOpen(now())) throw fail("wheel-ended");

    return db.runTransaction(async (tx) => {
      // The existence of this document IS "this order has been spun": a retry, a
      // double click or a second tab gets the stored prize back, never a new draw.
      const prizeRef = db.doc(prizePath(uid, orderId));
      const existing = await tx.get(prizeRef);
      if (existing.exists) return shape(existing.data());

      const orderSnap = await tx.get(db.doc(`registrations/${orderId}`));
      const o = orderSnap.exists ? orderSnap.data() : null;
      const reason = W.checkSpinOrder({
        uid,
        order: o && { userId: o.userId || null, submittedAtMs: toMs(o.submittedAt) },
        now: now(),
      });
      if (reason) throw fail(reason);

      const prize = W.drawPrize(randomInt);
      const doc = {
        prizeId: prize.id,
        label: prize.label,
        tier: prize.tier,
        code: W.makeCode(randomInt),
        orderId,
        // The ORDER's time, not "now": redemption compares it with "a later order".
        issuedAt: toMs(o.submittedAt),
        createdAt: serverTimestamp(),
        validUntil: W.PRIZE_VALID_UNTIL,
        redeemed: null,
        extra: null,
      };
      tx.create(prizeRef, doc);
      return shape(doc);
    });
  }

  /* ── redeemPrize (admin) ───────────────────────────────────────────────── */
  async function redeemPrize(request) {
    const admin = requireAdmin(request);
    const { uid, orderId, onOrderId, undo } = request.data || {};
    if (!isUid(uid) || !isOrderId(orderId) || (undo !== true && !isOrderId(onOrderId))) throw fail("bad-request");

    return db.runTransaction(async (tx) => {
      const prizeRef = db.doc(prizePath(uid, orderId));
      const snap = await tx.get(prizeRef);
      if (!snap.exists) throw fail("prize-not-found");

      // A mistaken redemption can be taken back. (Not in the original spec: a
      // small addition so the admin screen keeps the undo it already had.)
      if (undo === true) {
        tx.update(prizeRef, { redeemed: null });
        return { ok: true, redeemed: null };
      }

      const all = await tx.get(db.collection(`users/${uid}/prizes`));
      const targetSnap = await tx.get(db.doc(`registrations/${onOrderId}`));
      const t = targetSnap.exists ? targetSnap.data() : null;
      const reason = W.checkRedeem({
        uid,
        prize: snap.data(),
        allPrizes: all.docs.map((d) => d.data()),
        target: t && { id: onOrderId, userId: t.userId || null, depositPaid: t.depositPaid === true, submittedAtMs: toMs(t.submittedAt) },
        now: now(),
      });
      if (reason) throw fail(reason);

      tx.update(prizeRef, { redeemed: { at: serverTimestamp(), orderId: onOrderId, by: admin.email } });
      return { ok: true, redeemed: { orderId: onOrderId } };
    });
  }

  /* ── savePrizeExtra (the winner) ───────────────────────────────────────── */
  async function savePrizeExtra(request) {
    const { uid } = requireUser(request);
    const { orderId, extra } = request.data || {};
    if (!isOrderId(orderId)) throw fail("bad-order");

    return db.runTransaction(async (tx) => {
      const prizeRef = db.doc(prizePath(uid, orderId));
      const snap = await tx.get(prizeRef);
      if (!snap.exists) throw fail("prize-not-found");
      const prize = snap.data();
      const invalid = W.validateExtra(prize.prizeId, extra);
      if (invalid) throw fail(invalid);
      if (prize.extra) throw fail("already-submitted"); // once only
      tx.update(prizeRef, { extra: { ...W.cleanExtra(prize.prizeId, extra), submittedAt: serverTimestamp() } });
      return { ok: true };
    });
  }

  return { spin, redeemPrize, savePrizeExtra };
}

module.exports = { makeHandlers };
