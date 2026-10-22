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

/* ── Evaluating prizes against spin records and redemption notes ─────────── */

test("evaluatePrizes: a spin record that vouches for a prize makes it valid, and redeemedAt makes it refused", () => {
  const rec = { prizeId: "disc-5", code: "LD-SPIN", orderId: ORDER, issuedAt: 1000, validUntil: "2027-06-30" }; // no signature at all
  const spins = new Map([[ORDER, { status: "ok", prizeId: "disc-5", code: "LD-SPIN", redeemedAt: null }]]);
  expect(verify.evaluatePrizes("u1", [rec], NOW, { spins })[0]).toMatchObject({ valid: true, redeemable: true, spinRecord: true });
  spins.set(ORDER, { status: "ok", prizeId: "disc-5", code: "LD-SPIN", redeemedAt: 5555 });
  expect(verify.evaluatePrizes("u1", [rec], NOW, { spins })[0]).toMatchObject({ redeemable: false, reason: "already-redeemed", redeemedAt: 5555 });
});

test("evaluatePrizes: a spin record that is forged, or disagrees with the prize, poisons it", () => {
  const signed = mint("u1", "disc-5", "LD-GOOD", 1000, ORDER);             // a perfectly signed record...
  const forged = new Map([[ORDER, { status: "invalid", prizeId: "disc-5", code: "LD-GOOD", redeemedAt: null }]]);
  expect(verify.evaluatePrizes("u1", [signed], NOW, { spins: forged })[0]).toMatchObject({ valid: false, reason: "unverified" });
  const other = new Map([[ORDER, { status: "ok", prizeId: "jackpot", code: "LD-GOOD", redeemedAt: null }]]);
  expect(verify.evaluatePrizes("u1", [signed], NOW, { spins: other })[0]).toMatchObject({ valid: false, reason: "unverified" });
});

test("evaluatePrizes: the retention note still blocks older prizes, and a redeemed capped prize still counts as the one", () => {
  const first = mint("u1", "disc-50", "LD-CAP1", 1000, ORDER);
  const later = mint("u1", "jackpot", "LD-CAP2", 2000, ORDER_B);
  const out = Object.fromEntries(
    verify.evaluatePrizes("u1", [first, later], NOW, { redeemed: new Map([["LD-CAP1", 9999]]) }).map((r) => [r.code, r])
  );
  expect(out["LD-CAP1"]).toMatchObject({ redeemable: false, reason: "already-redeemed" });
  expect(out["LD-CAP2"]).toMatchObject({ redeemable: false, reason: "capped-limit" }); // they already had their one
});

test("a spin record's signature is bound to the customer, the order, the prize and the code", () => {
  const sig = verify.signSpin("u1", ORDER, "disc-5", "LD-AAAA");
  const rec = { uid: "u1", prizeId: "disc-5", code: "LD-AAAA", sig };
  expect(verify.isSpinAuthentic("u1", ORDER, rec)).toBe(true);
  expect(verify.isSpinAuthentic("u2", ORDER, { ...rec, uid: "u2" })).toBe(false);   // someone else's signature
  expect(verify.isSpinAuthentic("u1", ORDER_B, rec)).toBe(false);                   // moved to another order
  expect(verify.isSpinAuthentic("u1", ORDER, { ...rec, prizeId: "jackpot" })).toBe(false); // upgraded
  expect(verify.isSpinAuthentic("u1", ORDER, { ...rec, code: "LD-BBBB" })).toBe(false);
  expect(verify.isSpinAuthentic("u1", ORDER, { ...rec, uid: "u2" })).toBe(false);   // stored under the wrong uid
});

/* ── The network, faked: Google sign-in, orders, spin records, redemption notes ── */

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

