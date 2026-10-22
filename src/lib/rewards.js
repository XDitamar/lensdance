// src/lib/rewards.js
//
// The client side of the prize wheel.
//
// ── THE MODEL ──────────────────────────────────────────────────────────────
// One spin per ORDER (a registration), available the moment it is submitted;
// no deposit is needed to spin. The prize for an order is a pure function of
// the order, drawn by api/spin.js, so spinning again returns the same prize.
// A prize can be REDEEMED only on a later order whose deposit is marked paid,
// never on the order that produced it, and only if it is verified, unexpired
// and (for the six capped prizes) the customer's earliest one. Alina does the
// redeeming from the admin registrations page.
//
// Spins are therefore not stored or counted anywhere: "this order has no
// prize yet" IS the spin. (The old spin counter on retention/{uid}, credited
// when a deposit was marked paid, is gone.)
//
// ── WHERE THINGS LIVE ──────────────────────────────────────────────────────
// A won prize goes into the customer's own `users/{uid}` document, which they
// may write. Yes, that means a determined client could add a prize by hand, so
// every prize carries a signature from api/spin.js that only the server can
// produce, and nothing is redeemed until api/verify-prize.js has checked it.
// Prevention needs a rule or working admin credentials on Vercel; this gives
// detection at redemption. See api/_verify.js.
//
// Redemptions (which order, when) are recorded on `retention/{uid}`, the one
// document only the admin can write, under `redeemed.<code>`.
//
// ── THE SPIN RECORD ────────────────────────────────────────────────────────
// After a successful spin the browser also creates spins/{orderId}
// ({ uid, prizeId, label, code, sig, createdAt, redeemedAt: null }) with the
// customer's own token, once (firestore.rules `spins`). `sig` comes from
// api/spin.js, so the record cannot be invented or upgraded. It is what makes a
// spin permanent: api/spin.js returns the same prize for that order, the admin
// lists prizes from these records (deleting your own copy in users/{uid}.prizes
// hides nothing), and redemption sets its `redeemedAt`. See api/_verify.js.

