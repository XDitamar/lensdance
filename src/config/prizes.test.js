// The prizes table has ONE source (api/_prizes.js) and two generated copies:
// the browser's (src/config/prizes.js) and the Cloud Functions' (functions/prizes.js).
// A drift means the wheel shows one thing and the server draws another.
// Regenerate the copies with: node scripts/sync-prizes.js
//
// The rules of the wheel themselves (the draw, who may spin, who may redeem) are
// tested where they live: functions/test/*.test.js (run `cd functions && npm test`).
import {
  PRIZES, TOTAL_WEIGHT, PRIZE_WHEEL_UNTIL, PRIZE_VALID_UNTIL, FUNCTIONS_REGION,
  wheelOpen, isExpired, israelDay, isCapped,
} from "./prizes";
import { PRIZE_WHEEL_UNTIL as FEATURE_UNTIL, PRIZE_VALID_UNTIL as FEATURE_VALID } from "./features";

const source = require("../../api/_prizes.js");
const fn = require("../../functions/prizes.js");
const wheel = require("../../functions/lib/wheel.js");

test("the browser copy matches the source (api/_prizes.js) on everything", () => {
  expect(PRIZES).toEqual(source.PRIZES);
  expect(TOTAL_WEIGHT).toBe(source.TOTAL_WEIGHT);
  expect(PRIZE_WHEEL_UNTIL).toBe(source.PRIZE_WHEEL_UNTIL);
  expect(PRIZE_VALID_UNTIL).toBe(source.PRIZE_VALID_UNTIL);
  expect(FUNCTIONS_REGION).toBe(source.FUNCTIONS_REGION);
});

test("the Cloud Functions copy (functions/prizes.js) matches the source on everything", () => {
  expect(fn.PRIZES).toEqual(source.PRIZES);
  expect(fn.TOTAL_WEIGHT).toBe(source.TOTAL_WEIGHT);
  expect(fn.PRIZE_WHEEL_UNTIL).toBe(source.PRIZE_WHEEL_UNTIL);
  expect(fn.PRIZE_VALID_UNTIL).toBe(source.PRIZE_VALID_UNTIL);
  expect(fn.FUNCTIONS_REGION).toBe(source.FUNCTIONS_REGION);
});

test("the dates in src/config/features.js are the same ones", () => {
  expect(FEATURE_UNTIL).toBe(source.PRIZE_WHEEL_UNTIL);
  expect(FEATURE_VALID).toBe(source.PRIZE_VALID_UNTIL);
});

test("weights add up to the total", () => {
  expect(PRIZES.reduce((s, p) => s + p.weight, 0)).toBe(TOTAL_WEIGHT);
});

test("the six biggest prizes are the capped ones", () => {
  expect(PRIZES.filter((p) => p.capped).map((p) => p.id)).toEqual([
    "disc-50", "pack-gift", "reel-gift", "three-free", "team", "jackpot",
  ]);
  expect(PRIZES.every((p) => isCapped(p.id) === !!p.capped)).toBe(true);
});

test("the screen's date helpers agree with the server's (the wheel closes after 31.12.2026 Israel time)", () => {
  for (const iso of ["2026-12-31T21:30:00Z", "2026-12-31T22:30:00Z", "2026-06-15T21:30:00Z", "2027-06-30T20:00:00Z", "2027-06-30T22:00:00Z"]) {
    const d = new Date(iso);
    expect(israelDay(d)).toBe(wheel.israelDay(d));
    expect(wheelOpen(d)).toBe(wheel.wheelOpen(d));
    expect(isExpired("2027-06-30", d)).toBe(wheel.isExpired("2027-06-30", d));
  }
  expect(wheelOpen(new Date("2026-12-31T21:30:00Z"))).toBe(true);
  expect(wheelOpen(new Date("2026-12-31T22:30:00Z"))).toBe(false);
});
