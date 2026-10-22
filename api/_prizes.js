// api/_prizes.js
//
// THE PRIZE TABLE. Weights, tiers, end date: tune the odds here and only here.
//
// The underscore keeps Vercel from exposing this file as a route.
//
// The browser (CRA cannot import from outside src/) and the Cloud Functions (the
// functions/ folder is deployed on its own) need the same table, so
// scripts/sync-prizes.js copies it to src/config/prizes.js and functions/prizes.js.
// src/config/prizes.test.js fails if either copy ever drifts, so a changed
// weight cannot ship half-updated.

/** Weights are out of TOTAL_WEIGHT. The draw is crypto.randomInt(TOTAL_WEIGHT). */
const TOTAL_WEIGHT = 1000;

/**
 * Slice order on the wheel is the order here. Slice ANGLES are equal on
 * purpose (readability); probability comes from `weight` alone.
 * `label` is the final Hebrew copy and is what Alina sees on the admin page.
 * `capped` prizes (the six biggest) are honoured ONCE per customer in total:
 * see checkRedeem() in functions/lib/wheel.js: the rule is enforced at redemption.
 * `special` names a follow-up the winner has to complete (see PrizePage).
 */
const PRIZES = [
  { id: "disc-5", tier: "common", weight: 320, label: "5% הנחה על חבילה לבחירתך" },
  { id: "disc-10", tier: "common", weight: 260, label: "10% הנחה על חבילות צילום לבחירתך (בתחרות)" },
  { id: "fast-delivery", tier: "medium", weight: 150, label: "שדרוג לאספקה מהירה" },
  { id: "disc-15-two", tier: "medium", weight: 130, label: "15% הנחה על תמונות בשתי התחרויות הבאות לבחירתך" },
  { id: "disc-20-video", tier: "low", weight: 80, label: "20% הנחה על סרטון ריל / סרטון ארוך" },
  { id: "disc-50", capped: true, tier: "rare", weight: 25, label: "50% הנחה על חבילה לבחירתך (בתחרות אחת)" },
  { id: "pack-gift", capped: true, tier: "rare", weight: 12, label: "חבילת תמונות מורחבת במתנה" },
  { id: "reel-gift", capped: true, tier: "rare", weight: 8, label: "סרטון ריל במתנה" },
  { id: "three-free", capped: true, tier: "ultra", weight: 10, label: "כרטיסייה: תמונות רגילות בחינם בשלוש התחרויות הבאות + סרטון קצר אחד" },
  {
    id: "team",
    capped: true,
    tier: "ultra",
    weight: 4,
    special: "team",
    label: "קבוצה מנצחת — הזוכה בוחר 5 חברים שמקבלים יחד איתו 50% הנחה על חבילות לבחירתם",
  },
  {
    id: "jackpot",
    capped: true,
    tier: "jackpot",
    weight: 1,
    special: "jackpot",
    label: "ג'קפוט — סרטון ארוך במתנה + חבילת תמונות מורחבת, לשתי תחרויות לבחירתך (לא שניהם באותה תחרות)",
  },
];

/**
 * The Cloud Functions region (the prize wheel's server side lives in Firebase,
 * see functions/). ONE constant: scripts/sync-prizes.js copies it to
 * functions/prizes.js and src/config/prizes.js.
 * europe-west1, not me-west1 (Tel Aviv): firebase-functions 6.6 does not list
 * me-west1 as supported and its availability could not be confirmed without a
 * Firebase login. Change it here if Itamar confirms me-west1.
 */
const FUNCTIONS_REGION = "europe-west1";

/** Last day the wheel can be spun, end of day Asia/Jerusalem. */
const PRIZE_WHEEL_UNTIL = "2026-12-31";

/**
 * Every prize is valid until the end of this day (Asia/Jerusalem). Stored on
 * each prize document at draw time.
 * PLACEHOLDER: Itamar to set the real end of season. Mirrored in
 * src/config/features.js; prizes.test.js fails if the two differ.
 */
const PRIZE_VALID_UNTIL = "2027-06-30";

module.exports = {
  PRIZES,
  TOTAL_WEIGHT,
  PRIZE_WHEEL_UNTIL,
  PRIZE_VALID_UNTIL,
  FUNCTIONS_REGION,
};