import {
  collection, deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, arrayUnion, where,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { RETENTION } from "./retention";
import { PRIZES, PRIZE_VALID_UNTIL, PRIZE_WHEEL_UNTIL, israelDay, prizeById, wheelOpen } from "../config/prizes";
import { fetchMyRegistrations } from "./competitions";

/** The wheel, in the order it is drawn. The table lives in src/config/prizes.js. */
export const WHEEL = PRIZES;
export { prizeById };

/** Firestore Timestamp | millis | null -> millis | null. */
export const toMillis = (v) =>
  !v ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : v.seconds ? v.seconds * 1000 : null;

/**
 * What this customer has won, the follow-up details they filled in, and what
 * Alina has redeemed. A failed read answers "nothing": never invent a prize.
 * `redeemed.<code>` is { at, orderId }, or a bare timestamp on older records.
 */
export async function fetchRewards(uid) {
  const out = { prizes: [], extras: {}, redeemed: {} };
  if (!uid) return out;

  try {
    const snap = await getDoc(doc(db, RETENTION, uid));
    if (snap.exists()) out.redeemed = snap.data().redeemed || {};
  } catch (err) {
    console.warn("Could not read redemptions:", err?.code || err);
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

  /* The spin records (spins/{orderId}), which the customer cannot alter. A prize
     whose copy in users/{uid}.prizes is missing (deleted, or never saved because
     the tab closed) is rebuilt from its record, so it still shows and still
     counts as "this order has been spun". If the `spins` rules are not
     published yet this read is refused and the page simply works as before. */
  try {
    const snap = await getDocs(query(collection(db, "spins"), where("uid", "==", uid)));
    const haveOrder = new Set(out.prizes.map((p) => p.orderId).filter(Boolean));
    snap.forEach((d) => {
      const sp = d.data();
      if (!haveOrder.has(d.id)) {
        out.prizes = [
          ...out.prizes,
          {
            prizeId: sp.prizeId,
            label: sp.label,
            tier: prizeById(sp.prizeId)?.tier || null,
            code: sp.code,
            issuedAt: toMillis(sp.createdAt),
            validUntil: PRIZE_VALID_UNTIL,
            orderId: d.id,
            signature: null,
            fromSpin: true,
          },
        ];
      }
      const at = toMillis(sp.redeemedAt);
      if (at && !out.redeemed[sp.code]) out.redeemed = { ...out.redeemed, [sp.code]: { at, orderId: null } };
    });
  } catch (err) {
    console.warn("Could not read spin records:", err?.code || err);
  }

  return out;
}

/**
 * The customer's orders, newest first, shaped for the wheel. Uses the same
 * owner-scoped query as /my-competitions (the rules refuse an unscoped one).
 */
export async function fetchWheelOrders(uid) {
  const regs = await fetchMyRegistrations(uid);
  return regs.map((r) => ({
    id: r.id,
    label: r.competitionTitle || "",
    submittedAt: toMillis(r.submittedAt),
    depositPaid: r.depositPaid === true,
  }));
}

/** Was this order placed before the wheel closed? */
export const orderInTime = (order) =>
  !!order?.submittedAt && israelDay(new Date(order.submittedAt)) <= PRIZE_WHEEL_UNTIL;

/**
 * Pair each order with the prize it won, if any. An order can be spun when it
 * has no prize yet, the wheel is open and the order was placed in time.
 */
export function orderStates(orders, prizes, now = new Date()) {
  const byOrder = new Map((prizes || []).filter((p) => p.orderId).map((p) => [p.orderId, p]));
  return (orders || []).map((o) => {
    const prize = byOrder.get(o.id) || null;
    return { ...o, prize, spinnable: !prize && wheelOpen(now) && orderInTime(o) };
  });
}

/**
 * Ask the server for the prize for one order. The wheel animates to whatever
 * comes back; nothing here decides anything. The same order always returns the
 * same prize.
 *
 * Failures carry a short `code` (see spinErrorKey) so the page can say what
 * actually went wrong, in plain words, without exposing internals.
 */
export async function requestSpin(orderId, { test = false } = {}) {
  const fail = (code) => Object.assign(new Error(code), { code });
  const user = auth.currentUser;
  if (!user) throw fail("not-signed-in");

  let res;
  try {
    const idToken = await user.getIdToken();
    res = await fetch("/api/spin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      // A test spin has no order; the server decides whether this caller may test.
      body: JSON.stringify(test ? { test: true } : { orderId }),
    });
  } catch (e) {
    throw fail("network");
  }
  const data = await res.json().catch(() => null);
  // Not JSON at all: nothing is answering /api/spin (a dev server without the
  // functions, or a deployment that does not have it yet).
  if (!data) throw fail("unavailable");
  if (!res.ok || !data.ok) {
    const code = typeof data.error === "string" && data.error ? data.error : `http-${res.status}`;
    throw fail(code);
  }
  return data;
}

/** The locale key (under prize.*) for a failed spin. */
export function spinErrorKey(err) {
  switch (err?.code) {
    case "not-signed-in":
    case "missing-token":
    case "invalid-token":
      return "errorSignedOut";
    case "wheel-ended":
      return "errorEnded";
    case "order-too-late":
      return "errorOrderLate";
    case "order-not-found":
    case "bad-order":
      return "errorOrderNotFound";
    case "order-not-yours":
      return "errorOrderNotYours";
    case "not-tester":
      return "errorNotTester";
    case "not-configured":
      return "errorNotConfigured";
    case "spin-record-invalid":
      return "errorSpinRecord";
    case "network":
      return "errorNetwork";
    case "unavailable":
    case "verification-unavailable":
      return "errorUnavailable";
    default:
      return "errorGeneric";
  }
}

/** The fields the server signed: all it needs to check a prize. */
const signedFields = (p) => ({
  prizeId: p.prizeId, code: p.code, issuedAt: p.issuedAt, validUntil: p.validUntil,
  orderId: p.orderId || undefined, signature: p.signature,
});

/**
 * Ask the server which of these prizes are genuine, unexpired and redeemable
 * (api/verify-prize.js). A customer can only check their own; the admin passes
 * `uid` to check a client's, and `redeemOnOrderId` to also ask whether each
 * prize may be spent on that particular order. Resolves to
 * { secretConfigured, spinsAvailable, byCode, list } or rejects when the
 * endpoint is unreachable (for example under plain `npm start`, which has no
 * /api). `fromSpins` asks the server to read ALL of the customer's spin records
 * itself, so the answer does not depend on what the customer kept in their own
 * profile; `list` is then the complete, server-built list of their prizes.
 */
export async function verifyPrizes(prizes, uid, redeemOnOrderId, { fromSpins = false } = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("not-signed-in");
  const idToken = await user.getIdToken();
  const res = await fetch("/api/verify-prize", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ uid, prizes: prizes.map(signedFields), redeemOnOrderId, fromSpins }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return {
    secretConfigured: data.secretConfigured,
    spinsAvailable: data.spinsAvailable !== false,
    byCode: Object.fromEntries((data.results || []).map((r) => [r.code, r])),
    list: data.results || [],
  };
}

/**
 * Make a spin permanent: create spins/{orderId} once, with the customer's own
 * token. `result` is api/spin.js's answer. Nothing happens for a test spin, for
 * a spin the server says is already saved, or if the server sent no `sig`.
 *
 * The rules allow exactly one create per order and never an update by the
 * customer, so a second attempt (another tab, a retry) is refused with
 * permission-denied: that means "already saved" and is not an error. The same
 * answer comes back if the `spins` rules are not published yet; either way the
 * prize is still shown and still saved in the customer's profile.
 */
export async function persistSpin(uid, result) {
  if (!uid || !result || result.test || result.persisted || !result.orderId || !result.sig) return "skipped";
  try {
    await setDoc(doc(db, "spins", result.orderId), {
      uid,
      prizeId: result.prize.id,
      label: result.prize.label,
      code: result.code,
      sig: result.sig,
      createdAt: serverTimestamp(),
      redeemedAt: null,
    });
    return "saved";
  } catch (err) {
    if (err?.code === "permission-denied") {
      console.warn("Spin record not created (already saved, or the spins rules are not published):", err.code);
      return "denied";
    }
    throw err;
  }
}

/**
 * Keep a won prize. arrayUnion so two tabs cannot overwrite each other's
 * winnings (and an identical record, which is what asking for the same order
 * again produces, is not added twice), and `merge` so nothing else on the
 * profile is touched.
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
        orderId: result.orderId || null,
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
 * Alina marks a prize redeemed AGAINST a specific later order (or undoes it).
 * Lives on `retention/{uid}` because that is the document only the admin can
 * write. Keyed by prize code; the value says which order it was spent on and
 * when. The admin page only offers this after api/verify-prize.js has agreed.
 * `spinOrderId` is the prize's own order (the id of its spin record), if it has one.
 */
export async function setRedeemed(uid, code, orderId, spinOrderId) {
  if (!uid || !code) return;
  // The spin record's own flag first: it is the one api/verify-prize.js trusts
  // (the rules let only the admin change it, and only this field). Prizes older
  // than spin records have none and rely on the note below.
  if (spinOrderId) {
    await updateDoc(doc(db, "spins", spinOrderId), { redeemedAt: orderId ? serverTimestamp() : null });
  }
  await setDoc(
    doc(db, RETENTION, uid),
    { redeemed: { [code]: orderId ? { at: Date.now(), orderId } : deleteField() } },
    { merge: true }
  );
}

/** When was it redeemed (millis), tolerating the older bare-timestamp shape? */
export const redeemedAt = (v) => (v && typeof v === "object" ? v.at : v) || null;

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
