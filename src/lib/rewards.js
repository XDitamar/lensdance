// src/lib/rewards.js
//
// The client side of the prize wheel.
//
// ── THE MODEL ──────────────────────────────────────────────────────────────
// One spin per ORDER (a registration), available the moment it is submitted; no
// deposit is needed to spin. The wheel's server side is three Firebase Cloud
// Functions (functions/, src/lib/functions.js), not Vercel:
//
//   spin            draws the prize and creates users/{uid}/prizes/{orderId}
//   redeemPrize     the admin spends a prize on a later, paid order
//   savePrizeExtra  the winner's team / jackpot details, once
//
// A prize document is written ONLY by those functions (the Admin SDK) and
// firestore.rules lets clients only READ it, so it cannot be forged, upgraded,
// deleted to hide it from the one-capped-prize rule, or redeemed from a browser,
// and it carries no signature. "This order has a prize document" IS "this order
// has been spun": nothing is counted anywhere else, and a retry, a double click or
// a second tab gets the stored prize back, never a new draw.
//
// A prize can be redeemed only on a LATER order of the same customer whose
// deposit is paid, never on the order that produced it, and for the six capped
// prizes only the customer's earliest one (functions/lib/wheel.js is the judge).

import { collection, getDocs } from "firebase/firestore";
import { db, auth } from "../firebase";
import { PRIZE_WHEEL_UNTIL, PRIZES, israelDay, prizeById, wheelOpen } from "../config/prizes";
import { fetchMyRegistrations } from "./competitions";
import { callRedeemPrize, callSavePrizeExtra, callSpin } from "./functions";

/** The wheel, in the order it is drawn. The table lives in src/config/prizes.js. */
export const WHEEL = PRIZES;
export { prizeById };

/** Firestore Timestamp | millis | null -> millis | null. */
export const toMillis = (v) =>
  !v ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : v.seconds ? v.seconds * 1000 : null;

/** One users/{uid}/prizes/{orderId} document, in the shape the pages use. */
const fromDoc = (id, d) => ({
  prizeId: d.prizeId,
  label: d.label,
  tier: d.tier || prizeById(d.prizeId)?.tier || null,
  code: d.code,
  orderId: d.orderId || id,
  issuedAt: toMillis(d.issuedAt),
  createdAt: toMillis(d.createdAt),
  validUntil: d.validUntil || null,
  redeemed: d.redeemed
    ? { at: toMillis(d.redeemed.at), orderId: d.redeemed.orderId || null, by: d.redeemed.by || null }
    : null,
  extra: d.extra || null,
});

/**
 * Everything this customer has won: { prizes, extras, redeemed }, where
 * `extras[code]` is the team / jackpot details and `redeemed[code]` is
 * { at, orderId, by }. The admin calls it for any customer (the rules allow it).
 * A failed read answers "nothing" (never invent a prize), unless `strict`.
 */
export async function fetchRewards(uid, { strict = false } = {}) {
  const out = { prizes: [], extras: {}, redeemed: {} };
  if (!uid) return out;
  try {
    const snap = await getDocs(collection(db, "users", uid, "prizes"));
    out.prizes = snap.docs.map((d) => fromDoc(d.id, d.data()));
    for (const p of out.prizes) {
      if (p.extra) out.extras[p.code] = p.extra;
      if (p.redeemed) out.redeemed[p.code] = p.redeemed;
    }
  } catch (err) {
    // The admin screen asks for `strict`, so that "could not read" is never
    // shown as "no gifts won yet".
    if (strict) throw err;
    console.warn("Could not read prizes:", err?.code || err);
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
 * Why a call to a Cloud Function failed, as an Error whose `code` is a short
 * machine code (see spinErrorKey): the function's own `details` when it sent
 * one (wheel-ended, order-not-yours, same-order, ...), otherwise "network" when
 * the browser is offline and "unavailable" when nothing we recognise answered
 * (the function crashed, is not deployed yet, or the request never arrived).
 * Anything else keeps its raw code so the generic banner can show it.
 */
function callError(e) {
  const coded = (code) => Object.assign(new Error(code), { code });
  if (typeof e?.details === "string" && e.details) return coded(e.details);
  const raw = String(e?.code || "");
  if (raw === "functions/unauthenticated") return coded("not-signed-in");
  if (["functions/internal", "functions/unavailable", "functions/not-found", "functions/deadline-exceeded", "functions/cancelled"].includes(raw)) {
    return coded(typeof navigator !== "undefined" && navigator.onLine === false ? "network" : "unavailable");
  }
  return coded(raw || "error");
}

/**
 * Ask the server to spin one order. The wheel animates to whatever comes back;
 * nothing here decides anything, and the same order always returns the same
 * stored prize. A TEST spin (`{ test: true }`: admin and WHEEL_TEST_EMAILS only)
 * is sent only for the exact value true, so a click event passed by mistake is
 * never read as one.
 */
export async function requestSpin(orderId, { test } = {}) {
  if (!auth.currentUser) throw Object.assign(new Error("not-signed-in"), { code: "not-signed-in" });
  try {
    const res = await callSpin(test === true ? { test: true } : { orderId });
    return res.data;
  } catch (e) {
    throw callError(e);
  }
}

/** The locale key (under prize.*) for a failed spin. */
export function spinErrorKey(err) {
  switch (err?.code) {
    case "not-signed-in":
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
    case "network":
      return "errorNetwork";
    case "unavailable":
      return "errorUnavailable";
    default:
      return "errorGeneric";
  }
}

/**
 * The admin spends a prize (`orderId` = the order it was won on) on a later,
 * paid order of the same customer. The server re-checks everything inside a
 * transaction, so this only ever succeeds when the rules in
 * functions/lib/wheel.js agree. Rejects with err.code = the reason
 * (already-redeemed, expired, capped-limit, wrong-owner, same-order, unpaid,
 * not-later, ...).
 */
export async function redeemPrize(uid, orderId, onOrderId) {
  try {
    return (await callRedeemPrize({ uid, orderId, onOrderId })).data;
  } catch (e) {
    throw callError(e);
  }
}

/** The admin takes back a mistaken redemption. */
export async function undoRedeem(uid, orderId) {
  try {
    return (await callRedeemPrize({ uid, orderId, undo: true })).data;
  } catch (e) {
    throw callError(e);
  }
}

/**
 * The winner's details for the team prize (five friends and their consent) or the
 * jackpot (two competitions). Validated again on the server, accepted once.
 * Rejects with err.code = already-submitted | consent | count | incomplete |
 * contact | duplicate | same | wrong-type.
 */
export async function saveExtra(orderId, extra) {
  try {
    return (await callSavePrizeExtra({ orderId, extra })).data;
  } catch (e) {
    throw callError(e);
  }
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
