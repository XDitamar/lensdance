// Pure rules of the prize wheel: no Firestore, no network. Run: cd functions && npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const W = require("../lib/wheel");
const { PRIZES, TOTAL_WEIGHT, PRIZE_VALID_UNTIL } = require("../prizes");

const NOW = new Date("2026-11-01T10:00:00Z");

/* ── dates ─────────────────────────────────────────────────────────────── */

test("the wheel is open until the end of 31.12.2026 in Israel, not in UTC", () => {
  assert.equal(W.wheelOpen(new Date("2026-12-31T21:30:00Z")), true);  // 23:30 in Israel
  assert.equal(W.wheelOpen(new Date("2026-12-31T22:30:00Z")), false); // 00:30 on 1 January
  assert.equal(W.israelDay(new Date("2026-06-15T21:30:00Z")), "2026-06-16"); // summer time, UTC+3
});

test("a prize is expired the day after its validUntil, and one with no date is expired", () => {
  assert.equal(W.isExpired("2027-06-30", new Date("2027-06-30T20:00:00Z")), false);
  assert.equal(W.isExpired("2027-06-30", new Date("2027-06-30T22:00:00Z")), true);
  assert.equal(W.isExpired(null, NOW), true);
});

/* ── the draw ──────────────────────────────────────────────────────────── */

test("100,000 draws match the weights (chi-square under 29.6, each prize within 4 sigma)", () => {
  const N = 100000;
  const counts = Object.fromEntries(PRIZES.map((p) => [p.id, 0]));
  for (let i = 0; i < N; i += 1) counts[W.drawPrize().id] += 1;
  let chi = 0;
  for (const p of PRIZES) {
    const expected = (p.weight / TOTAL_WEIGHT) * N;
    const sigma = Math.sqrt(expected * (1 - p.weight / TOTAL_WEIGHT));
    chi += (counts[p.id] - expected) ** 2 / expected;
    assert.ok(Math.abs(counts[p.id] - expected) < 4 * sigma, `${p.id}: ${counts[p.id]} vs ${expected}`);
  }
  assert.ok(chi < 29.6, `chi-square ${chi}`);
});

test("drawPrize maps the roll onto the weights exactly (first and last roll of each prize)", () => {
  let start = 0;
  for (const p of PRIZES) {
    assert.equal(W.drawPrize(() => start).id, p.id);
    assert.equal(W.drawPrize(() => start + p.weight - 1).id, p.id);
    start += p.weight;
  }
  assert.equal(W.drawPrize((n) => { assert.equal(n, TOTAL_WEIGHT); return 0; }).id, PRIZES[0].id);
});

test("codes are LD- plus 6 characters from the alphabet without 0, O, 1, I", () => {
  for (let i = 0; i < 2000; i += 1) assert.match(W.makeCode(), /^LD-[A-HJ-NP-Z2-9]{6}$/);
  assert.notEqual(W.makeCode(), W.makeCode());
});

/* ── may this order be spun? ───────────────────────────────────────────── */

const order = { userId: "u1", submittedAtMs: Date.parse("2026-10-20T10:00:00Z") };

test("checkSpinOrder: the owner's order in time is fine; everything else has a reason", () => {
  assert.equal(W.checkSpinOrder({ uid: "u1", order, now: NOW }), null);
  assert.equal(W.checkSpinOrder({ uid: "u1", order: null, now: NOW }), "order-not-found");
  assert.equal(W.checkSpinOrder({ uid: "u1", order: { ...order, userId: "u2" }, now: NOW }), "order-not-yours");
  assert.equal(W.checkSpinOrder({ uid: "u1", order: { ...order, userId: null }, now: NOW }), "order-not-yours"); // anonymous sign-up
  assert.equal(W.checkSpinOrder({ uid: "u1", order: { ...order, submittedAtMs: Date.parse("2027-01-02T10:00:00Z") }, now: NOW }), "order-too-late");
  assert.equal(W.checkSpinOrder({ uid: "u1", order: { ...order, submittedAtMs: null }, now: NOW }), "order-too-late");
});

