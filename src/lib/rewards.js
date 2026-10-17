// src/lib/rewards.js
//
// The client side of the prize wheel: how many spins someone has, and where a
// prize goes once it has been won.
//
// ── WHERE THE SPIN COUNT LIVES ─────────────────────────────────────────────
// On `retention/{uid}`, the same document that already carries the 30-day
// clock and the download lock. Not because they are related, but because that
// document has the one permission this needs and no other collection does:
// ADMIN WRITES, CLIENT READS. A spin count the client could write is not a
// spin count. Adding a collection of its own would mean publishing new
// Firestore rules by hand, and until that happens the new collection is denied
// outright — which would read as "nobody has any spins, ever".
//
// ── AND WHERE THE PRIZE GOES ───────────────────────────────────────────────
// Into the client's own `users/{uid}` document, which they may write. Yes,
// that means a determined client could add a prize by hand — so every prize
// carries a signature from api/spin.js that only the server can produce, and
// Alina's list shows whether each one verifies. Prevention needs a rule; this
// gives detection today. See the note at the top of api/spin.js.

import { doc, getDoc, setDoc, updateDoc, arrayUnion, increment, deleteField } from "firebase/firestore";
import { db, auth } from "../firebase";
import { RETENTION } from "./retention";
import { PRIZES, prizeById } from "../config/prizes";

/** The wheel, in the order it is drawn. The table lives in src/config/prizes.js. */
export const WHEEL = PRIZES;
export { prizeById };

/**
 * How many spins this person has, and what they have already won.
 * A failed read answers "none" — never invent a spin nobody granted.
 */
export async function fetchRewards(uid) {
  if (!uid) return { granted: 0, prizes: [], extras: {}, redeemed: {} };
  const out = { granted: 0, prizes: [], extras: {}, redeemed: {} };

  try {
    const snap = await getDoc(doc(db, RETENTION, uid));
    if (snap.exists()) {
      out.granted = Number(snap.data().spins) || 0;
      out.redeemed = snap.data().redeemed || {};
    }
  } catch (err) {
    console.warn("Could not read spins:", err?.code || err);
  }

  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      out.prizes = Array.isArray(snap.data().prizes) ? snap.data().prizes : [];
      out.extras = snap.data().prizeExtras || {};
    }
  } catch (err) {
    console.warn("Could not read prizes:", err?.code || err);
  }

  return out;
}

/** Spins left to use. */
export const spinsLeft = ({ granted, prizes }) =>
  Math.max(0, (granted || 0) - (prizes?.length || 0));

/** The fields the server signed: all it needs to check a prize. */
const signedFields = (p) => ({
  prizeId: p.prizeId, code: p.code, issuedAt: p.issuedAt, validUntil: p.validUntil, signature: p.signature,
});

/**
 * Ask the server which of these prizes are genuine, unexpired and redeemable
 * (api/verify-prize.js). A customer can only check their own; the admin passes
 * `uid` to check a client's. Resolves to { secretConfigured, byCode } or
 * rejects when the endpoint is unreachable (for example under plain
 * `npm start`, which has no /api).
 */
