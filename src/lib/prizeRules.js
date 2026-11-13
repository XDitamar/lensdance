// src/lib/prizeRules.js
//
// The reasons a prize cannot be redeemed, for the admin screen to show BEFORE a
// button is pressed. This is a display copy of checkPrize / checkTarget in
// functions/lib/wheel.js, which is the only place that actually decides:
// redeemPrize re-checks everything on the server inside a transaction, so a
// wrong answer here can mislead a screen but never let a redemption through.
// src/lib/rewards.test.js runs both over the same table of cases and fails if
// they ever disagree.

import { isCapped, isExpired } from "../config/prizes";

/**
 * The prize itself. `prize` and each of `allPrizes` = { prizeId, orderId,
 * issuedAt (ms), validUntil, redeemed }. Returns null, or "already-redeemed" |
 * "expired" | "capped-limit".
 */
export function checkPrize({ prize, allPrizes, now = new Date() }) {
  if (prize.redeemed) return "already-redeemed";
  if (isExpired(prize.validUntil, now)) return "expired";
  if (isCapped(prize.prizeId)) {
    const capped = (allPrizes || [])
      .filter((p) => isCapped(p.prizeId))
      .sort((a, b) => a.issuedAt - b.issuedAt || String(a.orderId).localeCompare(String(b.orderId)));
    if (capped.length && capped[0].orderId !== prize.orderId) return "capped-limit";
  }
  return null;
}

/**
 * The order the prize would be spent on. `target` = { id, userId, depositPaid,
 * submittedAtMs } or null. Returns null, or "wrong-owner" | "same-order" |
 * "unpaid" | "not-later".
 */
export function checkTarget({ uid, prize, target }) {
  if (!target || !target.userId || target.userId !== uid) return "wrong-owner";
  if (target.id === prize.orderId) return "same-order";
  if (target.depositPaid !== true) return "unpaid";
  if (!(Number(target.submittedAtMs) > Number(prize.issuedAt))) return "not-later";
  return null;
}
