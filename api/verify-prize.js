// api/verify-prize.js
//
// POST { uid?, prizes?: [{ prizeId, code, issuedAt, validUntil, orderId?, signature }],
//        fromSpins?: true, redeemOnOrderId? }
//   Authorization: Bearer <Firebase ID token>
//
// Answers, for each prize: is it genuine, has it expired, was it already
// redeemed, is it a capped prize, and is it redeemable (see evaluatePrizes in
// ./_verify.js).
//
// WHERE THE TRUTH COMES FROM
//   * Spin records, spins/{orderId}: read HERE, over the Firestore REST API with
//     the caller's own token (the rules let the owner and the admin read them).
//     A record's `sig` can only be produced by this server, so it proves the
//     prize; its `redeemedAt` says whether it was already spent. `fromSpins`
//     asks for ALL of the customer's records, so a customer who deleted their own
//     copy of a prize from users/{uid}.prizes hides nothing from the admin.
//   * Prize records posted in `prizes` (the copy in users/{uid}.prizes) are only
//     believed through their own HMAC, and only for orders that have no spin
//     record (prizes drawn before spin records existed).
//   * Anything the client sends about redemption is ignored: redeemedAt comes
//     from the spin record, and from retention/{uid}.redeemed for older prizes.
//
// With `redeemOnOrderId` (ADMIN ONLY) it also answers whether each prize may be
// spent ON THAT ORDER: the order must be the customer's own, have its deposit
// marked paid, not be the order the prize was won on, and be later than it
// (canRedeemOn). The order is read with the admin's own token.
//
// The caller must be a real signed-in user. A customer may only check their OWN
// prizes; the admin may name any uid.
//
// The real fix for prize forgery is working FIREBASE_* credentials on Vercel,
// so the server can record each result somewhere clients cannot write. Until
// then this redemption-time check is the enforcement. See ./_verify.js.

const { PRIZE_VALID_UNTIL } = require("./_prizes");
const {
  verifyCaller, isAdminEmail, evaluatePrizes, canRedeemOn, isOrderId, fetchOrder,
  isSpinAuthentic, fetchSpin, fetchSpinsForUser, fetchRedeemedCodes,
} = require("./_verify");

const MAX_PRIZES = 200;
const MAX_SPIN_LOOKUPS = 50;

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}

/** Only the fields we use, as plain values: nothing else the client sent gets through. */
const cleanPrize = (p) => ({
  prizeId: typeof p?.prizeId === "string" ? p.prizeId : null,
  code: typeof p?.code === "string" ? p.code : null,
  issuedAt: Number(p?.issuedAt) || 0,
  validUntil: typeof p?.validUntil === "string" ? p.validUntil : null,
  orderId: typeof p?.orderId === "string" ? p.orderId : null,
  signature: typeof p?.signature === "string" ? p.signature : null,
});

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

  let caller;
  try {
    caller = await verifyCaller(idToken);
  } catch (err) {
    console.error("verify-prize could not verify the caller:", err);
    res.status(502).json({ ok: false, error: "verification-unavailable" });
    return;
  }
  if (!caller) {
    res.status(401).json({ ok: false, error: "invalid-token" });
    return;
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const asAdmin = isAdminEmail(caller.email);
  if (body.uid && body.uid !== caller.uid && !asAdmin) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }
  const uid = asAdmin && body.uid ? String(body.uid) : caller.uid;

  const posted = (Array.isArray(body.prizes) ? body.prizes.slice(0, MAX_PRIZES) : []).map(cleanPrize);

  /* ── 1. spin records ─────────────────────────────────────────────────────── */
  const spinDocs = new Map(); // orderId -> record as stored
  let spinsAvailable = true;
  try {
    if (body.fromSpins === true) {
      for (const s of await fetchSpinsForUser(uid, idToken)) spinDocs.set(s.orderId, s);
    }
    let lookups = 0;
    for (const p of posted) {
      if (!isOrderId(p.orderId) || spinDocs.has(p.orderId) || lookups >= MAX_SPIN_LOOKUPS) continue;
      lookups += 1;
      const got = await fetchSpin(p.orderId, idToken);
      if (got.status === "ok") spinDocs.set(p.orderId, got.spin);
      else if (got.status === "denied") spinsAvailable = false; // `spins` rules not published yet
    }
  } catch (err) {
    // The listing is refused when the rules are not published; a plain network
    // failure looks the same. Either way the spin records could not be read, so
    // say so and fall back to the signed prize records alone.
    console.warn("verify-prize could not read spin records:", err && err.message);
    spinsAvailable = false;
  }

  const spins = new Map();
  const records = [];
  for (const [orderId, s] of spinDocs) {
    const ok = isSpinAuthentic(uid, orderId, s);
    spins.set(orderId, { status: ok ? "ok" : "invalid", prizeId: s.prizeId, code: s.code, redeemedAt: s.redeemedAt });
    // issuedAt = when the ORDER was placed, the same clock the signed records use
    // (it orders capped prizes and decides what counts as "a later order").
    let issuedAt = s.createdAt || 0;
    if (ok) {
      try {
        const o = await fetchOrder(orderId, idToken);
        if (o.status === "ok" && o.order.submittedAt) issuedAt = o.order.submittedAt;
      } catch (err) {
        console.warn("verify-prize could not read an order:", err && err.message);
      }
    }
    // Spin records carry no expiry of their own; they follow the current season end,
    // so setting the real PRIZE_VALID_UNTIL also fixes prizes already won.
    records.push({ prizeId: s.prizeId, code: s.code, orderId, issuedAt, validUntil: PRIZE_VALID_UNTIL, signature: null });
  }
  // Signed records only for orders with no spin record (older prizes).
  for (const p of posted) if (!(p.orderId && spinDocs.has(p.orderId))) records.push(p);

  /* ── 2. redemption notes ─────────────────────────────────────────────────── */
  let redeemed;
  try {
    redeemed = await fetchRedeemedCodes(uid, idToken);
  } catch (err) {
    // Without them "already redeemed" cannot be ruled out for older prizes, so do
    // not answer "redeemable" on a guess.
    console.error("verify-prize could not read redemption notes:", err);
    res.status(502).json({ ok: false, error: "verification-unavailable" });
    return;
  }

  const results = evaluatePrizes(uid, records, new Date(), { spins, redeemed });

  /* ── 3. may it be spent on this particular order? (admin only) ───────────── */
  if (body.redeemOnOrderId !== undefined && body.redeemOnOrderId !== null) {
    if (!asAdmin) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }
    if (!isOrderId(body.redeemOnOrderId)) {
      res.status(400).json({ ok: false, error: "bad-order" });
      return;
    }
    let found;
    try {
      found = await fetchOrder(body.redeemOnOrderId, idToken);
    } catch (err) {
      console.error("verify-prize could not read the order:", err);
      res.status(502).json({ ok: false, error: "verification-unavailable" });
      return;
    }
    const order = found.status === "ok" ? found.order : null;
    results.forEach((r, i) => {
      r.redeemOnOrder = canRedeemOn(uid, records[i] || {}, order);
    });
  }

  res.status(200).json({
    ok: true,
    // Without SPIN_SECRET nothing can verify; say so rather than "invalid".
    secretConfigured: !!process.env.SPIN_SECRET,
    // false when the spins collection could not be read (rules not published yet).
    spinsAvailable,
    results,
  });
};