const ADMIN = "lensdance29@gmail.com";
const asDoc = (o) => ({
  fields: Object.fromEntries(
    Object.entries(o).flatMap(([k, v]) => {
      if (v === undefined) return [];
      if (v === null) return [[k, { nullValue: null }]];
      if (typeof v === "boolean") return [[k, { booleanValue: v }]];
      if (typeof v === "number") return [[k, { timestampValue: new Date(v).toISOString() }]];
      return [[k, { stringValue: v }]];
    })
  ),
});

/**
 * orders:    { id: { userId, submittedAt, depositPaid } } | "denied" | "down"
 * spins:     { orderId: record } where a record is { uid, prizeId, label, code, sig, createdAt, redeemedAt },
 *            or the string "denied" to model the spins rules not being published
 * retention: { uid: { code: { at } } }
 * who:       { token: { localId, email } }
 */
function net({ orders = {}, spins = {}, retention = {}, who = { tok: { localId: "u1", email: "u1@x.com" } }, ordersMode } = {}) {
  global.fetch = jest.fn(async (url, opts = {}) => {
    url = String(url);
    const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    const bearer = (opts.headers?.Authorization || "").replace(/^Bearer\s+/i, "");
    if (url.includes("identitytoolkit")) {
      const u = who[JSON.parse(opts.body).idToken];
      return u ? json(200, { users: [u] }) : json(400, {});
    }
    const caller = who[bearer];
    const isAdmin = caller?.email === ADMIN;
    if (url.includes("/documents/registrations/")) {
      if (ordersMode === "denied") return json(403, {});
      if (ordersMode === "down") return json(500, {});
      const o = orders[url.split("/documents/registrations/")[1]];
      if (!o || !caller || (o.userId !== caller.localId && !isAdmin)) return json(403, {});
      return json(200, asDoc(o));
    }
    if (url.includes("/documents/spins/")) {
      const id = url.split("/documents/spins/")[1];
      if (spins === "denied") return json(403, {});
      const rec = spins[id];
      if (!rec) return json(404, {});
      if (!caller || (rec.uid !== caller.localId && !isAdmin)) return json(403, {});
      return json(200, asDoc(rec));
    }
    if (url.includes(":runQuery")) {
      const q = JSON.parse(opts.body).structuredQuery;
      if (q.from[0].collectionId !== "spins") return json(200, []);
      const wanted = q.where.fieldFilter.value.stringValue;
      if (spins === "denied" || !caller || (wanted !== caller.localId && !isAdmin)) return json(403, {});
      return json(200, Object.entries(spins).filter(([, r]) => r.uid === wanted).map(([id, r]) => ({ document: { name: `projects/p/databases/(default)/documents/spins/${id}`, ...asDoc(r) } })));
    }
    if (url.includes("/documents/retention/")) {
      const uid = url.split("/documents/retention/")[1];
      const r = retention[uid];
      if (!r) return json(404, {});
      return json(200, { fields: { redeemed: { mapValue: { fields: Object.fromEntries(Object.entries(r).map(([c, v]) => [c, { mapValue: { fields: { at: { integerValue: String(v.at) } } } }])) } } } });
    }
    throw new Error("unmocked fetch: " + url);
  });
}

const call = (handler, { token = "tok", body = {} } = {}) =>
  new Promise((resolve) => {
    const res = { code: 0, status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); } };
    handler({ method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
  });

const ORDER_OK = { userId: "u1", submittedAt: Date.parse("2026-10-20T10:00:00Z") };
const spinRec = (uid, orderId, prizeId, code, over = {}) => ({
  uid, prizeId, label: "x", code, sig: verify.signSpin(uid, orderId, prizeId, code), createdAt: Date.parse("2026-10-21T10:00:00Z"), redeemedAt: null, ...over,
});

/* ── api/spin.js ─────────────────────────────────────────────────────────── */

