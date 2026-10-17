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
 * `capped` prizes (the six biggest) are honoured ONCE per customer in total:
 * see evaluatePrizes() in ./_verify.js: the rule is enforced at redemption.
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
  { id: "three-free", capped: true, tier: "ultra", weight: 10, label: "כרטיסייה: שלוש התחרויות הבאות בחינם" },
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

/** Last day the wheel can be spun, end of day Asia/Jerusalem. */
const PRIZE_WHEEL_UNTIL = "2026-12-31";

/**
 * Every prize is valid until the end of this day (Asia/Jerusalem). Signed into
 * each prize at draw time.
 * PLACEHOLDER: Itamar to set the real end of season. Mirrored in
 * src/config/features.js; prizes.test.js fails if the two differ.
 */
const PRIZE_VALID_UNTIL = "2027-06-30";

/** The calendar date in Israel, "YYYY-MM-DD". */
function israelDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Is the wheel still open at `now`? */
function wheelOpen(now = new Date()) {
  return israelDay(now) <= PRIZE_WHEEL_UNTIL;
}

/** Has a prize that was valid until `validUntil` ("YYYY-MM-DD") run out? */
function isExpired(validUntil, now = new Date()) {
  return !validUntil || israelDay(now) > validUntil;
}

const isCapped = (id) => !!PRIZES.find((p) => p.id === id)?.capped;

/**
 * Pure weighted pick. `roll` is an integer in [0, TOTAL_WEIGHT). The weights
 * table is the only place the odds live.
 */
function pickPrize(roll) {
  let r = roll;
  for (const prize of PRIZES) {
    if (r < prize.weight) return prize;
    r -= prize.weight;
  }
  return PRIZES[PRIZES.length - 1];
}

module.exports = {
  PRIZES,
  TOTAL_WEIGHT,
  PRIZE_WHEEL_UNTIL,
  PRIZE_VALID_UNTIL,
  israelDay,
  wheelOpen,
  isExpired,
  isCapped,
  pickPrize,
};
