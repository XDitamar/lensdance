// api/verify-prize.js
//
// POST { uid?, prizes: [{ prizeId, code, issuedAt, validUntil, orderId?, signature }],
//        redeemOnOrderId? }
//   Authorization: Bearer <Firebase ID token>
//
// Answers, for each prize: is the signature genuine, has it expired, is it a
// capped prize, and is it redeemable (see evaluatePrizes in ./_verify.js).
//
// With `redeemOnOrderId` (ADMIN ONLY) it also answers whether each prize may be
// spent ON THAT ORDER: the order must be the customer's own, have its deposit
// marked paid, not be the order the prize was won on, and be later than it
// (canRedeemOn). The order is read with the admin's own token, so the rules
// that let the admin read every registration are what authorise it.
//
// The caller must be a real signed-in user. A customer may only check their OWN
// prizes; the admin may name any uid, which is how Alina's page checks a
// client's list.
//
// The real fix for prize forgery is working FIREBASE_* credentials on Vercel,
// so the server can record each result somewhere clients cannot write. Until
// then this redemption-time check is the enforcement. See ./_verify.js.

const {
  verifyCaller, isAdminEmail, evaluatePrizes, canRedeemOn, isOrderId, fetchOrder,
} = require("./_verify");

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

  const prizes = Array.isArray(body.prizes) ? body.prizes.slice(0, 200) : [];
  const results = evaluatePrizes(uid, prizes);

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
      r.redeemOnOrder = canRedeemOn(uid, prizes[i] || {}, order);
    });
  }

  res.status(200).json({
    ok: true,
    // Without SPIN_SECRET nothing can verify; say so rather than "invalid".
    secretConfigured: !!process.env.SPIN_SECRET,
    results,
  });
};