test("spin: the owner of a real order gets the deterministic, signed prize for it, plus the spin signature to save", async () => {
  net({ orders: { [ORDER]: ORDER_OK } });
  const a = await call(spin, { body: { orderId: ORDER } });
  const b = await call(spin, { body: { orderId: ORDER } });
  expect(a.status).toBe(200);
  expect(b.body).toEqual(a.body);                                   // spinning again cannot reroll
  expect(a.body.orderId).toBe(ORDER);
  expect(a.body.issuedAt).toBe(ORDER_OK.submittedAt);               // the order's time, not "now"
  expect(a.body.validUntil).toBe(PRIZE_VALID_UNTIL);
  expect(a.body.persisted).toBe(false);
  expect(PRIZES[a.body.index].id).toBe(a.body.prize.id);
  const record = { prizeId: a.body.prize.id, code: a.body.code, issuedAt: a.body.issuedAt, validUntil: a.body.validUntil, orderId: a.body.orderId, signature: a.body.signature };
  expect(verify.isAuthentic("u1", record)).toBe(true);
  expect(verify.isSpinAuthentic("u1", ORDER, { uid: "u1", prizeId: a.body.prize.id, code: a.body.code, sig: a.body.sig })).toBe(true);
});

test("spin: an order that already has a genuine spin record returns THAT prize, never a redraw", async () => {
  const drawn = verify.drawForOrder("u1", ORDER).prize.id;
  const stored = drawn === "jackpot" ? "disc-5" : "jackpot";          // deliberately NOT what the draw would give
  net({ orders: { [ORDER]: ORDER_OK }, spins: { [ORDER]: spinRec("u1", ORDER, stored, "LD-KEEP", { redeemedAt: Date.parse("2026-11-02T10:00:00Z") }) } });
  const out = await call(spin, { body: { orderId: ORDER } });
  expect(out.status).toBe(200);
  expect(out.body.prize.id).toBe(stored);
  expect(out.body.code).toBe("LD-KEEP");
  expect(out.body.persisted).toBe(true);
  expect(out.body.redeemedAt).toBe(Date.parse("2026-11-02T10:00:00Z"));
});

test("spin: a spin record that is forged is refused, not redrawn or trusted", async () => {
  net({ orders: { [ORDER]: ORDER_OK }, spins: { [ORDER]: { ...spinRec("u1", ORDER, "jackpot", "LD-FAKE"), sig: "0".repeat(32) } } });
  expect(await call(spin, { body: { orderId: ORDER } })).toMatchObject({ status: 409, body: { error: "spin-record-invalid" } });
});

test("spin: if the spins rules are not published the draw still works (just not saved)", async () => {
  net({ orders: { [ORDER]: ORDER_OK }, spins: "denied" });
  const out = await call(spin, { body: { orderId: ORDER } });
  expect(out.status).toBe(200);
  expect(out.body.persisted).toBe(false);
  expect(out.body.sig).toMatch(/^[0-9a-f]{32}$/);
});

test("spin: someone else's order, a missing order and a malformed id are refused", async () => {
  net({ orders: { [ORDER]: { ...ORDER_OK, userId: "u2" } } });
  expect((await call(spin, { body: { orderId: ORDER } })).status).toBe(404);   // the rules hide it: 'not found'
  net({ ordersMode: "denied" });
  expect(await call(spin, { body: { orderId: ORDER } })).toMatchObject({ status: 404, body: { error: "order-not-found" } });
  net({ orders: { [ORDER]: ORDER_OK } });
  expect(await call(spin, { body: { orderId: "../users/u1" } })).toMatchObject({ status: 400, body: { error: "bad-order" } });
  expect(await call(spin, { body: {} })).toMatchObject({ status: 400 });
});

test("spin: an order placed after 31.12.2026, or with no timestamp, earns no spin", async () => {
  net({ orders: { [ORDER]: { userId: "u1", submittedAt: Date.parse("2027-01-02T10:00:00Z") } } });
  expect(await call(spin, { body: { orderId: ORDER } })).toMatchObject({ status: 410, body: { error: "order-too-late" } });
  net({ orders: { [ORDER]: { userId: "u1" } } });
  expect(await call(spin, { body: { orderId: ORDER } })).toMatchObject({ status: 410, body: { error: "order-too-late" } });
});

