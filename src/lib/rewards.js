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

import { doc, getDoc, setDoc, arrayUnion, increment } from "firebase/firestore";
import { db, auth } from "../firebase";
import { RETENTION } from "./retention";

/** The wheel, in the order it is drawn. Must match PRIZES in api/spin.js. */
export const WHEEL = [
  { id: "extra-photo", label: "תמונה נוספת ערוכה", note: "עוד תמונה אחת מהתחרות, ערוכה במלואה" },
  { id: "fast-delivery", label: "מסירה מהירה", note: "התמונות שלך תוך 48 שעות" },
  { id: "discount", label: "15% על ההזמנה הבאה", note: "תקף לתחרות או לסשן אישי" },
  { id: "reel", label: "ריל קצר", note: "סרטון קצר לאינסטגרם מהתמונות שלך" },
];

export const prizeById = (id) => WHEEL.find((p) => p.id === id) || null;

/**
 * How many spins this person has, and what they have already won.
 * A failed read answers "none" — never invent a spin nobody granted.
 */
export async function fetchRewards(uid) {
  if (!uid) return { granted: 0, prizes: [] };
  const out = { granted: 0, prizes: [] };

  try {
    const snap = await getDoc(doc(db, RETENTION, uid));
    if (snap.exists()) out.granted = Number(snap.data().spins) || 0;
  } catch (err) {
    console.warn("Could not read spins:", err?.code || err);
  }

  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) out.prizes = Array.isArray(snap.data().prizes) ? snap.data().prizes : [];
  } catch (err) {
    console.warn("Could not read prizes:", err?.code || err);
  }

  return out;
}

/** Spins left to use. */
export const spinsLeft = ({ granted, prizes }) =>
  Math.max(0, (granted || 0) - (prizes?.length || 0));

/**
 * Ask the server to draw. The wheel animates to whatever comes back; nothing
 * here decides anything.
 */
export async function requestSpin() {
  const user = auth.currentUser;
  if (!user) throw new Error("not-signed-in");
  const idToken = await user.getIdToken();

  const res = await fetch("/api/spin", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
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
        code: result.code,
        issuedAt: result.issuedAt,
        signature: result.signature || null,
        redeemedAt: null,
      }),
    },
    { merge: true }
  );
}
