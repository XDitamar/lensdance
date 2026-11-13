# WHEEL-FIREBASE — move the prize wheel's server side from Vercel into Firebase

Itamar's decision: the wheel must NOT depend on Vercel. Everything server-side lives in Firebase (Cloud Functions 2nd gen, callable) and the result is saved under the customer's own data. This replaces the Vercel `api/spin.js` / `api/verify-prize.js` path and the idea of an HMAC `SPIN_SECRET`. It supersedes the parts of WHEEL-BRIEF.md / WHEEL-PHASE-2.md / WHEEL-PHASE-3.md / FIX-EVERYTHING.md that describe signing, `SPIN_SECRET`, `api/spin.js`, `api/verify-prize.js` and the local dev-api runner for the wheel. Everything else in those briefs (prizes, odds, one spin per order, redeem only on a later paid order, caps, expiry, 31.12.2026, copy, design, accessibility, test spins) stays.

Rules for you: do NOT push, do NOT create git worktrees or branches, do not touch `.env`, never print secrets, never create registrations in the real Firestore. Use superpowers (brainstorming/writing-plans/verification-before-completion) for the plan and the final check; use frontend-design only if UI changes. `npm run build` with `CI=true` before every commit.

## Why this design (so you can judge edge cases)

A checksum only protects something if the key that makes it is secret. Firestore security rules and the browser cannot hold a secret, so "a checksum in Firestore" alone would let a customer write themselves any prize. The fix is to make the prize record un-writable by the customer: only a Cloud Function (Admin SDK, built-in credentials, no keys to paste anywhere) writes it, and the rules say clients may only READ it. Once the record cannot be forged, no signature is needed, and "the customer deleted an old prize to hide it from the cap" also stops being possible. The broken `FIREBASE_*` variables on Vercel stop mattering for the wheel.

## Data model

