# WHEEL-PHASE-3 — spin right after ordering; redeem only later, after a paid deposit

Extends WHEEL-BRIEF.md and WHEEL-PHASE-2.md. `npm run build` before every commit. Do NOT push. Use frontend-design / Taste / emil-design-eng for the new UI and Playwright to verify (375 + 1280, light + dark). Tell Itamar plainly what you could not verify.

## Step 0 — find out why the spin failed (report BEFORE changing anything)

Itamar's screenshot of `/prize` shows the wheel and the error banner: "משהו השתבש. נסו שוב בעוד רגע." (something went wrong, try again). Reproduce it and find the real cause. Likely candidates, check each:
- the page was served by plain `npm start` (no `/api`, so `/api/spin` 404s) — use `npm run vercel-dev`;
- the live site does not have `api/spin.js` yet because nothing has been pushed;
- `SPIN_SECRET` is missing (put a throwaway value in `.env.local` for local testing; never print or commit it);
- the token check (identitytoolkit) fails, the end-date check rejects, or the response shape changed.
Read the actual `/api/spin` response and the browser console, and say which one it was. Make the error banner show a distinct, friendly message per cause (not signed in / wheel ended / already spun this order / server not configured / network), still without leaking internals.

## Step 1 — the new rules (decided by Itamar)

1. Right after someone submits a registration, the thank-you screen (`submitted` state in `CompetitionPage.jsx`) shows a clear button to the wheel, e.g. "סובבו את גלגל המזל", linking to `/prize?order=<registrationId>`. Copy must read as a gift, not pressure.
2. A customer gets **one spin per order** (registration), available immediately, no deposit needed to spin.
3. A prize can be **redeemed only if**: (a) it is verified, unexpired and redeemable under the capped-prize rule from Phase 2, (b) the order it is being used on has its **deposit marked paid**, and (c) that order is **not the order the prize was won on**. A prize can never be spent on the order that produced it.
4. The wheel still ends 31.12.2026: no spins for anything after that date.

## Step 2 — constraints you must design around (from CLAUDE.md)

- The server cannot write to Firestore (broken `FIREBASE_*`), and `registrations` is readable by the admin only.
- Prizes are client-written to `users/{uid}.prizes`, so the HMAC signature plus redemption-time verification is the enforcement.
- New collections are denied by default; rules are published by hand in the Firebase console.

## Step 3 — recommended design (change it if you find something better, and say why)

- **Deterministic draw per order.** Result = f(HMAC(SPIN_SECRET, uid | orderId)) mapped onto the weights in `api/_prizes.js`. The same order always gives the same outcome, so spinning the same order repeatedly can't reroll, and no "used" flag needs server storage. The spin animation then just plays that outcome.
- The draw must **not** depend on the client's prize history (otherwise a client could change what it sends to reroll). The capped-prize rule is therefore enforced at redemption only (as already documented); remove the best-effort redraw at spin time, and update its tests and comments.
- **Server verifies the order exists and belongs to the caller.** Let `api/spin.js` read `registrations/{orderId}` via the Firestore REST API using the caller's own ID token as the bearer, and check `userId === uid` and creation date ≤ 31.12.2026. This needs one rules change: allow an owner to read their own registration, e.g. `allow read: if isAdmin() || (request.auth != null && resource.data.userId == request.auth.uid);` — update `firestore.rules` in the repo and tell Itamar clearly that the rule must be **published by hand in the Firebase console**; do not claim it is live. If the registration field holding the owner is not `userId`, use the real one.
- The signed prize payload gains `orderId`: `uid|prizeId|code|issuedAt|validUntil|orderId`. Update signing, `verify-prize.js`, and the tests (including a forgery test for a tampered `orderId`).
- Spins are no longer credited when the deposit is toggled. Remove the `addSpins` call in `toggleDeposit` and the old "spins badge" logic that depended on it; keep the manual "grant spins" field only if it still makes sense, otherwise remove it and say so. Keep backwards compatibility for prizes already issued (they have no `orderId`; treat them as won on an unknown order, redeemable only on a later paid order).
- **One spin per order in the UI:** `/prize?order=...` shows the wheel if that order has no prize yet, otherwise shows the result already won. `/prize` without an order shows the customer's orders that are still unspun, plus their prizes.

## Step 4 — admin

On the admin registrations page, for each customer show their prizes with: the prize, verified / not verified, the order it was won on, expiry, and redeemable yes/no with the reason. Alina redeems a prize **against a specific later order**; the control is only enabled if that order has the deposit marked paid and is not the winning order. Record the redemption (which order, when) on `retention/{uid}`, as before.

## Step 5 — copy (he / en / ru / ar at exact key parity; print the check)

- Thank-you-screen button and one line of text.
- `/prize-terms` and the wheel small print: one spin per order; the prize is redeemable on a later order after the deposit is paid; it cannot be used on the order it was won on; plus everything already there. Keep the odds only in `/prize-terms`. Mark `TODO: legal review`.

## Step 6 — done criteria

Build passes, locale parity printed, unit tests for the deterministic draw, tampering, wrong-owner order, ended wheel, and redemption rules; the 100,000-draw simulation re-run against the new draw path (distribution should still match the weights); Playwright screenshots of the thank-you button and the per-order `/prize` states; update `CLAUDE.md` (new flow, the rules change that needs publishing, removal of spins-on-deposit) and commit without pushing. Finish with what you could not verify, plus risks:
- Anyone can create a registration, so they can "farm" spins; the protection is that redemption needs a paid deposit on a later order and the one-capped-prize rule. Say whether you think an extra limit is needed.
- Legal review of the wheel and its rules is still outstanding.
