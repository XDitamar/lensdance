// The server table (api/_prizes.js) and the browser copy (src/config/prizes.js)
// must be identical. A drift means the wheel shows one thing and the server
// draws another. (Regenerate the copy with: node scripts/sync-prizes.js)
//
// The rest tests the wheel's rules end to end on the server side: the
// deterministic per-order draw, signing and tampering, the order check in
// api/spin.js, and the redemption rules.
import { PRIZES, TOTAL_WEIGHT, PRIZE_WHEEL_UNTIL, PRIZE_VALID_UNTIL } from "./prizes";

process.env.SPIN_SECRET = "test-secret";
const server = require("../../api/_prizes.js");
const verify = require("../../api/_verify.js");
const spin = require("../../api/spin.js");
const verifyPrize = require("../../api/verify-prize.js");

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

/* ── The deterministic draw ─────────────────────────────────────────────── */

const ORDER = "AbCdEfGhIjKlMnOpQrSt";
const ORDER_B = "ZyXwVuTsRqPoNmLkJiHg";

test("the same order always draws the same prize and code; it cannot be rerolled", () => {
  const first = verify.drawForOrder("u1", ORDER);
  for (let i = 0; i < 20; i += 1) expect(verify.drawForOrder("u1", ORDER)).toEqual(first);
  expect(first.code).toMatch(/^LD-[A-HJ-NP-Z2-9]{4}$/);
});

test("the draw depends on the customer and the order, and needs the secret", () => {
  const seen = new Set();
  for (let i = 0; i < 40; i += 1) seen.add(verify.drawForOrder("u1", `order${String(i).padStart(12, "0")}`).prize.id);
  expect(seen.size).toBeGreaterThan(1);
  const a = verify.drawForOrder("u1", ORDER);
  const b = verify.drawForOrder("u2", ORDER);
  expect(a.code === b.code && a.prize.id === b.prize.id).toBe(false);
  const saved = process.env.SPIN_SECRET;
  delete process.env.SPIN_SECRET;
  expect(verify.drawForOrder("u1", ORDER)).toBeNull();
  process.env.SPIN_SECRET = saved;
});

/* ── Signing and tampering ──────────────────────────────────────────────── */

const mint = (uid, prizeId, code, issuedAt, orderId, validUntil = "2027-06-30") => ({
  prizeId, code, issuedAt, validUntil, ...(orderId ? { orderId } : {}),
  signature: verify.sign(verify.payloadOf(uid, prizeId, code, issuedAt, validUntil, orderId)),
});
const NOW = new Date("2026-11-01T10:00:00Z");

test("a genuine prize verifies; a forged or edited one does not", () => {
  const good = mint("u1", "disc-5", "LD-AAAA", 1000, ORDER);
  expect(verify.isAuthentic("u1", good)).toBe(true);
  expect(verify.isAuthentic("u2", good)).toBe(false);                                   // someone else's
  expect(verify.isAuthentic("u1", { ...good, prizeId: "jackpot" })).toBe(false);        // upgraded by hand
  expect(verify.isAuthentic("u1", { ...good, validUntil: "2099-01-01" })).toBe(false);  // extended
  expect(verify.isAuthentic("u1", { ...good, orderId: ORDER_B })).toBe(false);          // moved to another order
  const { orderId, ...withoutOrder } = good;
  expect(verify.isAuthentic("u1", withoutOrder)).toBe(false);                           // order stripped
  expect(verify.isAuthentic("u1", { ...good, signature: "abc" })).toBe(false);
  expect(verify.isAuthentic("u1", { prizeId: "jackpot", code: "LD-ZZZZ", issuedAt: 5 })).toBe(false);
});

test("a prize issued before orders existed (no orderId) still verifies, and cannot gain an order", () => {
  const legacy = mint("u1", "disc-5", "LD-OLDX", 1000);
  expect(verify.isAuthentic("u1", legacy)).toBe(true);
  expect(verify.isAuthentic("u1", { ...legacy, orderId: ORDER })).toBe(false);
});

test("only the earliest verified capped prize is redeemable", () => {
  const later = mint("u1", "jackpot", "LD-LATE", 3000, ORDER_B);
  const first = mint("u1", "disc-50", "LD-FRST", 1000, ORDER);
  const plain = mint("u1", "disc-5", "LD-PLAN", 2000, "plainOrder1234567890");
  const forged = { ...mint("u1", "disc-5", "LD-FAKE", 500, "fakeOrder12345678901"), prizeId: "pack-gift" };
  const out = Object.fromEntries(
    verify.evaluatePrizes("u1", [later, first, plain, forged], NOW).map((r) => [r.code, r])
  );
  expect(out["LD-FRST"].redeemable).toBe(true);
  expect(out["LD-LATE"]).toMatchObject({ redeemable: false, reason: "capped-limit" });
  expect(out["LD-PLAN"].redeemable).toBe(true);
  expect(out["LD-FAKE"]).toMatchObject({ redeemable: false, reason: "unverified" });
});

