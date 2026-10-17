// The server table (api/_prizes.js) and the browser copy (src/config/prizes.js)
// must be identical. A drift means the wheel shows one thing and the server
// draws another. (Regenerate the copy with: node scripts/sync-prizes.js)
import { PRIZES, TOTAL_WEIGHT, PRIZE_WHEEL_UNTIL, PRIZE_VALID_UNTIL } from "./prizes";

process.env.SPIN_SECRET = "test-secret";
const server = require("../../api/_prizes.js");
const verify = require("../../api/_verify.js");

test("browser prize table matches the server table", () => {
  expect(PRIZES).toEqual(server.PRIZES);
  expect(TOTAL_WEIGHT).toBe(server.TOTAL_WEIGHT);
  expect(PRIZE_WHEEL_UNTIL).toBe(server.PRIZE_WHEEL_UNTIL);
  expect(PRIZE_VALID_UNTIL).toBe(server.PRIZE_VALID_UNTIL);
});

test("weights add up to the total", () => {
  expect(PRIZES.reduce((s, p) => s + p.weight, 0)).toBe(TOTAL_WEIGHT);
});

test("the six biggest prizes are the capped ones", () => {
  expect(PRIZES.filter((p) => p.capped).map((p) => p.id)).toEqual([
    "disc-50", "pack-gift", "reel-gift", "three-free", "team", "jackpot",
  ]);
});

test("wheel closes after 31.12.2026 Israel time", () => {
  expect(server.wheelOpen(new Date("2026-12-31T21:30:00Z"))).toBe(true);  // 23:30 Israel
  expect(server.wheelOpen(new Date("2026-12-31T22:30:00Z"))).toBe(false); // 00:30 on 1 Jan
});

test("the redraw never lands on a capped prize and keeps the others' proportions", () => {
  const total = server.poolWeight({ excludeCapped: true });
  expect(total).toBe(940);
  const seen = {};
  for (let roll = 0; roll < total; roll += 1) {
    const p = server.pickPrize(roll, { excludeCapped: true });
    expect(p.capped).toBeFalsy();
    seen[p.id] = (seen[p.id] || 0) + 1;
  }
  expect(seen["disc-5"]).toBe(320);
  expect(seen["disc-20-video"]).toBe(80);
});

/* ── Signing and redemption ─────────────────────────────────────────────── */

const mint = (uid, prizeId, code, issuedAt, validUntil = "2027-06-30") => ({
  prizeId, code, issuedAt, validUntil,
  signature: verify.sign(verify.payloadOf(uid, prizeId, code, issuedAt, validUntil)),
});
const NOW = new Date("2026-11-01T10:00:00Z");

test("a genuine prize verifies; a forged or edited one does not", () => {
  const good = mint("u1", "disc-5", "LD-AAAA", 1000);
  expect(verify.isAuthentic("u1", good)).toBe(true);
  expect(verify.isAuthentic("u2", good)).toBe(false);                          // someone else's
  expect(verify.isAuthentic("u1", { ...good, prizeId: "jackpot" })).toBe(false); // upgraded by hand
  expect(verify.isAuthentic("u1", { ...good, validUntil: "2099-01-01" })).toBe(false); // extended
  expect(verify.isAuthentic("u1", { ...good, signature: "abc" })).toBe(false);
  expect(verify.isAuthentic("u1", { prizeId: "jackpot", code: "LD-ZZZZ", issuedAt: 5 })).toBe(false);
});

test("only the earliest verified capped prize is redeemable", () => {
  const later = mint("u1", "jackpot", "LD-LATE", 3000);
  const first = mint("u1", "disc-50", "LD-FRST", 1000);
  const plain = mint("u1", "disc-5", "LD-PLAN", 2000);
  const forged = { ...mint("u1", "disc-5", "LD-FAKE", 500), prizeId: "pack-gift" };
  const out = Object.fromEntries(
    verify.evaluatePrizes("u1", [later, first, plain, forged], NOW).map((r) => [r.code, r])
  );
  expect(out["LD-FRST"].redeemable).toBe(true);
  expect(out["LD-LATE"]).toMatchObject({ redeemable: false, reason: "capped-limit" });
  expect(out["LD-PLAN"].redeemable).toBe(true);              // not capped: unaffected
  expect(out["LD-FAKE"]).toMatchObject({ redeemable: false, reason: "unverified" });
});

test("an expired prize is not redeemable", () => {
  const old = mint("u1", "disc-5", "LD-OLD1", 1000, "2026-10-01");
  expect(verify.evaluatePrizes("u1", [old], NOW)[0]).toMatchObject({ valid: true, expired: true, redeemable: false, reason: "expired" });
});

test("holdsCapped sees only authentic capped prizes", () => {
  expect(verify.holdsCapped("u1", [mint("u1", "disc-5", "LD-AAAA", 1)])).toBe(false);
  expect(verify.holdsCapped("u1", [mint("u1", "team", "LD-TEAM", 1)])).toBe(true);
  expect(verify.holdsCapped("u1", [{ prizeId: "team", code: "x", issuedAt: 1, validUntil: "2027-06-30", signature: "nope" }])).toBe(false);
});
