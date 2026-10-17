// api/_prizes.js
//
// THE PRIZE TABLE. Weights, tiers, end date: tune the odds here and only here.
//
// The underscore keeps Vercel from exposing this file as a route.
//
// The browser needs the same table (slice order, tiers, end date) but CRA
// cannot import from outside src/, so src/config/prizes.js carries an ESM copy.
// src/config/prizes.test.js fails if the two ever drift, so a changed weight
// cannot ship half-updated.

/** Weights are out of TOTAL_WEIGHT. The draw is crypto.randomInt(TOTAL_WEIGHT). */
const TOTAL_WEIGHT = 1000;

/**
 * Slice order on the wheel is the order here. Slice ANGLES are equal on
 * purpose (readability); probability comes from `weight` alone.
 * `label` is the final Hebrew copy and is what Alina sees on the admin page.
 * `special` names a follow-up the winner has to complete (see PrizePage).
 */
const PRIZES = [
  { id: "disc-5", tier: "common", weight: 320, label: "5% הנחה על חבילה לבחירתך" },
  { id: "disc-10", tier: "common", weight: 260, label: "10% הנחה על חבילות צילום לבחירתך (בתחרות)" },
  { id: "fast-delivery", tier: "medium", weight: 150, label: "שדרוג לאספקה מהירה" },
  { id: "disc-15-two", tier: "medium", weight: 130, label: "15% הנחה על תמונות בשתי התחרויות הבאות לבחירתך" },
  { id: "disc-20-video", tier: "low", weight: 80, label: "20% הנחה על סרטון ריל / סרטון ארוך" },
  { id: "disc-50", tier: "rare", weight: 25, label: "50% הנחה על חבילה לבחירתך (בתחרות אחת)" },
  { id: "pack-gift", tier: "rare", weight: 12, label: "חבילת תמונות מורחבת במתנה" },
  { id: "reel-gift", tier: "rare", weight: 8, label: "סרטון ריל במתנה" },
  { id: "three-free", tier: "ultra", weight: 10, label: "כרטיסייה: שלוש התחרויות הבאות בחינם" },
  {
    id: "team",
    tier: "ultra",
    weight: 4,
    special: "team",
    label: "קבוצה מנצחת — הזוכה בוחר 5 חברים שמקבלים יחד איתו 50% הנחה על חבילות לבחירתם",
  },
  {
    id: "jackpot",
    tier: "jackpot",
    weight: 1,
    special: "jackpot",
    label: "ג'קפוט — סרטון ארוך במתנה + חבילת תמונות מורחבת, לשתי תחרויות לבחירתך (לא שניהם באותה תחרות)",
  },
];

/** Last day the wheel can be spun, end of day Asia/Jerusalem. */
const PRIZE_WHEEL_UNTIL = "2026-12-31";

/** Is the wheel still open at `now`? Compares the calendar date in Israel. */
function wheelOpen(now = new Date()) {
  const israelDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return israelDay <= PRIZE_WHEEL_UNTIL;
}

/** Pure weighted pick. `roll` is an integer in [0, TOTAL_WEIGHT). */
function pickPrize(roll) {
  let r = roll;
  for (const prize of PRIZES) {
    if (r < prize.weight) return prize;
    r -= prize.weight;
  }
  return PRIZES[PRIZES.length - 1];
}

module.exports = { PRIZES, TOTAL_WEIGHT, PRIZE_WHEEL_UNTIL, wheelOpen, pickPrize };
