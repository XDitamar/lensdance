// The server table (api/_prizes.js) and the browser copy (src/config/prizes.js)
// must be identical. A drift means the wheel shows one odds table and the
// server draws another.
import { PRIZES, TOTAL_WEIGHT, PRIZE_WHEEL_UNTIL } from "./prizes";

const server = require("../../api/_prizes.js");

test("browser prize table matches the server table", () => {
  expect(PRIZES).toEqual(server.PRIZES);
  expect(TOTAL_WEIGHT).toBe(server.TOTAL_WEIGHT);
  expect(PRIZE_WHEEL_UNTIL).toBe(server.PRIZE_WHEEL_UNTIL);
});

test("weights add up to the total", () => {
  expect(PRIZES.reduce((s, p) => s + p.weight, 0)).toBe(TOTAL_WEIGHT);
});

test("wheel closes after 31.12.2026 Israel time", () => {
  expect(server.wheelOpen(new Date("2026-12-31T21:30:00Z"))).toBe(true);  // 23:30 Israel
  expect(server.wheelOpen(new Date("2026-12-31T22:30:00Z"))).toBe(false); // 00:30 on 1 Jan
});
