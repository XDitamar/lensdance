// The browser side of the wheel: how it calls the Cloud Functions and how it
// turns their errors into messages. Firebase itself is mocked.
jest.mock("../firebase", () => ({ db: {}, auth: { currentUser: { uid: "u1" } }, app: {}, USE_EMULATORS: false }));
jest.mock("firebase/firestore", () => ({ collection: jest.fn(), doc: jest.fn(), getDocs: jest.fn(), getDoc: jest.fn(), query: jest.fn(), where: jest.fn() }));
jest.mock("./competitions", () => ({ fetchMyRegistrations: jest.fn() }));
jest.mock("./functions", () => ({ callSpin: jest.fn(), callRedeemPrize: jest.fn(), callSavePrizeExtra: jest.fn() }));

const { callSpin, callRedeemPrize, callSavePrizeExtra } = require("./functions");
const R = require("./rewards");
const { checkPrize, checkTarget } = require("./prizeRules");
const wheel = require("../../functions/lib/wheel.js");

const fnError = (code, details) => Object.assign(new Error(code), { code: `functions/${code}`, details });

beforeEach(() => { jest.clearAllMocks(); });

/* ── spinning ──────────────────────────────────────────────────────────── */

test("requestSpin sends the order, and returns what the function answers", async () => {
  callSpin.mockResolvedValue({ data: { prize: { id: "disc-5" }, code: "LD-AAAAAA", orderId: "O1", index: 0 } });
  const out = await R.requestSpin("O1");
  expect(callSpin).toHaveBeenCalledWith({ orderId: "O1" });
  expect(out).toMatchObject({ code: "LD-AAAAAA", orderId: "O1" });
});

test("requestSpin only sends test:true for the exact value true, never for a click event", async () => {
  callSpin.mockResolvedValue({ data: { prize: { id: "disc-5" }, code: "TEST", test: true } });
  await R.requestSpin(undefined, { test: true });
  expect(callSpin).toHaveBeenLastCalledWith({ test: true });
  for (const notTrue of [{ type: "click", target: {} }, "true", 1, {}, undefined]) {
    await R.requestSpin("O1", { test: notTrue });
    expect(callSpin).toHaveBeenLastCalledWith({ orderId: "O1" });
  }
});

test("every machine code from the functions maps to its own friendly message key", () => {
  const key = (details) => R.spinErrorKey(new Error(details), details);
  const err = (code) => Object.assign(new Error(code), { code });
  expect(R.spinErrorKey(err("not-signed-in"))).toBe("errorSignedOut");
  expect(R.spinErrorKey(err("wheel-ended"))).toBe("errorEnded");
  expect(R.spinErrorKey(err("order-too-late"))).toBe("errorOrderLate");
  expect(R.spinErrorKey(err("order-not-found"))).toBe("errorOrderNotFound");
  expect(R.spinErrorKey(err("bad-order"))).toBe("errorOrderNotFound");
  expect(R.spinErrorKey(err("order-not-yours"))).toBe("errorOrderNotYours");
  expect(R.spinErrorKey(err("not-tester"))).toBe("errorNotTester");
  expect(R.spinErrorKey(err("network"))).toBe("errorNetwork");
  expect(R.spinErrorKey(err("unavailable"))).toBe("errorUnavailable");
  expect(R.spinErrorKey(err("something-new"))).toBe("errorGeneric");
  expect(key).toBeDefined();
});

test("requestSpin turns HttpsError details into err.code, and unknown failures into 'unavailable' or 'network'", async () => {
  for (const machine of ["wheel-ended", "order-not-found", "order-not-yours", "order-too-late", "not-tester", "not-signed-in", "bad-order"]) {
    callSpin.mockRejectedValueOnce(fnError("failed-precondition", machine));
    await expect(R.requestSpin("O1")).rejects.toMatchObject({ code: machine });
  }
  // no details: the function crashed, is not deployed, or the request never arrived
  callSpin.mockRejectedValueOnce(fnError("internal", undefined));
  await expect(R.requestSpin("O1")).rejects.toMatchObject({ code: "unavailable" });
  callSpin.mockRejectedValueOnce(fnError("not-found", undefined));
  await expect(R.requestSpin("O1")).rejects.toMatchObject({ code: "unavailable" });
  const online = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  callSpin.mockRejectedValueOnce(fnError("internal", undefined));
  await expect(R.requestSpin("O1")).rejects.toMatchObject({ code: "network" });
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  if (online) Object.defineProperty(Navigator.prototype, "onLine", online);
});