test("two records for one order count once", () => {
  const a = mint("u1", "disc-5", "LD-ONE1", 1000, ORDER);
  const b = mint("u1", "disc-5", "LD-ONE2", 1500, ORDER);
  const out = Object.fromEntries(verify.evaluatePrizes("u1", [b, a], NOW).map((r) => [r.code, r]));
  expect(out["LD-ONE1"].redeemable).toBe(true);
  expect(out["LD-ONE2"]).toMatchObject({ redeemable: false, reason: "duplicate-order" });
});

test("an expired prize is not redeemable", () => {
  const old = mint("u1", "disc-5", "LD-OLD1", 1000, ORDER, "2026-10-01");
  expect(verify.evaluatePrizes("u1", [old], NOW)[0]).toMatchObject({ valid: true, expired: true, redeemable: false, reason: "expired" });
});

/* ── Redemption: a later order, deposit paid, never the winning order ───── */

test("redemption needs a later, paid order of the customer's, not the winning one", () => {
  const prize = mint("u1", "disc-5", "LD-AAAA", 1000, ORDER);
  const later = { id: ORDER_B, userId: "u1", depositPaid: true, submittedAt: 2000 };
  expect(verify.canRedeemOn("u1", prize, later)).toEqual({ ok: true, reason: null });
  expect(verify.canRedeemOn("u1", prize, { ...later, id: ORDER })).toMatchObject({ ok: false, reason: "same-order" });
  expect(verify.canRedeemOn("u1", prize, { ...later, depositPaid: false })).toMatchObject({ ok: false, reason: "unpaid" });
  expect(verify.canRedeemOn("u1", prize, { ...later, depositPaid: undefined })).toMatchObject({ ok: false, reason: "unpaid" });
  expect(verify.canRedeemOn("u1", prize, { ...later, submittedAt: 500 })).toMatchObject({ ok: false, reason: "not-later" });
  expect(verify.canRedeemOn("u1", prize, { ...later, userId: "u2" })).toMatchObject({ ok: false, reason: "wrong-owner" });
  expect(verify.canRedeemOn("u1", prize, null)).toMatchObject({ ok: false, reason: "wrong-owner" });
});

test("a prize from before orders existed is redeemable only on a later paid order", () => {
  const legacy = mint("u1", "disc-5", "LD-OLDX", 1000);
  const order = { id: ORDER_B, userId: "u1", depositPaid: true, submittedAt: 2000 };
  expect(verify.canRedeemOn("u1", legacy, order).ok).toBe(true);
  expect(verify.canRedeemOn("u1", legacy, { ...order, submittedAt: 900 }).reason).toBe("not-later");
});

/* ── api/spin.js: the order check, the end date, configuration ──────────── */

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

/** Fake the two services spin.js talks to. */
function mockServices({ uid = "u1", order }) {
  global.fetch = jest.fn(async (url) => {
    if (String(url).includes("identitytoolkit")) {
      return { ok: true, status: 200, json: async () => ({ users: [{ localId: uid, email: `${uid}@x.com` }] }) };
    }
    if (order === "denied") return { ok: false, status: 403, json: async () => ({}) };
    if (order === "down") return { ok: false, status: 500, json: async () => ({}) };
    return {
      ok: true, status: 200,
      json: async () => ({
        fields: {
          ...(order.userId ? { userId: { stringValue: order.userId } } : {}),
          ...(order.submittedAt ? { submittedAt: { timestampValue: new Date(order.submittedAt).toISOString() } } : {}),
          depositPaid: { booleanValue: !!order.depositPaid },
        },
      }),
    };
  });
}

const call = (handler, { token = "tok", body = {} } = {}) =>
  new Promise((resolve) => {
    const res = { code: 0, status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); } };
    handler({ method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
  });

const ORDER_OK = { userId: "u1", submittedAt: Date.parse("2026-10-20T10:00:00Z") };

test("spin: the owner of a real order gets the deterministic, signed prize for it", async () => {
  mockServices({ order: ORDER_OK });
  const a = await call(spin, { body: { orderId: ORDER } });
  const b = await call(spin, { body: { orderId: ORDER } });
  expect(a.status).toBe(200);
  expect(b.body).toEqual(a.body);                                   // spinning again cannot reroll
  expect(a.body.orderId).toBe(ORDER);
  expect(a.body.issuedAt).toBe(ORDER_OK.submittedAt);               // the order's time, not "now"
  expect(a.body.validUntil).toBe(PRIZE_VALID_UNTIL);
  expect(PRIZES[a.body.index].id).toBe(a.body.prize.id);
  const record = { prizeId: a.body.prize.id, code: a.body.code, issuedAt: a.body.issuedAt, validUntil: a.body.validUntil, orderId: a.body.orderId, signature: a.body.signature };
  expect(verify.isAuthentic("u1", record)).toBe(true);
});

