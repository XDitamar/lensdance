// The "I have a discount code" control, as a state machine with no React and no
// network: every transition the form can make.
import { initialState, normaliseCode, prizeCodeReducer as reduce } from "./prizeCodeState";

const wheel = require("../../functions/lib/wheel.js");

const run = (actions, from = initialState) => actions.reduce((s, a) => reduce(s, a), from);
const GOOD = { ok: true, prize: { prizeId: "disc-5", label: "x", tier: "common" }, validUntil: "2027-06-30" };

/* ── typing a code: the browser and the server agree ──────────────────── */

test("normaliseCode matches the server's on a table of typed codes", () => {
  const typed = ["LD-AB23CD", "ld-ab23cd", "  LD AB23CD  ", "ab23cd", "LDAB23CD", "ld_ab23cd", "LD-AB-23CD",
    "", "   ", "LD-", "AB23C", "AB23CDE", "AB0OCD", "קוד123", "😀😀😀😀😀😀", "x".repeat(60), "LD-AB23CD; DROP", null, undefined, 123];
  for (const t of typed) expect(normaliseCode(t)).toBe(wheel.normaliseCode(t));
  expect(normaliseCode("ld ab23cd")).toBe("LD-AB23CD");
});

/* ── opening and typing ────────────────────────────────────────────────── */

test("it starts collapsed and idle; the toggle opens and closes it", () => {
  expect(initialState).toMatchObject({ open: false, phase: "idle", value: "", applied: null, error: null });
  expect(run([{ type: "toggle" }]).open).toBe(true);
  expect(run([{ type: "toggle" }, { type: "toggle" }]).open).toBe(false);
});

test("typing upper-cases as you go and clears an old message", () => {
  const s = run([{ type: "toggle" }, { type: "submit" }, { type: "type", value: "ld-ab" }]);
  expect(s.value).toBe("LD-AB");
  expect(s.error).toBe(null);
});

test("a chip fills the field (and opens the box) but does not apply anything", () => {
  const s = run([{ type: "fill", code: "LD-AB23CD" }]);
  expect(s).toMatchObject({ open: true, value: "LD-AB23CD", phase: "idle", applied: null });
});

/* ── pressing Apply (or Enter) ─────────────────────────────────────────── */

test("an empty field gives the friendly 'no code' message and asks nothing", () => {
  for (const value of ["", "   "]) {
    const s = run([{ type: "toggle" }, { type: "type", value }, { type: "submit" }]);
    expect(s).toMatchObject({ phase: "idle", error: "empty" });
  }
});

test("something that cannot be a code is answered at once, like 'not found', without a call", () => {
  const s = run([{ type: "toggle" }, { type: "type", value: "abc" }, { type: "submit" }]);
  expect(s).toMatchObject({ phase: "idle", error: "not-found" });
});

test("a code already attached to another order of this customer is refused on the form", () => {
  const s = run([{ type: "toggle" }, { type: "type", value: "ld-ab23cd" }, { type: "submit", attached: ["LD-AB23CD"] }]);
  expect(s).toMatchObject({ phase: "idle", error: "attached" });
});

test("a code that looks right goes to 'checking'", () => {
  const s = run([{ type: "toggle" }, { type: "type", value: " ld ab23cd " }, { type: "submit", attached: [] }]);
  expect(s).toMatchObject({ phase: "checking", error: null });
});

/* ── the server's answer ───────────────────────────────────────────────── */

const checking = () => run([{ type: "toggle" }, { type: "type", value: "ld-ab23cd" }, { type: "submit" }]);

test("a valid answer applies the code, normalised, with what the prize is", () => {
  const s = reduce(checking(), { type: "result", data: GOOD });
  expect(s.phase).toBe("applied");
  expect(s.applied).toEqual({ code: "LD-AB23CD", prizeId: "disc-5", label: "x", validUntil: "2027-06-30" });
  expect(s.error).toBe(null);
});

test("every refusal becomes its own message and leaves the field as typed", () => {
  const expected = { "not-found": "not-found", "bad-code": "not-found", redeemed: "redeemed", expired: "expired", "capped-limit": "capped" };
  for (const [reason, key] of Object.entries(expected)) {
    const s = reduce(checking(), { type: "result", data: { ok: false, reason } });
    expect(s).toMatchObject({ phase: "idle", error: key, applied: null, value: "LD-AB23CD" });
  }
  expect(reduce(checking(), { type: "result", data: { ok: false, reason: "something-new" } }).error).toBe("not-found");
});

test("a failed call (offline, function down) says so and can be retried", () => {
  const s = reduce(checking(), { type: "fail" });
  expect(s).toMatchObject({ phase: "idle", error: "network", value: "LD-AB23CD" });
  expect(reduce(s, { type: "submit" }).phase).toBe("checking");
});

test("an answer that arrives when nothing is being checked is ignored (a stale reply, a removed code)", () => {
  expect(reduce(initialState, { type: "result", data: GOOD })).toBe(initialState);
  expect(reduce(initialState, { type: "fail" })).toBe(initialState);
  const applied = reduce(checking(), { type: "result", data: GOOD });
  expect(reduce(applied, { type: "result", data: { ok: false, reason: "redeemed" } })).toBe(applied);
});

/* ── removing it, and not applying twice ───────────────────────────────── */

test("removing an applied code goes back to an empty, open field", () => {
  const applied = reduce(checking(), { type: "result", data: GOOD });
  expect(reduce(applied, { type: "remove" })).toMatchObject({ phase: "idle", applied: null, value: "", open: true, error: null });
});

test("while a check is running, pressing Apply again does not start another", () => {
  const s = checking();
  expect(reduce(s, { type: "submit" })).toBe(s);
});

test("while a code is applied the toggle does nothing", () => {
  const applied = reduce(checking(), { type: "result", data: GOOD });
  expect(reduce(applied, { type: "toggle" })).toBe(applied);
});
