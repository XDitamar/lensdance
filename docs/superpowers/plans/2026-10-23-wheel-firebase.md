# Prize wheel on Firebase (Cloud Functions + per-customer prize documents) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this session, inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Move the wheel's server side off Vercel: Cloud Functions (2nd gen, callable) are the only writers of `users/{uid}/prizes/{orderId}`; clients can only read it; no HMAC, no `SPIN_SECRET`.

**Architecture:** Pure rules module (`functions/lib/wheel.js`: draw, code, spin eligibility, redemption eligibility, extra validation) wrapped by three callables in `functions/index.js` that use the Admin SDK inside Firestore transactions. The browser calls them with `httpsCallable`; Firestore rules deny every client write under `users/{uid}/prizes`. The prizes table has ONE source (`api/_prizes.js`), copied by `scripts/sync-prizes.js` into `functions/prizes.js` and `src/config/prizes.js`, and a test fails on any drift.

**Tech Stack:** firebase-functions 6.6 (v2), firebase-admin 13, Node 22 (`engines`), `node:test` for function tests, Jest (CRA) for the client, Firebase emulators (Firestore, Auth, Functions; Java 17 present) with Playwright.

**Spec:** `WHEEL-FIREBASE.md` (overrides the signing / SPIN_SECRET / api/spin / api/verify-prize parts of the earlier briefs).

## Global Constraints

- Do NOT push; do NOT create worktrees or branches (work on the current branch); do not touch `.env`; never print secrets; never create registrations in the real Firestore.
- `CI=true npm run build` before every commit; locale parity (`node scripts/check-locales.js`) stays OK.
- Every function: `maxInstances` 5, `timeoutSeconds` 30, `memory` 256MiB, `minInstances` 0. No scheduled functions.
- Region: ONE constant. `me-west1` is not in firebase-functions 6.6's supported list and availability cannot be confirmed without a login, so `europe-west1`.
- Code format: `"LD-"` + 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, drawn with `crypto.randomInt`. Draw: `crypto.randomInt(1000)` over the table weights.
- Wheel ends 31.12.2026 Asia/Jerusalem (server clock). Prize validity `PRIZE_VALID_UNTIL` (placeholder `2027-06-30`).
- Errors are `HttpsError` with a machine code in `details`: `not-signed-in`, `wheel-ended`, `bad-order`, `order-not-found`, `order-not-yours`, `order-too-late`, `not-tester`.
- Keep `verifyCaller` and `isAdminEmail` in `api/_verify.js` (`api/_lib/rosterData.js` and `send-roster` use them). Do not remove other `api/` functions.
- TEST spins (`/prize?test=1`): admin + `WHEEL_TEST_EMAILS` param only, write nothing, never read a click event as `test`.
- Design, copy, accessibility unchanged.

## Review Focus

- Double click / two tabs on one order: exactly ONE prize document, the second call returns it unchanged (transaction test).
- A registration with `userId: null` (anonymous) or someone else's order: refused, never a prize.
- Redeeming the customer's second capped prize, or the first one twice: refused (`capped-limit` / `already-redeemed`).
- Clock edges: 23:30 Israel on 31.12.2026 is open, 00:30 on 1.1.2027 is closed (UTC vs Israel date).
- `savePrizeExtra` twice, or for a prize that needs none: second write refused, wrong type refused.
- A customer's client write to `users/{uid}/prizes/*` (create, update, delete) is denied; another customer cannot read it.
- The emulator wiring cannot activate in a production build.

---

### Task 1: One prizes table, three copies, one drift test

**Files:** Modify `api/_prizes.js` (add `FUNCTIONS_REGION = "europe-west1"`), `scripts/sync-prizes.js`; Generate `functions/prizes.js`, `src/config/prizes.js`; Test `src/config/prizes.test.js`.
**Produces:** `functions/prizes.js` exporting `{ PRIZES, TOTAL_WEIGHT, PRIZE_WHEEL_UNTIL, PRIZE_VALID_UNTIL, FUNCTIONS_REGION }`; `src/config/prizes.js` also exports `FUNCTIONS_REGION`.