test("spin: someone else's order, a missing order and a malformed id are refused", async () => {
  mockServices({ order: { ...ORDER_OK, userId: "u2" } });
  expect(await call(spin, { body: { orderId: ORDER } })).toMatchObject({ status: 403, body: { error: "order-not-yours" } });
  mockServices({ order: "denied" });
  expect(await call(spin, { body: { orderId: ORDER } })).toMatchObject({ status: 404, body: { error: "order-not-found" } });
  mockServices({ order: ORDER_OK });
  expect(await call(spin, { body: { orderId: "../users/u1" } })).toMatchObject({ status: 400, body: { error: "bad-order" } });
  expect(await call(spin, { body: {} })).toMatchObject({ status: 400 });
});

test("spin: an order placed after 31.12.2026, or with no timestamp, earns no spin", async () => {
  mockServices({ order: { userId: "u1", submittedAt: Date.parse("2027-01-02T10:00:00Z") } });
  expect(await call(spin, { body: { orderId: ORDER } })).toMatchObject({ status: 410, body: { error: "order-too-late" } });
  mockServices({ order: { userId: "u1" } });
  expect(await call(spin, { body: { orderId: ORDER } })).toMatchObject({ status: 410, body: { error: "order-too-late" } });
});

test("spin: the wheel is closed after the end date, whatever the order", async () => {
  mockServices({ order: ORDER_OK });
  jest.useFakeTimers().setSystemTime(new Date("2027-01-02T10:00:00Z"));
  const out = await call(spin, { body: { orderId: ORDER } });
  jest.useRealTimers();
  expect(out).toMatchObject({ status: 410, body: { error: "wheel-ended" } });
});

test("spin: not signed in, bad token, unconfigured server and a failing lookup each answer distinctly", async () => {
  expect(await call(spin, { token: null })).toMatchObject({ status: 401, body: { error: "missing-token" } });
  global.fetch = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({}) }));
  expect(await call(spin, { body: { orderId: ORDER } })).toMatchObject({ status: 401, body: { error: "invalid-token" } });
  mockServices({ order: ORDER_OK });
  const saved = process.env.SPIN_SECRET;
  delete process.env.SPIN_SECRET;
  expect(await call(spin, { body: { orderId: ORDER } })).toMatchObject({ status: 503, body: { error: "not-configured" } });
  process.env.SPIN_SECRET = saved;
  mockServices({ order: "down" });
  expect(await call(spin, { body: { orderId: ORDER } })).toMatchObject({ status: 502, body: { error: "verification-unavailable" } });
});

/* ── api/verify-prize.js ────────────────────────────────────────────────── */

test("verify-prize: a customer checks only their own prizes, and cannot ask about an order", async () => {
  mockServices({ uid: "u1", order: ORDER_OK });
  const prize = mint("u1", "disc-5", "LD-AAAA", 1000, ORDER);
  const own = await call(verifyPrize, { body: { prizes: [prize] } });
  expect(own.body.results[0]).toMatchObject({ valid: true, redeemable: true });
  expect(await call(verifyPrize, { body: { uid: "u2", prizes: [prize] } })).toMatchObject({ status: 403 });
  expect(await call(verifyPrize, { body: { prizes: [prize], redeemOnOrderId: ORDER_B } })).toMatchObject({ status: 403 });
});

test("verify-prize: the admin checks a prize against a specific order", async () => {
  process.env.ADMIN_EMAIL = "lensdance29@gmail.com";
  const prize = mint("u1", "disc-5", "LD-AAAA", 1000, ORDER);
  const adminFetch = (order) => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes("identitytoolkit")) {
        return { ok: true, status: 200, json: async () => ({ users: [{ localId: "admin1", email: "lensdance29@gmail.com" }] }) };
      }
      return { ok: true, status: 200, json: async () => ({ fields: { userId: { stringValue: order.userId }, depositPaid: { booleanValue: order.depositPaid }, submittedAt: { timestampValue: new Date(order.submittedAt).toISOString() } } }) };
    });
  };
  adminFetch({ userId: "u1", depositPaid: true, submittedAt: 2000 });
  let out = await call(verifyPrize, { body: { uid: "u1", prizes: [prize], redeemOnOrderId: ORDER_B } });
  expect(out.body.results[0].redeemOnOrder).toEqual({ ok: true, reason: null });
  adminFetch({ userId: "u1", depositPaid: false, submittedAt: 2000 });
  out = await call(verifyPrize, { body: { uid: "u1", prizes: [prize], redeemOnOrderId: ORDER_B } });
  expect(out.body.results[0].redeemOnOrder).toMatchObject({ ok: false, reason: "unpaid" });
  adminFetch({ userId: "u1", depositPaid: true, submittedAt: 2000 });
  out = await call(verifyPrize, { body: { uid: "u1", prizes: [prize], redeemOnOrderId: ORDER } });
  expect(out.body.results[0].redeemOnOrder).toMatchObject({ ok: false, reason: "same-order" });
});