export async function verifyPrizes(prizes, uid) {
  const user = auth.currentUser;
  if (!user) throw new Error("not-signed-in");
  const idToken = await user.getIdToken();
  const res = await fetch("/api/verify-prize", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ uid, prizes: prizes.map(signedFields) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return {
    secretConfigured: data.secretConfigured,
    byCode: Object.fromEntries((data.results || []).map((r) => [r.code, r])),
  };
}

/**
 * Ask the server to draw. The wheel animates to whatever comes back; nothing
 * here decides anything.
 */
export async function requestSpin(priorPrizes = []) {
  const user = auth.currentUser;
  if (!user) throw new Error("not-signed-in");
  const idToken = await user.getIdToken();

  // The signed history lets the server redraw away from a second capped prize.
  // A client could simply not send it: the real enforcement is at redemption
  // (api/verify-prize.js). See api/_verify.js.
  const res = await fetch("/api/spin", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ prizes: priorPrizes.map(signedFields) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/**
 * Give someone a spin (or take one back). Admin only — enforced by the rule on
 * `retention`, which is the whole reason the count lives there.
 *
 * Merged, never overwritten: this document also carries the 30-day clock and
 * the download lock, and granting a spin must not disturb either.
 */
export async function grantSpins(uid, spins) {
  if (!uid) throw new Error("grantSpins needs a uid");
  await setDoc(doc(db, RETENTION, uid), { spins: Math.max(0, Number(spins) || 0) }, { merge: true });
}

/**
 * Add or remove spins — the automatic path, used when Alina marks a deposit
 * paid or unmarks it. Admin only, like grantSpins.
 *
 * `increment` rather than read-then-write: two bookings marked paid in quick
 * succession would otherwise both read "0" and both write "1", and the second
 * rider's spin would quietly vanish.
 *
 * Marking unpaid takes the spin back. It can leave the count below what has
 * already been used if the rider was quick, which spinsLeft() clamps to zero —
 * a spin already taken is not something to claw back from someone.
 */
export async function addSpins(uid, delta) {
  if (!uid || !delta) return;
  await setDoc(doc(db, RETENTION, uid), { spins: increment(delta) }, { merge: true });
}

/**
 * Keep a won prize. arrayUnion so two tabs cannot overwrite each other's
 * winnings, and `merge` so nothing else on the profile is touched.
 */
export async function recordPrize(uid, result) {
  if (!uid || !result) return;
  await setDoc(
    doc(db, "users", uid),
    {
      prizes: arrayUnion({
        prizeId: result.prize.id,
        label: result.prize.label,
        tier: result.prize.tier || null,
        code: result.code,
        issuedAt: result.issuedAt,
        validUntil: result.validUntil || null,
        signature: result.signature || null,
      }),
    },
    { merge: true }
  );
}

/**
 * The follow-up a special prize needs (the five friends for the team prize,
 * the two competitions for the jackpot). Written to the winner's own
 * `users/{uid}` document, which they may write, under prizeExtras.<code>.
 *
 * One submission per prize: it refuses if something is already there. That is
 * a client-side guard (a determined client could write the field by hand,
 * like the prize itself), but it is read fresh from Firestore, so a second
 * tab or a reload cannot submit twice.
 */
export async function submitPrizeExtra(uid, code, extra) {
  if (!uid || !code) throw new Error("submitPrizeExtra needs a uid and a code");
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data().prizeExtras?.[code]) throw new Error("already-submitted");
  await updateDoc(ref, { [`prizeExtras.${code}`]: { ...extra, submittedAt: Date.now() } });
}

/**
 * Alina marks a prize redeemed (or undoes it). Lives on `retention/{uid}`
 * because that is the document only the admin can write. Keyed by prize code.
 */
export async function setRedeemed(uid, code, redeemed) {
  if (!uid || !code) return;
  await setDoc(
    doc(db, RETENTION, uid),
    { redeemed: { [code]: redeemed ? Date.now() : deleteField() } },
    { merge: true }
  );
}

/** Team prize: five distinct friends, each with a name and a way to reach them. */
export function validateTeam(friends, consent) {
  if (!consent) return "consent";
  if (!Array.isArray(friends) || friends.length !== 5) return "count";
  const keys = new Set();
  for (const f of friends) {
    const name = (f.name || "").trim();
    const contact = (f.contact || "").trim().toLowerCase();
    if (!name || !contact) return "incomplete";
    const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact);
    const isPhone = /^\+?[0-9\s\-()]{7,}$/.test(contact);
    if (!isEmail && !isPhone) return "contact";
    const key = isPhone ? contact.replace(/\D/g, "") : contact;
    if (keys.has(key)) return "duplicate";
    keys.add(key);
  }
  return null;
}

/** Jackpot: two competitions, one per reward, never the same one. */
export function validateJackpot(videoComp, packComp) {
  if (!videoComp || !packComp) return "incomplete";
  if (videoComp === packComp) return "same";
  return null;
}