test("spin: the wheel is closed after the end date, whatever the order", async () => {
  net({ orders: { [ORDER]: ORDER_OK } });
  jest.useFakeTimers().setSystemTime(new Date("2027-01-02T10:00:00Z"));
  const out = await call(spin, { body: { orderId: ORDER } });
  jest.useRealTimers();
  expect(out).toMatchObject({ status: 410, body: { error: "wheel-ended" } });
});

test("spin: not signed in, bad token, unconfigured server and a failing lookup each answer distinctly", async () => {
  expect(await call(spin, { token: null })).toMatchObject({ status: 401, body: { error: "missing-token" } });
  net({ who: {} });
  expect(await call(spin, { body: { orderId: ORDER } })).toMatchObject({ status: 401, body: { error: "invalid-token" } });
  net({ orders: { [ORDER]: ORDER_OK } });
  const saved = process.env.SPIN_SECRET;
  delete process.env.SPIN_SECRET;
  expect(await call(spin, { body: { orderId: ORDER } })).toMatchObject({ status: 503, body: { error: "not-configured" } });
  process.env.SPIN_SECRET = saved;
  net({ ordersMode: "down" });
  expect(await call(spin, { body: { orderId: ORDER } })).toMatchObject({ status: 502, body: { error: "verification-unavailable" } });
});

test("spin: TEST spins are unchanged: no order, no signature, nothing to save, only for testers", async () => {
  process.env.WHEEL_TEST_EMAILS = "u1@x.com";
  net({});
  const out = await call(spin, { body: { test: true } });
  expect(out.body).toMatchObject({ ok: true, test: true, code: "TEST", signature: null, orderId: null });
  expect(out.body.sig).toBeUndefined();
  expect(out.body.persisted).toBeUndefined();
  net({ who: { tok: { localId: "u9", email: "stranger@x.com" } } });
  expect(await call(spin, { body: { test: true } })).toMatchObject({ status: 403, body: { error: "not-tester" } });
  delete process.env.WHEEL_TEST_EMAILS;
});

/* ── api/verify-prize.js ─────────────────────────────────────────────────── */

test("verify-prize: a customer checks only their own prizes, and cannot ask about an order", async () => {
  net({});
  const prize = mint("u1", "disc-5", "LD-AAAA", 1000, ORDER);
  const own = await call(verifyPrize, { body: { prizes: [prize] } });
  expect(own.body.results[0]).toMatchObject({ valid: true, redeemable: true });
  expect(await call(verifyPrize, { body: { uid: "u2", prizes: [prize] } })).toMatchObject({ status: 403 });
  expect(await call(verifyPrize, { body: { prizes: [prize], redeemOnOrderId: ORDER_B } })).toMatchObject({ status: 403 });
});

test("verify-prize: a spin record with redeemedAt makes the prize non-redeemable, whatever the client says", async () => {
  const stamped = spinRec("u1", ORDER, "disc-5", "LD-USED", { redeemedAt: Date.parse("2026-11-03T10:00:00Z") });
  net({ orders: { [ORDER]: ORDER_OK }, spins: { [ORDER]: stamped } });
  // the client posts a perfectly signed copy, and even tells the server it was never redeemed
  const lying = { ...mint("u1", "disc-5", "LD-USED", ORDER_OK.submittedAt, ORDER), redeemedAt: null };
  const out = await call(verifyPrize, { body: { prizes: [lying] } });
  expect(out.body.results).toHaveLength(1);
  expect(out.body.results[0]).toMatchObject({ code: "LD-USED", redeemable: false, reason: "already-redeemed", spinRecord: true });
});

