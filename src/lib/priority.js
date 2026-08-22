// src/lib/priority.js
//
// ─────────────────────────────────────────────────────────────────────────────
// THE PRIORITY SLOT COUNTER
// ─────────────────────────────────────────────────────────────────────────────
//
// Priority delivery (48 hours instead of 10 business days) is capped per
// competition — see PRIORITY_SLOTS in src/config/pricing.js. The cap is real:
// it is how many rush edits Alina can absorb in one weekend. So the sign-up
// form has to show riders how many places are actually left, live, and stop
// taking them once they run out.
//
// WHY A SEPARATE COLLECTION.
// The obvious implementation is "count the registrations that asked for
// priority". The form cannot do that: `registrations` is admin-read-only by
// design (firestore.rules), and it must stay that way — a rider must never be
// able to read another rider's name, contact details or publishing choice.
// So the tally lives in its own tiny public collection that holds a number and
// nothing else:
//
//   priorityCounts/{competitionKey}  →  { used, competitionTitle, updatedAt }
//
// Public read, and a signed-in rider may only ever move `used` up by exactly
// one and never past the cap. That last check is enforced in firestore.rules,
// not here — client-side validation is a courtesy, the rule is the guarantee.
//
// DRIFT. A rider claims the slot before the registration document is written,
// so a failure in between leaves the tally one too high. That is the safe
// direction to be wrong in (a place is held that nobody took, rather than two
// riders both promised the last one), and it is self-healing:
// /admin/registrations recounts from the registrations themselves and writes
// the true number back via syncPriorityCount(). The admin may write freely.

import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { PRIORITY_SLOTS } from "../config/pricing";

/** The package id that means "priority delivery". A contract with the admin page. */
export const PRIORITY_PACKAGE_ID = "priority";

const COLLECTION = "priorityCounts";

/** Thrown by claimPrioritySlot when the last place went while the form was open. */
export const PRIORITY_FULL = "priority-full";

/**
 * Competition title → a Firestore document id.
 *
 * Titles are free text typed by the admin, in Hebrew, so they can contain
 * anything. Document ids may not contain "/" and may not be "." or ".."; we
 * also collapse whitespace so that "תחרות  אביב" and "תחרות אביב" are the same
 * competition rather than two tallies.
 */
export function competitionKey(title) {
  const cleaned = String(title || "")
    .replace(/[/\\]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  // "." and ".." are reserved, and an empty id is not addressable at all.
  if (!cleaned || cleaned === "." || cleaned === "..") return "unnamed";
  return cleaned;
}

/** used → the numbers the UI needs. Clamped, because a stale doc may overshoot. */
function shape(used) {
  const taken = Math.max(0, Math.min(PRIORITY_SLOTS, Number(used) || 0));
  return {
    used: taken,
    total: PRIORITY_SLOTS,
    remaining: PRIORITY_SLOTS - taken,
    full: taken >= PRIORITY_SLOTS,
  };
}

/**
 * Subscribe to the live tally for one competition.
 *
 * onChange({ used, total, remaining, full }) fires immediately with what is on
 * the server and again on every change, so a rider watching the form sees the
 * count drop when somebody else takes a place. Returns an unsubscribe function.
 *
 * A missing document means nobody has claimed a slot yet — that is the normal
 * state for a new competition, not an error.
 */
export function watchPrioritySlots(title, onChange) {
  if (!title) return () => {};
  return onSnapshot(
    doc(db, COLLECTION, competitionKey(title)),
    (snap) => onChange(shape(snap.exists() ? snap.data().used : 0)),
    // A read failure — most likely the security rule for this collection not
    // being deployed — reports null rather than a number. The form then hides
    // the count instead of claiming "5 of 5 open", which we cannot actually
    // stand behind, and the rider can still sign up either way.
    (err) => {
      console.warn("Priority slot count unavailable:", err?.code || err);
      onChange(null);
    }
  );
}

/**
 * Take one priority place for this competition.
 *
 * Runs as a transaction so two riders submitting at the same moment cannot both
 * get the fifth place. Throws Error(PRIORITY_FULL) when the cap is already
 * reached — the caller should show that as a form error and let the rider
 * submit without priority instead.
 */
export async function claimPrioritySlot(title) {
  const ref = doc(db, COLLECTION, competitionKey(title));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const used = snap.exists() ? Number(snap.data().used) || 0 : 0;

    if (used >= PRIORITY_SLOTS) throw new Error(PRIORITY_FULL);

    // The whole document is written on create so the admin list has the title
    // to display; on update only `used` and `updatedAt` move, which is all the
    // security rule permits a rider to touch.
    if (snap.exists()) {
      tx.update(ref, { used: used + 1, updatedAt: serverTimestamp() });
    } else {
      tx.set(ref, {
        used: 1,
        competitionTitle: title,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/**
 * Admin only: write the authoritative count, recomputed from the registrations.
 *
 * This is what repairs drift — a claim that never became a registration, a
 * sign-up the admin removed, a competition renamed. Writes only when the number
 * actually differs, so opening the admin page does not churn the document.
 */
export async function syncPriorityCount(title, used) {
  if (!title) return;
  const ref = doc(db, COLLECTION, competitionKey(title));
  const snap = await getDoc(ref);
  const current = snap.exists() ? Number(snap.data().used) || 0 : 0;
  if (current === used) return;

  await setDoc(
    ref,
    { used, competitionTitle: title, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export { PRIORITY_SLOTS };