- [ ] Add the drift assertions first (`functions/prizes.js` equals `api/_prizes.js` on all five exports; `src/config/prizes.js` `FUNCTIONS_REGION` equal). Run: FAIL (file missing).
- [ ] Extend the generator to write both files; run `node scripts/sync-prizes.js`; run the test: PASS.

### Task 2: Pure wheel rules (`functions/lib/wheel.js`) with tests

**Files:** Create `functions/lib/wheel.js`, `functions/test/wheel.test.js`.
**Produces (all pure, no Firestore):**
- `israelDay(now: Date): string`, `wheelOpen(now): boolean`, `isExpired(validUntil: string, now): boolean`
- `drawPrize(randomInt = crypto.randomInt): Prize`, `makeCode(randomInt = crypto.randomInt): string`
- `checkSpinOrder({ uid, order, now }): null | code` where `order = { userId, submittedAtMs }`, returns `"order-not-found" | "order-not-yours" | "order-too-late" | null`
- `checkRedeem({ prize, allPrizes, target, now }): null | reason` where `prize = { prizeId, orderId, issuedAt, validUntil, redeemed }`, `target = { userId, depositPaid, submittedAtMs, id }`; reasons `already-redeemed | expired | wrong-owner | same-order | unpaid | not-later | capped-limit`
- `validateExtra(prizeId, extra): null | "wrong-type" | "consent" | "count" | "incomplete" | "contact" | "duplicate" | "same"`

- [ ] Tests (names and assertions): distribution over 100,000 draws within chi-square 29.6 (10 d.f.) and each weight within 4 sigma; `makeCode` always matches `/^LD-[A-HJ-NP-Z2-9]{6}$/`; `wheelOpen` true at `2026-12-31T21:30Z`, false at `2026-12-31T22:30Z`; `checkSpinOrder` refuses null owner / other owner / after-end order / missing order; `checkRedeem` table covering every reason plus "first capped prize that is the earliest passes" and "earliest capped already redeemed -> a later capped is still `capped-limit`"; `validateExtra` mirrors `validateTeam`/`validateJackpot` in `src/lib/rewards.js` (five distinct friends + consent; two different competitions; only for `team`/`jackpot`).
- [ ] Run `cd functions && npm test`: FAIL. Implement the module; run: PASS. Commit.

### Task 3: The three callables (`functions/index.js`, `functions/config.js`)

**Files:** Create `functions/index.js`, `functions/config.js`, `functions/.env.example`, `functions/test/index.test.js`; Modify `firebase.json` (add `functions`), create `.firebaserc` (project `lensdance-8d29c`).
**Interfaces:** Consumes Task 2. Produces callables `spin({orderId}|{test:true})`, `redeemPrize({uid, orderId, onOrderId})`, `savePrizeExtra({orderId, extra})`; spin returns `{ prize:{id,label,tier}, code, validUntil, orderId, index, test? }`.

- [ ] Tests with an injected fake Admin SDK (`makeHandlers(deps)` returned by a factory so the handlers are testable without the SDK): same order twice returns the stored document; two concurrent spins create ONE document (fake transaction with a lock); someone else's / missing / too-late order and spin after the end refused with the right `details`; TEST writes nothing, allowed for admin and `WHEEL_TEST_EMAILS`, `not-tester` otherwise; `redeemPrize` admin-only, runs `checkRedeem` against all prizes inside a transaction, writes `redeemed: { at, orderId: onOrderId, by }`; `savePrizeExtra` winner-only, once-only, validated.
- [ ] Implement; `WHEEL_TEST_EMAILS` via `defineString`; region from `functions/prizes.js`; options per Global Constraints. Run: PASS. Commit.

### Task 4: Rules and the rules test

**Files:** Modify `firestore.rules` (add `users/{userId}/prizes/{prizeId}` read owner/admin, write false; REMOVE the `spins` block), rewrite `scripts/firestore-rules.test.js`.

