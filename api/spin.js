// api/spin.js
//
// ─────────────────────────────────────────────────────────────────────────────
// DRAWS THE PRIZE. THE BROWSER ONLY ANIMATES TO IT.
// ─────────────────────────────────────────────────────────────────────────────
//
// The prizes are worth real money — an extra edited photo, a reel, a discount —
// so the draw cannot happen in the page. Anyone who can open devtools can make
// a client-side draw return whatever they like, and a wheel that can be told
// what to land on is a decoration, not a promotion.
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
// browser stores it instead — and a record the winner writes is a record the
// winner could invent. Each result is therefore returned with an HMAC over
// { uid, prize, issuedAt, nonce }, which only this function can produce.
// api/verify-prize.js checks it, so Alina's list can mark a prize as genuinely
// drawn rather than typed in.
//
// The honest limit: this proves a prize WAS drawn for that person. It cannot
// prove they were entitled to the spin — that needs either working admin
// credentials here or a Firestore rule, and both are noted in the plan.

const crypto = require("crypto");

const { PRIZES, TOTAL_WEIGHT, wheelOpen, pickPrize } = require("./_prizes");

const WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY || "AIzaSyCTL0IcIZ4cXhevCucMDJdTn5SKUArbdw8";

/** Same check the Telegram route uses — it works where firebase-admin does not. */
async function verifyUser(idToken) {
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
  return data.users?.[0]?.localId || null;
}

/**
 * Weighted draw over the table in ./_prizes.js.
 *
 * randomInt rather than Math.random: this decides who gets something worth
 * money, and a predictable sequence is a way to farm the good slice.
 */
function draw() {
  return pickPrize(crypto.randomInt(TOTAL_WEIGHT));
}

/** A short human code — what the client shows Alina to claim the prize. */
function prizeCode() {
  // No 0/O/1/I: this gets read aloud and typed from a screenshot.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i += 1) out += alphabet[crypto.randomInt(0, alphabet.length)];
  return `LD-${out}`;
}

function sign(payload) {
  const secret = process.env.SPIN_SECRET;
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
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
    uid = await verifyUser(idToken);
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

  const prize = draw();
  const issuedAt = Date.now();
  const code = prizeCode();
  const signature = sign(`${uid}|${prize.id}|${code}|${issuedAt}`);

  res.status(200).json({
    ok: true,
    prize: { id: prize.id, label: prize.label, tier: prize.tier },
    code,
    issuedAt,
    signature,
    // The wheel needs to know which slice to stop on, and the order here is
    // the order it is drawn in.
    index: PRIZES.findIndex((p) => p.id === prize.id),
    wheel: PRIZES.map((p) => ({ id: p.id, label: p.label, tier: p.tier })),
  });
};
