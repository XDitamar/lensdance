// src/config/features.js
//
// Things that are built but not switched on.
//
// A flag rather than commented-out blocks. Hiding a feature by commenting it
// out means editing four files in four ways, and switching it back on means
// finding all four again and hoping nothing was half-deleted in between —
// which is how a feature comes back subtly broken. One constant, one place,
// and every entry point reads it.

/**
 * The prize wheel: /prize, the settings row, the admin spin field, and the
 * spin credited when a deposit is marked paid.
 *
 * The /prize route in src/App.js is live while this is true. Switch both off
 * together if it ever has to be pulled again.
 */
export const PRIZE_WHEEL = true;

/**
 * Last day the wheel can be spun (end of day, Asia/Jerusalem). api/spin.js
 * enforces it too; the copy in api/_prizes.js is checked against this one by
 * src/config/prizes.test.js.
 */
export const PRIZE_WHEEL_UNTIL = "2026-12-31";

/**
 * Every prize is valid until the end of this day (Asia/Jerusalem): after it a
 * prize can no longer be redeemed. Signed into each prize at draw time.
 *
 * PLACEHOLDER: "2027-06-30" is a guess at the end of the season. Itamar to set
 * the real date. Mirrored in api/_prizes.js (prizes.test.js fails if they
 * differ); change both. Prizes already drawn keep the date they were signed
 * with.
 */
export const PRIZE_VALID_UNTIL = "2027-06-30";
