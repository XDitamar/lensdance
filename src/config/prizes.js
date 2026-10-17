// src/config/prizes.js
//
// Browser copy of the prize table in api/_prizes.js (the source of truth for
// the odds). CRA cannot import from outside src/, so the table is duplicated
// and src/config/prizes.test.js fails if the two differ. Change api/_prizes.js
// first, then mirror it here.

import { PRIZE_WHEEL_UNTIL } from "./features";

export { PRIZE_WHEEL_UNTIL };

export const TOTAL_WEIGHT = 1000;

export const PRIZES = [
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

export const prizeById = (id) => PRIZES.find((p) => p.id === id) || null;

/** Is the wheel still open? Same rule as the server, on the visitor's clock. */
export function wheelOpen(now = new Date()) {
  const israelDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return israelDay <= PRIZE_WHEEL_UNTIL;
}
