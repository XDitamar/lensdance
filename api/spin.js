// api/spin.js
//
// ─────────────────────────────────────────────────────────────────────────────
// DRAWS THE PRIZE. THE BROWSER ONLY ANIMATES TO IT.
// ─────────────────────────────────────────────────────────────────────────────
//
// The prizes are worth real money (an edited pack, a reel, a discount), so the
// draw cannot happen in the page. Anyone who can open devtools can make a
// client-side draw return whatever they like, and a wheel that can be told what
// to land on is a decoration, not a promotion.
//
// So: the browser asks, this function decides, and the browser spins until it
// reaches the answer it was given.
//
// ── EVERY SLICE IS A PRIZE ─────────────────────────────────────────────────
// There is no "you lost" segment, on purpose. Every slice is a benefit, of very
// different sizes (the table and its odds are in ./_prizes.js).
//
// ── SIGNED, BECAUSE THE SERVER CANNOT WRITE ────────────────────────────────
// The deployment's firebase-admin credentials do not work (api/media.js fails
// on them in production), so this function cannot record the result itself. The
// browser stores it instead, and a record the winner writes is a record the
// winner could invent. Each result is therefore returned with an HMAC over
// { uid, prizeId, code, issuedAt, validUntil }, which only this server can
// produce. api/verify-prize.js checks it, and Alina's admin page offers
// "redeemed" only on a prize that verifies. See ./_verify.js for the honest
// limits and for the real fix (working FIREBASE_* credentials on Vercel).

const crypto = require("crypto");

const {
  PRIZES, wheelOpen, pickPrize, poolWeight, PRIZE_VALID_UNTIL,
} = require("./_prizes");
const { payloadOf, sign, holdsCapped, verifyCaller } = require("./_verify");

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}

/**
 * Weighted draw over the table in ./_prizes.js.
 *
 * randomInt rather than Math.random: this decides who gets something worth
 * money, and a predictable sequence is a way to farm the good slice.
 *
 * ONE CAPPED PRIZE PER CUSTOMER, best effort: if the customer already holds a
 * capped prize (checked from the signed history the browser sends), the draw
 * is among the non-capped prizes only, weights renormalised. A client can
 * simply not send its history, so this is a courtesy, not the rule. The rule
 * is enforced at redemption (evaluatePrizes in ./_verify.js).
 */
function draw(excludeCapped) {
  return pickPrize(crypto.randomInt(poolWeight({ excludeCapped })), { excludeCapped });
}

/** A short human code: what the client shows Alina to claim the prize. */
function prizeCode() {
  // No 0/O/1/I: this gets read aloud and typed from a screenshot.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i += 1) out += alphabet[crypto.randomInt(0, alphabet.length)];
  return `LD-${out}`;
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
    res.status(500).json({ ok: false, error: "verification-unavailable" });
    return;
  }
  if (!uid) {
    res.status(401).json({ ok: false, error: "invalid-token" });
    return;
  }

  // The end date is enforced here, not only on the page: a client clock can be
  // set to anything. Checked after the caller is verified so an anonymous
  // request learns nothing.
  if (!wheelOpen()) {
    res.status(410).json({ ok: false, error: "wheel-ended" });
    return;
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const prize = draw(holdsCapped(uid, body.prizes));
  const issuedAt = Date.now();
  const code = prizeCode();
  const validUntil = PRIZE_VALID_UNTIL;
  const signature = sign(payloadOf(uid, prize.id, code, issuedAt, validUntil));

  res.status(200).json({
    ok: true,
    prize: { id: prize.id, label: prize.label, tier: prize.tier },
    code,
    issuedAt,
    validUntil,
    signature,
    // The wheel needs to know which slice to stop on, and the order here is
    // the order it is drawn in.
    index: PRIZES.findIndex((p) => p.id === prize.id),
  });
};