/* ── may this prize be redeemed? ───────────────────────────────────────── */

const prize = (over = {}) => ({ prizeId: "disc-5", orderId: "A", issuedAt: 1000, validUntil: "2027-06-30", redeemed: null, ...over });
const target = (over = {}) => ({ id: "B", userId: "u1", depositPaid: true, submittedAtMs: 2000, ...over });
const redeem = (p, over = {}) => W.checkRedeem({ uid: "u1", prize: p, allPrizes: [p], target: target(), now: NOW, ...over });

test("checkRedeem: a plain prize on a later paid order of the same customer passes", () => {
  assert.equal(redeem(prize()), null);
});

test("checkRedeem: every refusal has its own reason", () => {
  assert.equal(redeem(prize({ redeemed: { at: 1, orderId: "X", by: "a" } })), "already-redeemed");
  assert.equal(redeem(prize({ validUntil: "2026-10-01" })), "expired");
  assert.equal(redeem(prize(), { target: target({ userId: "u2" }) }), "wrong-owner");
  assert.equal(redeem(prize(), { target: null }), "wrong-owner");
  assert.equal(redeem(prize(), { target: target({ id: "A" }) }), "same-order");
  assert.equal(redeem(prize(), { target: target({ depositPaid: false }) }), "unpaid");
  assert.equal(redeem(prize(), { target: target({ depositPaid: undefined }) }), "unpaid");
  assert.equal(redeem(prize(), { target: target({ submittedAtMs: 500 }) }), "not-later");
  assert.equal(redeem(prize(), { target: target({ submittedAtMs: 1000 }) }), "not-later");
});

test("checkRedeem: only the customer's EARLIEST capped prize can be redeemed, even after it was redeemed", () => {
  const first = prize({ prizeId: "disc-50", orderId: "A", issuedAt: 1000 });
  const second = prize({ prizeId: "jackpot", orderId: "C", issuedAt: 1500 });
  const plain = prize({ prizeId: "disc-5", orderId: "D", issuedAt: 900 });
  const all = [second, first, plain];
  assert.equal(redeem(first, { allPrizes: all }), null);
  assert.equal(redeem(second, { allPrizes: all }), "capped-limit");
  assert.equal(redeem(plain, { allPrizes: all }), null); // not capped: unaffected
  const firstDone = { ...first, redeemed: { at: 1, orderId: "B", by: "a" } };
  assert.equal(redeem(firstDone, { allPrizes: [second, firstDone] }), "already-redeemed");
  assert.equal(redeem(second, { allPrizes: [second, firstDone] }), "capped-limit"); // they already had their one
});

test("checkPrize (no target chosen yet) gives the reason the admin screen shows", () => {
  const p = prize({ prizeId: "disc-50" });
  assert.equal(W.checkPrize({ prize: p, allPrizes: [p], now: NOW }), null);
  assert.equal(W.checkPrize({ prize: { ...p, validUntil: "2026-10-01" }, allPrizes: [p], now: NOW }), "expired");
});

/* ── the follow-up details of the two special prizes ───────────────────── */

const friends = (n = 5) => Array.from({ length: n }, (_, i) => ({ name: `Friend ${i}`, contact: `f${i}@x.com` }));
const team = (over = {}) => ({ type: "team", friends: friends(), consent: true, ...over });
const jackpot = (over = {}) => ({ type: "jackpot", video: { id: "c1", label: "One" }, pack: { id: "c2", label: "Two" }, ...over });