test("an error we do not recognise keeps its technical code for the generic banner", async () => {
  callSpin.mockRejectedValueOnce(fnError("data-loss", undefined));
  await expect(R.requestSpin("O1")).rejects.toMatchObject({ code: "functions/data-loss" });
});

/* ── redeeming and saving details ──────────────────────────────────────── */

test("redeem, undo and saveExtra call the right function with the right data", async () => {
  callRedeemPrize.mockResolvedValue({ data: { ok: true } });
  callSavePrizeExtra.mockResolvedValue({ data: { ok: true } });
  await R.redeemPrize("u1", "A", "B");
  expect(callRedeemPrize).toHaveBeenLastCalledWith({ uid: "u1", orderId: "A", onOrderId: "B" });
  await R.undoRedeem("u1", "A");
  expect(callRedeemPrize).toHaveBeenLastCalledWith({ uid: "u1", orderId: "A", undo: true });
  await R.saveExtra("A", { type: "team" });
  expect(callSavePrizeExtra).toHaveBeenLastCalledWith({ orderId: "A", extra: { type: "team" } });
  callRedeemPrize.mockRejectedValueOnce(fnError("failed-precondition", "same-order"));
  await expect(R.redeemPrize("u1", "A", "A")).rejects.toMatchObject({ code: "same-order" });
});

/* ── the reasons the admin screen shows are the server's rules ────────── */

test("prizeRules (screen) agrees with functions/lib/wheel.js (server) on a table of cases", () => {
  const NOW = new Date("2026-11-01T10:00:00Z");
  const p = (over = {}) => ({ prizeId: "disc-5", orderId: "A", issuedAt: 1000, validUntil: "2027-06-30", redeemed: null, ...over });
  const t = (over = {}) => ({ id: "B", userId: "u1", depositPaid: true, submittedAtMs: 2000, ...over });
  const capped1 = p({ prizeId: "disc-50", orderId: "A", issuedAt: 1000 });
  const capped2 = p({ prizeId: "jackpot", orderId: "C", issuedAt: 1500 });
  const cases = [
    [p(), [p()], t()],
    [p({ redeemed: { at: 1 } }), [p()], t()],
    [p({ validUntil: "2026-10-01" }), [p()], t()],
    [p({ validUntil: null }), [p()], t()],
    [p(), [p()], t({ userId: "u2" })],
    [p(), [p()], null],
    [p(), [p()], t({ id: "A" })],
    [p(), [p()], t({ depositPaid: false })],
    [p(), [p()], t({ submittedAtMs: 1000 })],
    [p(), [p()], t({ submittedAtMs: 999 })],
    [capped1, [capped1, capped2], t()],
    [capped2, [capped1, capped2], t()],
    [{ ...capped1, redeemed: { at: 1 } }, [{ ...capped1, redeemed: { at: 1 } }, capped2], t()],
    [capped2, [{ ...capped1, redeemed: { at: 1 } }, capped2], t()],
  ];
  for (const [prize, allPrizes, target] of cases) {
    expect(checkPrize({ prize, allPrizes, now: NOW })).toBe(wheel.checkPrize({ prize, allPrizes, now: NOW }));
    expect(checkTarget({ uid: "u1", prize, target })).toBe(wheel.checkTarget({ uid: "u1", prize, target }));
  }
});

test("the customer-side checks of the two forms mirror the server's validateExtra", () => {
  const friends = (n) => Array.from({ length: n }, (_, i) => ({ name: `F${i}`, contact: `f${i}@x.com` }));
  expect(R.validateTeam(friends(5), true)).toBe(wheel.validateExtra("team", { type: "team", friends: friends(5), consent: true }));
  expect(R.validateTeam(friends(4), true)).toBe("count");
  expect(R.validateTeam(friends(5), false)).toBe("consent");
  expect(R.validateJackpot("c1", "c1")).toBe("same");
  expect(R.validateJackpot("c1", "c2")).toBe(null);
});