- `users/{uid}/prizes/{orderId}`: ONE document per order; its existence IS "this order has been spun". Fields: `prizeId`, `label`, `tier`, `code` ("LD-" + 6 chars from the no-0/O/1/I alphabet), `orderId`, `issuedAt` (the ORDER's submittedAt, so redemption can compare "later order"), `createdAt` (server timestamp), `validUntil` ("YYYY-MM-DD", from PRIZE_VALID_UNTIL), `redeemed` (null or `{ at, orderId, by }`), `extra` (null or the team/jackpot details, written once by a function).
- Nothing about the wheel is written to `users/{uid}` itself any more (the owner can write that document, so it is forgeable). Stop reading the old `users/{uid}.prizes` and `prizeExtras`. The wheel was never live for customers, so no migration is needed; just check the real Firestore has no real prize records (look, don't delete) and say what you found.
- Keep `retention/{uid}` for the download lock and clock only; prize redemptions move onto the prize document.

## Firestore rules (edit `firestore.rules` in the repo)

```
match /users/{userId}/prizes/{prizeId} {
  allow read:  if isAdmin() || (request.auth != null && request.auth.uid == userId);
  allow write: if false;   // only Cloud Functions (Admin SDK bypasses rules)
}
```
Also make sure nothing else in the rules lets a client write under that path. The owner-read on `registrations` can stay (the app still uses it for /my-competitions). Tell Itamar the rules must be deployed (`firebase deploy --only firestore:rules`) or published in the console; do not claim they are live.

## Cloud Functions (`functions/`, Node 22, firebase-functions v2, firebase-admin)

Create `functions/package.json`, `functions/index.js`, and wire `firebase.json` (`"functions": [{ "source": "functions", "codebase": "default" }]`) and `.firebaserc` (project `lensdance-8d29c`). Look up the Firestore location and pick the closest Cloud Functions region (for Israel `me-west1` if available, otherwise `europe-west1`); put the region in ONE constant used by both the functions and the client. Cost guards on every function: `maxInstances` 5, `timeoutSeconds` 30, `memory` 256MiB, `minInstances` 0. No scheduled functions.

1. `spin` (callable). Requires `request.auth`. Input `{ orderId }` or `{ test: true }`.
   - TEST: allowed only for the admin email and emails in the `WHEEL_TEST_EMAILS` param (`defineString`, non-secret, set in `functions/.env`, unset means admin only). Returns a random prize (`crypto.randomInt(1000)` over the real weights), code `TEST`, writes NOTHING, ignores the end date and needs no order.
   - REAL: wheel must be open (server clock, Israel date <= `PRIZE_WHEEL_UNTIL`). Read `registrations/{orderId}` with the Admin SDK, require `userId === auth.uid` and `submittedAt` <= the end date. Then, in a transaction: if `users/{uid}/prizes/{orderId}` exists return it unchanged (so retries and double clicks cannot reroll); otherwise draw with `crypto.randomInt(1000)` over the weights in the prizes table, generate the code, and `create` the document. Return `{ prize, code, validUntil, orderId, index }` (index = slice position for the animation).
   - Errors are `HttpsError` with a short machine code in `details` (`not-signed-in`, `wheel-ended`, `bad-order`, `order-not-found`, `order-not-yours`, `order-too-late`, `not-tester`) that the client maps to the existing friendly messages.
2. `redeemPrize` (callable, admin only, by email). Input `{ uid, orderId (the prize's order), onOrderId }`. Enforce, server-side, in a transaction: the prize exists, is not already redeemed, is not expired; `onOrderId` is the SAME customer's registration, deposit paid, NOT the order the prize was won on, and placed AFTER it (`submittedAt` later than the prize's `issuedAt`); and for the six capped prizes (#6 to #11) it is the customer's EARLIEST capped prize (read all of `users/{uid}/prizes`). Writes `redeemed: { at, orderId: onOrderId, by: email }`. The admin page calls this instead of writing to `retention`.
3. `savePrizeExtra` (callable, the winner only). Input `{ orderId, extra }`. Re-validate on the server with the same rules as `validateTeam` / `validateJackpot` (five distinct friends with consent, or two different competitions for jackpot), only for a prize whose type needs it, only if `extra` is still empty (once), and write it to the prize document. Replace the client-side `submitPrizeExtra`.

Single source of truth for the prizes table: keep `api/_prizes.js` as the source of the weights and labels, extend `scripts/sync-prizes.js` to also generate `functions/prizes.js`, and make `src/config/prizes.test.js` (or a new test) fail if ANY copy differs.

## Client changes

- `src/firebase.js` (or a new `src/lib/functions.js`): `getFunctions(app, REGION)` and `httpsCallable` wrappers. No `fetch('/api/...')` for the wheel any more.
- `src/lib/rewards.js`: `requestSpin` calls the `spin` callable; map `HttpsError` codes to the existing `spinErrorKey` keys (unknown code -> generic, and keep the technical code in the console and in the generic banner); `fetchRewards` reads `users/{uid}/prizes`; remove `recordPrize` and client-side `submitPrizeExtra` and the signature handling. `orderStates` keeps working off "this order has a prize document".
- `src/pages/PrizePage.jsx`: the TEST spin stays (`/prize?test=1`); a test result is shown, never stored. Do not break the rule that a click event must never be read as `test`.
- Admin (`PrizeAdminPanel` and wherever "verified" appears): read the selected customer's `users/{uid}/prizes`; drop "verified / not verified" (a document in that path IS genuine) and show redeemable yes/no with the reason computed from the same rules (expired, already redeemed, capped-limit, same order, unpaid, not later). The "redeem" button calls `redeemPrize`.
- Delete the Vercel wheel code once the new path works: `api/spin.js`, `api/verify-prize.js`, the HMAC parts of `api/_verify.js` (KEEP `verifyCaller` and `isAdminEmail`, `send-roster` uses them), and their tests; and remove SPIN_SECRET from every doc. Do NOT remove the other `api/` functions.
- Local testing needs no Vercel and no proxy for the wheel: the client talks to Firebase directly. If the Firebase emulators are available (Java + `firebase-tools`), run Functions + Firestore + Auth emulators for an end-to-end test with Playwright as `test@gmail.com` (credentials in CLAUDE.md; never the admin) and point the app at them only in development. If they are not available, structure the functions so the core logic (draw, eligibility, redemption rules) is pure and unit-tested with a mocked Admin SDK, and say clearly that nothing was run against real Firebase.

## Tests you must write and run (temp or committed under `functions/test`)

draw distribution over 100,000 draws matches the weights; same order twice returns the identical stored prize; two concurrent spins on the same order create ONE document; someone else's order, a missing order, an order after the end date and a spin after 31.12.2026 are refused; TEST mode writes nothing and is refused for non-listed emails; redemption refuses same-order, unpaid, not-later, expired, already-redeemed and a second capped prize; `savePrizeExtra` is once-only and validates; a client write to `users/{uid}/prizes/*` is denied (rules unit test with the emulator if possible, otherwise explain how Itamar can check it in the console Rules Playground).

## What Itamar has to do (you cannot): put it in your final report as a numbered list, exact commands, nothing secret

1. Firebase Console -> Usage and billing: Cloud Functions need the Blaze plan. Check whether the project is already on it, and set a budget alert (the owner had a billing incident before).
2. `npm i -g firebase-tools`, then `firebase login`, then in the project folder `firebase use lensdance-8d29c`.
3. `firebase deploy --only functions` and `firebase deploy --only firestore:rules`.
4. Optional: add his email to `functions/.env` as `WHEEL_TEST_EMAILS=...` before deploying, to use `/prize?test=1`.
5. Then push `release/wheel` and test on the preview.
Vercel needs NO new environment variables for the wheel (no `SPIN_SECRET`, no `WHEEL_TEST_EMAILS`).

## Final report

Simple English, five-line summary first; then a table of checks (name | result | evidence); what was verified for real vs by mock/emulator; what you removed; risks (Blaze billing, rules must be deployed together with the functions, legal review of the wheel is still outstanding, `PRIZE_VALID_UNTIL` is still a placeholder).