- [ ] Rewrite the emulator test first: owner reads own prize; other customer cannot; admin can; owner create/update/delete denied; admin create/update/delete denied; the parent `users/{uid}` owner write still works but cannot create a prize via a nested field trick that matters (the page no longer reads it); `spins/*` now falls to default deny. Run against the emulator: FAIL on the old rules.
- [ ] Edit the rules; rerun: PASS. Commit.

### Task 5: Client

**Files:** Create `src/lib/functions.js` (`getFunctions(app, FUNCTIONS_REGION)`, `callSpin`, `callRedeemPrize`, `callSavePrizeExtra`; emulator wiring only when `process.env.NODE_ENV !== "production" && process.env.REACT_APP_USE_EMULATORS === "1"` for auth, firestore and functions), `src/lib/prizeRules.js` (display copy of the redemption reasons); Modify `src/lib/rewards.js`, `src/pages/PrizePage.jsx`, `src/components/PrizeAdminPanel.jsx`, `src/pages/AdminRegistrationsPage.jsx`, `src/components/Header.jsx` (if it reads prizes), locale files only if a message key is missing.
**Produces in `rewards.js`:** `requestSpin(orderId, {test})` (maps `HttpsError.details` and `functions/*` codes to the existing `spinErrorKey` keys, unknown code stays visible in the generic banner), `fetchRewards(uid)` reading `users/{uid}/prizes` into `{ prizes, byOrder }`, `redeem(uid, prize, onOrderId)`, `saveExtra(orderId, extra)`; REMOVED: `recordPrize`, `persistSpin`, `submitPrizeExtra`, `verifyPrizes`, `setRedeemed`, `signedFields`, all signature handling.

- [ ] Jest: `prizeRules` agrees with `functions/lib/wheel.js` `checkRedeem` over the same case table (drift test); `spinErrorKey` maps each machine code; a click event passed as `test` is never read as `test:true`.
- [ ] Implement the client; admin panel lists `users/{uid}/prizes`, no "verified" text, redeemable yes/no with reason, redeem button calls `redeemPrize`. `CI=true npm run build` + parity. Commit.

### Task 6: Remove the Vercel wheel path

**Files:** Delete `api/spin.js`, `api/verify-prize.js`; Modify `api/_verify.js` (keep `verifyCaller`, `isAdminEmail`, `isOrderId`, `fetchOrder` only if still imported, delete the HMAC / draw / evaluate code), `scripts/dev-api.js` (drop the two handlers), `scripts/simulate-wheel.js` (use `functions/lib/wheel.js`), `src/config/prizes.test.js` (drop signing tests), comments and `CLAUDE.md` mentions of `SPIN_SECRET`.

- [ ] Grep for `SPIN_SECRET`, `api/spin`, `verify-prize`, `signSpin`, `drawForOrder` across the repo (excluding the user's own `WHEEL-*.md` briefs): zero hits outside history. Roster tests (`api/_lib`) still load. Commit.

### Task 7: End-to-end on the emulators and the final check

- [ ] Look (read-only, never delete) at the REAL Firestore for old wheel data: as the test account via REST (its own `users/{uid}` prizes/prizeExtras, `spins`). Other customers' data cannot be seen without admin credentials: say so.
- [ ] Seed the Auth + Firestore emulators (a customer `test@gmail.com`, two registrations, one with deposit paid, an admin); start Functions + Firestore + Auth emulators; run CRA with `REACT_APP_USE_EMULATORS=1`; Playwright as the seeded test customer: test spin x3 (writes nothing), real spin on an order (prize document appears, reload shows it parked, second spin returns the same), admin (seeded admin, never the real one) redeems against a later paid order and is refused for the same order / unpaid / second capped.
- [ ] Run the rules test, the functions tests, the Jest suite, `CI=true npm run build`, `check-locales`. Apply superpowers:verification-before-completion: every claim in the report has a command and output behind it. Write the report.