test("validateExtra: the team prize needs five distinct friends and their consent", () => {
  assert.equal(W.validateExtra("team", team()), null);
  assert.equal(W.validateExtra("team", team({ consent: false })), "consent");
  assert.equal(W.validateExtra("team", team({ friends: friends(4) })), "count");
  assert.equal(W.validateExtra("team", team({ friends: [...friends(4), { name: "", contact: "x@y.com" }] })), "incomplete");
  assert.equal(W.validateExtra("team", team({ friends: [...friends(4), { name: "E", contact: "not a contact" }] })), "contact");
  assert.equal(W.validateExtra("team", team({ friends: [...friends(4), { name: "E", contact: "F0@x.com" }] })), "duplicate");
  // two phone numbers are the same friend only if their digits are identical
  assert.equal(W.validateExtra("team", team({ friends: [...friends(3), { name: "D", contact: "050-111 2222" }, { name: "E", contact: "+972501112222" }] })), null);
  assert.equal(W.validateExtra("team", team({ friends: [...friends(3), { name: "D", contact: "050-111 2222" }, { name: "E", contact: "0501112222" }] })), "duplicate");
});

test("validateExtra: the jackpot needs two DIFFERENT competitions", () => {
  assert.equal(W.validateExtra("jackpot", jackpot()), null);
  assert.equal(W.validateExtra("jackpot", jackpot({ pack: { id: "c1", label: "One" } })), "same");
  assert.equal(W.validateExtra("jackpot", jackpot({ pack: null })), "incomplete");
});

test("validateExtra: only the two special prizes take details, and the type must match", () => {
  assert.equal(W.validateExtra("disc-5", team()), "wrong-type");
  assert.equal(W.validateExtra("team", jackpot()), "wrong-type");
  assert.equal(W.validateExtra("jackpot", null), "wrong-type");
});

test("cleanExtra keeps only the fields it knows and trims them", () => {
  const dirty = team({ evil: "x", friends: friends().map((f) => ({ ...f, name: `  ${f.name}  `, admin: true })) });
  const out = W.cleanExtra("team", dirty);
  assert.deepEqual(Object.keys(out).sort(), ["consent", "friends", "type"]);
  assert.deepEqual(Object.keys(out.friends[0]).sort(), ["contact", "name"]);
  assert.equal(out.friends[0].name, "Friend 0");
  const j = W.cleanExtra("jackpot", jackpot({ video: { id: "c1", label: "L".repeat(500), extra: 1 } }));
  assert.equal(j.video.label.length, 200);
  assert.deepEqual(Object.keys(j.video).sort(), ["id", "label"]);
});

test("the table the rules read is the generated one", () => {
  assert.equal(PRIZES.length, 11);
  assert.equal(PRIZE_VALID_UNTIL, W.PRIZE_VALID_UNTIL);
  assert.ok(crypto.randomInt);
});

/* ── typing a prize code ───────────────────────────────────────────────── */

test("normaliseCode: any reasonable way of typing a code finds the same one", () => {
  for (const typed of ["LD-AB23CD", "ld-ab23cd", "  LD AB23CD  ", "ab23cd", "LDAB23CD", "ld_ab23cd", "Ld-Ab2 3Cd", "LD-AB-23CD"]) {
    assert.equal(W.normaliseCode(typed), "LD-AB23CD", JSON.stringify(typed));
  }
});

test("normaliseCode: anything that cannot be a code is null", () => {
  for (const typed of ["", "   ", null, undefined, 123, {}, "LD-", "AB23C", "AB23CDE", "LD-AB23C", "LD-AB23CDE", "AB0OCD", "AB1ICD", "קוד123", "😀😀😀😀😀😀", "x".repeat(60), "LD-AB23CD; DROP", "LD-AB23CD/../x"]) {
    assert.equal(W.normaliseCode(typed), null, JSON.stringify(typed));
  }
});

test("isTestCode: the test spin's code is recognised however it is typed", () => {
  for (const typed of ["TEST", "test", " Test ", "LD-TEST", "ld test"]) assert.equal(W.isTestCode(typed), true, typed);
  for (const typed of ["LD-AB23CD", "", null, "TESTS"]) assert.equal(W.isTestCode(typed), false, String(typed));
});

test("codeReason maps the rule reasons to what the form says", () => {
  assert.equal(W.codeReason(null), null);
  assert.equal(W.codeReason("already-redeemed"), "redeemed");
  assert.equal(W.codeReason("expired"), "expired");
  assert.equal(W.codeReason("capped-limit"), "capped-limit");
});