test("verify-prize: fromSpins lists prizes the customer deleted from their own profile", async () => {
  net({
    orders: { [ORDER]: ORDER_OK, [ORDER_B]: { userId: "u1", submittedAt: ORDER_OK.submittedAt + 864e5, depositPaid: true } },
    spins: { [ORDER]: spinRec("u1", ORDER, "disc-50", "LD-CAP1"), [ORDER_B]: spinRec("u1", ORDER_B, "jackpot", "LD-CAP2") },
  });
  const out = await call(verifyPrize, { body: { prizes: [], fromSpins: true } });     // the customer's own list is EMPTY
  const by = Object.fromEntries(out.body.results.map((r) => [r.code, r]));
  expect(Object.keys(by).sort()).toEqual(["LD-CAP1", "LD-CAP2"]);
  expect(by["LD-CAP1"]).toMatchObject({ redeemable: true, issuedAt: ORDER_OK.submittedAt, validUntil: PRIZE_VALID_UNTIL, spinRecord: true });
  expect(by["LD-CAP2"]).toMatchObject({ redeemable: false, reason: "capped-limit" });   // the capped rule still holds
});

test("verify-prize: a forged spin record is never trusted", async () => {
  net({ orders: { [ORDER]: ORDER_OK }, spins: { [ORDER]: { ...spinRec("u1", ORDER, "jackpot", "LD-FAKE"), sig: "f".repeat(32) } } });
  const out = await call(verifyPrize, { body: { prizes: [], fromSpins: true } });
  expect(out.body.results[0]).toMatchObject({ code: "LD-FAKE", valid: false, redeemable: false, reason: "unverified" });
});

test("verify-prize: the admin's note on retention/{uid} still blocks a prize that has no spin record", async () => {
  net({ retention: { u1: { "LD-OLD1": { at: 1700000000000 } } } });
  const out = await call(verifyPrize, { body: { prizes: [mint("u1", "disc-5", "LD-OLD1", 1000)] } });
  expect(out.body.results[0]).toMatchObject({ redeemable: false, reason: "already-redeemed" });
});

test("verify-prize: a prize with a signed record but no spin record yet is still honoured (older prizes, rules not published)", async () => {
  net({ spins: "denied" });
  const out = await call(verifyPrize, { body: { prizes: [mint("u1", "disc-5", "LD-LEGA", 1000, ORDER)] } });
  expect(out.body.results[0]).toMatchObject({ valid: true, redeemable: true, spinRecord: false });
  expect(out.body.spinsAvailable).toBe(false);
});

test("verify-prize: the admin checks a prize against a specific order", async () => {
  const prize = mint("u1", "disc-5", "LD-AAAA", 1000, ORDER);
  const who = { adm: { localId: "adm", email: ADMIN } };
  const check = async (order) => {
    net({ who, orders: { [ORDER_B]: order, [ORDER]: { userId: "u1", submittedAt: 1000, depositPaid: false } } });
    return (await call(verifyPrize, { token: "adm", body: { uid: "u1", prizes: [prize], redeemOnOrderId: ORDER_B } })).body.results[0].redeemOnOrder;
  };
  expect(await check({ userId: "u1", depositPaid: true, submittedAt: 2000 })).toEqual({ ok: true, reason: null });
  expect(await check({ userId: "u1", depositPaid: false, submittedAt: 2000 })).toMatchObject({ ok: false, reason: "unpaid" });
  expect(await check({ userId: "u1", depositPaid: true, submittedAt: 500 })).toMatchObject({ ok: false, reason: "not-later" });
  net({ who, orders: { [ORDER]: { userId: "u1", submittedAt: 1000, depositPaid: true } } });
  const same = await call(verifyPrize, { token: "adm", body: { uid: "u1", prizes: [prize], redeemOnOrderId: ORDER } });
  expect(same.body.results[0].redeemOnOrder).toMatchObject({ ok: false, reason: "same-order" });
});
