// api/spin.js
//
// POST { orderId }   Authorization: Bearer <Firebase ID token>
//
// ─────────────────────────────────────────────────────────────────────────────
// ONE SPIN PER ORDER. THE BROWSER ONLY ANIMATES TO THE ANSWER.
// ─────────────────────────────────────────────────────────────────────────────
//
// The prizes are worth real money (an edited pack, a reel, a discount), so the
// draw cannot happen in the page: anyone with devtools could make it return
// whatever they liked.
//
// What this function does, in order:
//   1. checks who is calling (a real signed-in user),
//   2. checks the wheel is still open (31.12.2026, Israel time, server clock),
//   3. checks the ORDER exists, is the caller's own, and was placed before the
//      wheel closed, by reading registrations/{orderId} through the Firestore
//      REST API with the caller's own token (the rules let an owner read their
//      own registration, and nobody else's),
//   4. answers with the prize for that order.
//
// The prize is a pure function of (uid, orderId) and SPIN_SECRET (see
// drawForOrder in ./_verify.js): asking again for the same order returns the
// same prize, so there is nothing to reroll and no "used" flag to store (this
// server cannot write to Firestore). The client's prize history plays no part
// in the draw, so it cannot be used to steer it. The one-capped-prize rule is
// enforced at redemption instead (see ./_verify.js).
//
// ── EVERY SLICE IS A PRIZE ─────────────────────────────────────────────────
// There is no "you lost" segment, on purpose. The table and its odds are in
// ./_prizes.js.
//
// ── SIGNED, BECAUSE THE SERVER CANNOT WRITE ────────────────────────────────
// The deployment's firebase-admin credentials do not work (api/media.js fails
// on them in production), so the result is returned signed and the browser
// stores it. api/verify-prize.js checks it. See ./_verify.js for the limits and
// for the real fix (working FIREBASE_* credentials on Vercel).
//
// Errors are short machine codes the page turns into friendly messages:
//   missing-token / invalid-token  not signed in
//   wheel-ended                    after 31.12.2026
//   bad-order / order-not-found / order-not-yours / order-too-late
//   not-configured                 SPIN_SECRET is not set on the server
//   verification-unavailable       the sign-in check or the order lookup failed

const { PRIZES, wheelOpen, israelDay, PRIZE_WHEEL_UNTIL, PRIZE_VALID_UNTIL } = require("./_prizes");
const { payloadOf, sign, drawForOrder, verifyCaller, isOrderId, fetchOrder } = require("./_verify");

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const idToken = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!idToken) {
    res.status(401).json({ ok: false, error: "missing-token" });
    return;
  }

  let uid;
  try {
    uid = (await verifyCaller(idToken))?.uid || null;
  } catch (err) {
    console.error("Spin could not verify the caller:", err);
    res.status(502).json({ ok: false, error: "verification-unavailable" });
    return;
  }
  if (!uid) {
    res.status(401).json({ ok: false, error: "invalid-token" });
    return;
  }

  // Enforced here, not only on the page: a client clock can be set to anything.
  // Checked after the caller is verified so an anonymous request learns nothing.
  if (!wheelOpen()) {
    res.status(410).json({ ok: false, error: "wheel-ended" });
    return;
  }

  // Not configured is a deployment problem, not the customer's: say so plainly
  // rather than drawing a prize that nobody could ever verify.
  if (!process.env.SPIN_SECRET) {
    console.error("SPIN_SECRET is not set: the wheel cannot draw.");
    res.status(503).json({ ok: false, error: "not-configured" });
    return;
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  if (!isOrderId(body.orderId)) {
    res.status(400).json({ ok: false, error: "bad-order" });
    return;
  }

  let found;
  try {
    found = await fetchOrder(body.orderId, idToken);
  } catch (err) {
    console.error("Spin could not read the order:", err);
    res.status(502).json({ ok: false, error: "verification-unavailable" });
    return;
  }
  // The rules answer "denied" for an order that does not exist AND for one that
  // belongs to somebody else; the two cannot be told apart, and need not be.
  if (found.status !== "ok") {
    res.status(404).json({ ok: false, error: "order-not-found" });
    return;
  }
  const order = found.order;
  if (order.userId !== uid) {
    res.status(403).json({ ok: false, error: "order-not-yours" });
    return;
  }
  // An order with no timestamp, or one placed after the wheel closed, earns no spin.
  if (!order.submittedAt || israelDay(new Date(order.submittedAt)) > PRIZE_WHEEL_UNTIL) {
    res.status(410).json({ ok: false, error: "order-too-late" });
    return;
  }

  const { prize, code } = drawForOrder(uid, order.id);
  // issuedAt is the ORDER's submission time, not "now": it keeps the record
  // identical however many times the same order is asked for, and it is what
  // redemption compares against ("a later order").
  const issuedAt = order.submittedAt;
  const validUntil = PRIZE_VALID_UNTIL;
  const signature = sign(payloadOf(uid, prize.id, code, issuedAt, validUntil, order.id));

  res.status(200).json({
    ok: true,
    prize: { id: prize.id, label: prize.label, tier: prize.tier },
    code,
    issuedAt,
    validUntil,
    orderId: order.id,
    signature,
    // The wheel needs to know which slice to stop on, and the order here is
    // the order it is drawn in.
    index: PRIZES.findIndex((p) => p.id === prize.id),
  });
};
