// The three callables, with a fake Firestore (serial transactions, create-once).
// Real concurrency is checked against the emulator in the end-to-end run.
const test = require("node:test");
const assert = require("node:assert/strict");
const { HttpsError } = require("firebase-functions/v2/https");
const { makeHandlers } = require("../handlers");
const { PRIZES, PRIZE_VALID_UNTIL } = require("../prizes");

const ADMIN = "lensdance29@gmail.com";
const ORDER_A = "AAAAAAAAAAAAAAAAAAAA";
const ORDER_B = "BBBBBBBBBBBBBBBBBBBB";
const ORDER_C = "CCCCCCCCCCCCCCCCCCCC";
const T = (iso) => Date.parse(iso);
const NOW = new Date("2026-11-01T10:00:00Z");

/** A tiny in-memory Firestore: paths -> data, transactions run one at a time. */
function fakeDb(seed = {}) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, structuredClone(v)]));
  let queue = Promise.resolve();
  const snap = (path) => ({
    exists: store.has(path),
    id: path.split("/").pop(),
    data: () => (store.has(path) ? structuredClone(store.get(path)) : undefined),
  });
  const kids = (col) =>
    [...store.keys()].filter((k) => k.startsWith(`${col}/`) && !k.slice(col.length + 1).includes("/"));
  const makeCol = (path, filter, max) => ({
    path,
    kind: "col",
    where: (field, op, value) => makeCol(path, { field, op, value }, max),
    limit: (n) => makeCol(path, filter, n),
    async get() {
      let docs = kids(path).map(snap);
      if (filter) docs = docs.filter((d) => d.data()[filter.field] === filter.value);
      if (max) docs = docs.slice(0, max);
      return { docs, empty: docs.length === 0 };
    },
  });
  const db = {
    store,
    doc: (path) => ({ path, kind: "doc" }),
    // a collection, which can also be queried: where(field, "==", value).limit(n).get()
    collection: (path) => makeCol(path, null, null),
    runTransaction(fn) {
      const run = queue.then(async () => {
        const writes = [];
        const tx = {
          get: async (ref) => (ref.kind === "col" ? { docs: kids(ref.path).map(snap) } : snap(ref.path)),
          create(ref, data) {
            if (store.has(ref.path) || writes.some((w) => w.path === ref.path)) {
              throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
            }
            writes.push({ path: ref.path, data: structuredClone(data) });
          },
          update(ref, data) {
            if (!store.has(ref.path)) throw Object.assign(new Error("NOT_FOUND"), { code: 5 });
            writes.push({ path: ref.path, data: structuredClone(data), merge: true });
          },
        };
        const out = await fn(tx);
        for (const w of writes) store.set(w.path, w.merge ? { ...store.get(w.path), ...w.data } : w.data);
        return out;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
  return db;
}

const make = (seed, over = {}) => {
  const db = fakeDb(seed);
  return {
    db,
    h: makeHandlers({
      db,
      HttpsError,
      now: () => NOW,
      serverTimestamp: () => "SERVER_TIME",
      testEmails: () => "",
      ...over,
    }),
  };
};
const asUser = (uid, email, data) => ({ auth: { uid, token: { email } }, data });
const code = async (p) => {
  try { await p; } catch (e) { return e.details; }
  return "NO ERROR";
};

const order = (userId, iso = "2026-10-20T10:00:00Z", depositPaid = false) => ({ userId, submittedAt: T(iso), depositPaid });

/* ── spin: real ────────────────────────────────────────────────────────── */

test("spin: a customer's order gets a prize, saved once under their own data", async () => {
  const { db, h } = make({ [`registrations/${ORDER_A}`]: order("u1") });
  const out = await h.spin(asUser("u1", "u1@x.com", { orderId: ORDER_A }));
  assert.match(out.code, /^LD-[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(out.orderId, ORDER_A);
  assert.equal(out.validUntil, PRIZE_VALID_UNTIL);
  assert.equal(PRIZES[out.index].id, out.prize.id);
  const saved = db.store.get(`users/u1/prizes/${ORDER_A}`);
  assert.deepEqual(Object.keys(saved).sort(), ["code", "createdAt", "extra", "issuedAt", "label", "orderId", "prizeId", "redeemed", "tier", "validUntil"]);
  assert.equal(saved.prizeId, out.prize.id);
  assert.equal(saved.issuedAt, T("2026-10-20T10:00:00Z"));   // the ORDER's time
  assert.equal(saved.createdAt, "SERVER_TIME");
  assert.equal(saved.redeemed, null);
  assert.equal(saved.extra, null);
});

test("spin: asking again returns the stored prize unchanged (no reroll)", async () => {
  const { db, h } = make({ [`registrations/${ORDER_A}`]: order("u1") });
  const first = await h.spin(asUser("u1", "u1@x.com", { orderId: ORDER_A }));
  for (let i = 0; i < 20; i += 1) {
    assert.deepEqual(await h.spin(asUser("u1", "u1@x.com", { orderId: ORDER_A })), first);
  }
  assert.equal([...db.store.keys()].filter((k) => k.startsWith("users/u1/prizes/")).length, 1);
});

test("spin: two spins at the same moment on one order create ONE prize document", async () => {
  const { db, h } = make({ [`registrations/${ORDER_A}`]: order("u1") });
  const results = await Promise.all(Array.from({ length: 8 }, () => h.spin(asUser("u1", "u1@x.com", { orderId: ORDER_A }))));
  assert.equal(new Set(results.map((r) => r.code)).size, 1);
  assert.equal([...db.store.keys()].filter((k) => k.startsWith("users/u1/prizes/")).length, 1);
});

test("spin: refused for not signed in, a bad id, someone else's order, a missing order, a late order and after the end", async () => {
  const seed = {
    [`registrations/${ORDER_A}`]: order("u2"),
    [`registrations/${ORDER_B}`]: order("u1", "2027-01-02T10:00:00Z"),
    [`registrations/${ORDER_C}`]: order(null),
  };
  const { db, h } = make(seed);
  assert.equal(await code(h.spin({ auth: null, data: { orderId: ORDER_A } })), "not-signed-in");
  assert.equal(await code(h.spin(asUser("u1", "u1@x.com", { orderId: "../users/u2" }))), "bad-order");
  assert.equal(await code(h.spin(asUser("u1", "u1@x.com", {}))), "bad-order");
  assert.equal(await code(h.spin(asUser("u1", "u1@x.com", { orderId: ORDER_A }))), "order-not-yours");
  assert.equal(await code(h.spin(asUser("u1", "u1@x.com", { orderId: ORDER_C }))), "order-not-yours");
  assert.equal(await code(h.spin(asUser("u1", "u1@x.com", { orderId: "ZZZZZZZZZZZZZZZZZZZZ" }))), "order-not-found");
  assert.equal(await code(h.spin(asUser("u1", "u1@x.com", { orderId: ORDER_B }))), "order-too-late");
  const late = make(seed, { now: () => new Date("2027-01-02T10:00:00Z") });
  assert.equal(await code(late.h.spin(asUser("u1", "u1@x.com", { orderId: ORDER_A }))), "wheel-ended");
  assert.equal([...db.store.keys()].filter((k) => k.startsWith("users/")).length, 0); // nothing was written
});

test("spin: the error carries the machine code in details and a sensible HttpsError code", async () => {
  const { h } = make({});
  await assert.rejects(h.spin({ auth: null, data: {} }), (e) => e instanceof HttpsError && e.code === "unauthenticated" && e.details === "not-signed-in");
  await assert.rejects(h.spin(asUser("u1", "u1@x.com", { orderId: "ZZZZZZZZZZZZZZZZZZZZ" })), (e) => e.code === "not-found");
});

/* ── spin: test mode ───────────────────────────────────────────────────── */

test("spin TEST: admin and listed emails only, random prize, code TEST, writes nothing", async () => {
  const { db, h } = make({}, { testEmails: () => "Tester@X.com, other@x.com" });
  const out = await h.spin(asUser("a", ADMIN, { test: true }));
  assert.equal(out.test, true);
  assert.equal(out.code, "TEST");
  assert.equal(out.orderId, null);
  assert.equal(out.validUntil, null);
  assert.equal(PRIZES[out.index].id, out.prize.id);
  await h.spin(asUser("t", "tester@x.com", { test: true }));
  assert.equal(await code(h.spin(asUser("s", "stranger@x.com", { test: true }))), "not-tester");
  assert.equal(db.store.size, 0);
});

test("spin TEST: ignores the end date, needs no order, and only the exact value true counts", async () => {
  const { h } = make({}, { now: () => new Date("2027-05-05T10:00:00Z") });
  assert.equal((await h.spin(asUser("a", ADMIN, { test: true }))).test, true);
  // a click event, a truthy string or 1 is never a test spin: it is a real spin and fails as one
  for (const bad of ["true", 1, {}, [1]]) {
    assert.equal(await code(h.spin(asUser("a", ADMIN, { test: bad }))), "bad-order");
  }
});

test("spin TEST: with no WHEEL_TEST_EMAILS only the admin may test", async () => {
  const { h } = make({}, { testEmails: () => "" });
  assert.equal(await code(h.spin(asUser("u1", "u1@x.com", { test: true }))), "not-tester");
  assert.equal(await code(h.spin(asUser("u1", "", { test: true }))), "not-tester");
});

/* ── redeemPrize ───────────────────────────────────────────────────────── */

const prizeDoc = (over = {}) => ({
  prizeId: "disc-5", label: "x", tier: "common", code: "LD-AAAAAA", orderId: ORDER_A,
  issuedAt: T("2026-10-20T10:00:00Z"), createdAt: 1, validUntil: "2027-06-30", redeemed: null, extra: null, ...over,
});
const redeemSeed = (over = {}) => ({
  [`registrations/${ORDER_A}`]: order("u1", "2026-10-20T10:00:00Z", false),
  [`registrations/${ORDER_B}`]: order("u1", "2026-10-25T10:00:00Z", true),
  [`users/u1/prizes/${ORDER_A}`]: prizeDoc(),
  ...over,
});
const redeem = (h, data, email = ADMIN) => h.redeemPrize(asUser("adm", email, { uid: "u1", orderId: ORDER_A, onOrderId: ORDER_B, ...data }));

test("redeemPrize: the admin redeems against a later paid order and it is recorded", async () => {
  const { db, h } = make(redeemSeed());
  await redeem(h, {});
  const saved = db.store.get(`users/u1/prizes/${ORDER_A}`);
  assert.deepEqual(saved.redeemed, { at: "SERVER_TIME", orderId: ORDER_B, by: ADMIN });
});

test("redeemPrize: not signed in and not the admin are refused, and nothing changes", async () => {
  const { db, h } = make(redeemSeed());
  assert.equal(await code(h.redeemPrize({ auth: null, data: {} })), "not-signed-in");
  assert.equal(await code(redeem(h, {}, "u1@x.com")), "not-admin");
  assert.equal(db.store.get(`users/u1/prizes/${ORDER_A}`).redeemed, null);
});

test("redeemPrize: refuses the same order, an unpaid order, an earlier order, someone else's order, twice, and an expired prize", async () => {
  const seed = redeemSeed({
    [`registrations/${ORDER_C}`]: order("u1", "2026-10-26T10:00:00Z", false),
    "registrations/DDDDDDDDDDDDDDDDDDDD": order("u1", "2026-10-10T10:00:00Z", true),
    "registrations/EEEEEEEEEEEEEEEEEEEE": order("u2", "2026-10-26T10:00:00Z", true),
  });
  const { h } = make(seed);
  assert.equal(await code(redeem(h, { onOrderId: ORDER_A })), "same-order");
  assert.equal(await code(redeem(h, { onOrderId: ORDER_C })), "unpaid");
  assert.equal(await code(redeem(h, { onOrderId: "DDDDDDDDDDDDDDDDDDDD" })), "not-later");
  assert.equal(await code(redeem(h, { onOrderId: "EEEEEEEEEEEEEEEEEEEE" })), "wrong-owner");
  assert.equal(await code(redeem(h, { onOrderId: "ZZZZZZZZZZZZZZZZZZZZ" })), "wrong-owner");
  await redeem(h, {});
  assert.equal(await code(redeem(h, {})), "already-redeemed");
  const expired = make(redeemSeed({ [`users/u1/prizes/${ORDER_A}`]: prizeDoc({ validUntil: "2026-10-01" }) }));
  assert.equal(await code(redeem(expired.h, {})), "expired");
  assert.equal(await code(redeem(h, { orderId: "ZZZZZZZZZZZZZZZZZZZZ" })), "prize-not-found");
});

test("redeemPrize: a customer's second capped prize is refused, even after the first was redeemed", async () => {
  const first = prizeDoc({ prizeId: "disc-50", orderId: ORDER_A, issuedAt: T("2026-10-20T10:00:00Z"), code: "LD-CAPONE" });
  const second = prizeDoc({ prizeId: "jackpot", orderId: ORDER_C, issuedAt: T("2026-10-22T10:00:00Z"), code: "LD-CAPTWO" });
  const { db, h } = make(redeemSeed({
    [`users/u1/prizes/${ORDER_A}`]: first,
    [`users/u1/prizes/${ORDER_C}`]: second,
    [`registrations/${ORDER_C}`]: order("u1", "2026-10-22T10:00:00Z", false),
  }));
  assert.equal(await code(redeem(h, { orderId: ORDER_C })), "capped-limit");
  await redeem(h, {});                                               // the earliest capped one goes through
  assert.equal(await code(redeem(h, { orderId: ORDER_C })), "capped-limit"); // they already had their one
  assert.ok(db.store.get(`users/u1/prizes/${ORDER_A}`).redeemed);
  assert.equal(db.store.get(`users/u1/prizes/${ORDER_C}`).redeemed, null);
});

test("redeemPrize: the admin can undo a mistaken redemption", async () => {
  const { db, h } = make(redeemSeed());
  await redeem(h, {});
  await h.redeemPrize(asUser("adm", ADMIN, { uid: "u1", orderId: ORDER_A, undo: true }));
  assert.equal(db.store.get(`users/u1/prizes/${ORDER_A}`).redeemed, null);
  assert.equal(await code(h.redeemPrize(asUser("adm", "u1@x.com", { uid: "u1", orderId: ORDER_A, undo: true }))), "not-admin");
});

/* ── savePrizeExtra ────────────────────────────────────────────────────── */

const friends = Array.from({ length: 5 }, (_, i) => ({ name: `Friend ${i}`, contact: `f${i}@x.com` }));
const teamExtra = { type: "team", friends, consent: true };
const extraSeed = (prizeId) => ({ [`users/u1/prizes/${ORDER_A}`]: prizeDoc({ prizeId }) });

test("savePrizeExtra: the winner saves the team's details once, cleaned", async () => {
  const { db, h } = make(extraSeed("team"));
  const dirty = { ...teamExtra, evil: "x", friends: friends.map((f) => ({ ...f, admin: true })) };
  await h.savePrizeExtra(asUser("u1", "u1@x.com", { orderId: ORDER_A, extra: dirty }));
  const saved = db.store.get(`users/u1/prizes/${ORDER_A}`).extra;
  assert.deepEqual(Object.keys(saved).sort(), ["consent", "friends", "submittedAt", "type"]);
  assert.equal(saved.friends.length, 5);
  assert.equal(saved.submittedAt, "SERVER_TIME");
  assert.equal(await code(h.savePrizeExtra(asUser("u1", "u1@x.com", { orderId: ORDER_A, extra: teamExtra }))), "already-submitted");
});

test("savePrizeExtra: the jackpot needs two different competitions", async () => {
  const { h } = make(extraSeed("jackpot"));
  const same = { type: "jackpot", video: { id: "c1", label: "One" }, pack: { id: "c1", label: "One" } };
  assert.equal(await code(h.savePrizeExtra(asUser("u1", "u1@x.com", { orderId: ORDER_A, extra: same }))), "same");
  const ok = { type: "jackpot", video: { id: "c1", label: "One" }, pack: { id: "c2", label: "Two" } };
  await h.savePrizeExtra(asUser("u1", "u1@x.com", { orderId: ORDER_A, extra: ok }));
});

test("savePrizeExtra: refused for a prize that takes no details, someone else's prize, a missing prize and bad details", async () => {
  const plain = make(extraSeed("disc-5"));
  assert.equal(await code(plain.h.savePrizeExtra(asUser("u1", "u1@x.com", { orderId: ORDER_A, extra: teamExtra }))), "wrong-type");
  const { h } = make(extraSeed("team"));
  assert.equal(await code(h.savePrizeExtra(asUser("u2", "u2@x.com", { orderId: ORDER_A, extra: teamExtra }))), "prize-not-found");
  assert.equal(await code(h.savePrizeExtra({ auth: null, data: {} })), "not-signed-in");
  assert.equal(await code(h.savePrizeExtra(asUser("u1", "u1@x.com", { orderId: ORDER_A, extra: { ...teamExtra, consent: false } }))), "consent");
  assert.equal(await code(h.savePrizeExtra(asUser("u1", "u1@x.com", { orderId: ORDER_A, extra: { ...teamExtra, friends: friends.slice(0, 4) } }))), "count");
});

test("savePrizeExtra: two saves at the same moment store ONE", async () => {
  const { db, h } = make(extraSeed("team"));
  const results = await Promise.allSettled([1, 2, 3].map(() => h.savePrizeExtra(asUser("u1", "u1@x.com", { orderId: ORDER_A, extra: teamExtra }))));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(db.store.get(`users/u1/prizes/${ORDER_A}`).extra);
});

/* ── checkPrizeCode ────────────────────────────────────────────────────── */

const codeSeed = () => ({
  [`users/u1/prizes/${ORDER_A}`]: prizeDoc({ code: "LD-AB23CD" }),
  [`users/u2/prizes/${ORDER_B}`]: prizeDoc({ code: "LD-ZZ99ZZ", orderId: ORDER_B }),
});
const check = (h, code, uid = "u1") => h.checkPrizeCode(asUser(uid, `${uid}@x.com`, { code }));

test("checkPrizeCode: a customer's own valid code says what it gives", async () => {
  const { h } = make(codeSeed());
  const out = await check(h, "LD-AB23CD");
  assert.deepEqual(out, { ok: true, prize: { prizeId: "disc-5", label: "x", tier: "common" }, validUntil: "2027-06-30" });
});

test("checkPrizeCode: typing it differently finds the same prize", async () => {
  const { h } = make(codeSeed());
  for (const typed of ["ld-ab23cd", "  ab23cd ", "LD AB23CD", "ldab23cd"]) assert.equal((await check(h, typed)).ok, true, typed);
});

test("checkPrizeCode: not found, someone else's code and the test code all give the same answer", async () => {
  const { h } = make(codeSeed());
  const none = await check(h, "LD-QQ22QQ");
  assert.deepEqual(none, { ok: false, reason: "not-found" });
  assert.deepEqual(await check(h, "LD-ZZ99ZZ"), none);        // u2's real code, asked by u1
  assert.deepEqual(await check(h, "TEST"), none);
  assert.deepEqual(await check(h, "LD-TEST"), none);
});

test("checkPrizeCode: a code that cannot be one is bad-code, never a lookup", async () => {
  const { h } = make(codeSeed());
  for (const typed of ["", "   ", "abc", "LD-AB23CDE", "קוד", undefined]) assert.deepEqual(await check(h, typed), { ok: false, reason: "bad-code" }, String(typed));
  assert.deepEqual(await h.checkPrizeCode(asUser("u1", "u1@x.com", {})), { ok: false, reason: "bad-code" });
});

test("checkPrizeCode: redeemed and expired say so", async () => {
  const { h } = make({
    [`users/u1/prizes/${ORDER_A}`]: prizeDoc({ code: "LD-AB23CD", redeemed: { at: 1, orderId: ORDER_B, by: ADMIN } }),
    [`users/u1/prizes/${ORDER_B}`]: prizeDoc({ code: "LD-EXPRD2", orderId: ORDER_B, validUntil: "2026-10-01" }),
  });
  assert.deepEqual(await check(h, "LD-AB23CD"), { ok: false, reason: "redeemed" });
  assert.deepEqual(await check(h, "LD-EXPRD2"), { ok: false, reason: "expired" });
});

test("checkPrizeCode: only the customer's EARLIEST capped prize is usable (the rule is the same one redemption uses)", async () => {
  const { h } = make({
    [`users/u1/prizes/${ORDER_A}`]: prizeDoc({ prizeId: "disc-50", code: "LD-CAPAB2", issuedAt: T("2026-10-20T10:00:00Z") }),
    [`users/u1/prizes/${ORDER_C}`]: prizeDoc({ prizeId: "jackpot", code: "LD-CAPCD3", orderId: ORDER_C, issuedAt: T("2026-10-22T10:00:00Z") }),
  });
  assert.equal((await check(h, "LD-CAPAB2")).ok, true);
  assert.deepEqual(await check(h, "LD-CAPCD3"), { ok: false, reason: "capped-limit" });
});

test("checkPrizeCode: not signed in is an error, and nothing is written", async () => {
  const { db, h } = make(codeSeed());
  const before = JSON.stringify([...db.store.entries()]);
  assert.equal(await code(h.checkPrizeCode({ auth: null, data: { code: "LD-AB23CD" } })), "not-signed-in");
  assert.equal(JSON.stringify([...db.store.entries()]), before);
});
