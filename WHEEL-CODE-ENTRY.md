# WHEEL-CODE-ENTRY — apply a prize code on the registration form, phone-first, then push

Context: the wheel's server side is live in Firebase (Cloud Functions in `functions/`, prizes in `users/{uid}/prizes/{orderId}`, rules deployed). Read CLAUDE.md first. Itamar wants a returning customer to be able to use the discount from a prize they won: on the registration form, a small "I have a discount code" button; the customer types the code; if it is valid the form says what it gives and the code travels with the order; if there is no code or it is not valid, a small friendly message. It must be comfortable on a PHONE (most customers are on phones). Then push.

Rules for you: do not create git worktrees or branches (stay on the current branch), do not touch `.env`, never print secrets, NEVER submit a real registration in the real Firestore while testing (it would add a fake entry to Alina's list). Use superpowers (writing-plans first, verification-before-completion at the end), frontend-design + Taste + emil-design-eng for the UI, Playwright at 375 and 1280, light and dark, RTL. `CI=true npm run build` before every commit.

## Decisions already made (do not re-open them)

1. Redemption stays a human step: the customer only ATTACHES the code to the new order; Alina still redeems it from the admin page once the deposit is paid (existing `redeemPrize` rules: later order, deposit paid, not expired, earliest capped prize). Do NOT add Firestore triggers (region mismatch risk) and do NOT recompute prices on the form: show what the prize gives in words, and say the benefit is applied after the deposit is confirmed.
2. A code can only be looked up inside the CALLER's own `users/{uid}/prizes`, so nobody can probe other people's codes. A code that exists but belongs to someone else behaves exactly like one that does not exist.
3. The `prizeCode` written on the registration is only a hint for Alina (it can be forged and that is harmless: redemption re-checks everything). Never treat it as proof.
4. Prizes that cover several competitions (#4 "two next competitions", #9 "three next competitions") stay single-redemption in the system; Alina handles the extra competitions by hand. Mention this in your final report; do not build multi-use now.

## Server: one new callable in `functions/`

`checkPrizeCode` (callable, requires auth, same region and cost guards as the others: `maxInstances` 5, 30s, 256MiB). Input `{ code }`. Normalise: trim, uppercase, remove spaces, accept with or without the `LD-` prefix, reject anything not matching the code alphabet/length with `bad-code`. Query `users/{uid}/prizes` where `code == X`, limit 1. Return `{ ok: true, prize: { prizeId, label, tier }, validUntil }` when the prize may still be redeemed, else `{ ok: false, reason }` with reason one of `not-found`, `redeemed`, `expired`, `capped-limit` (a capped prize that is not the customer's earliest capped one), `bad-code`. Reuse the existing rule functions in `functions/lib/wheel.js` (single judge); do not copy the logic. The test code `TEST` is never valid (`not-found`). Add it to `functions/index.js`, `src/lib/functions.js` (`callCheckPrizeCode`) and tests.

## Form: `src/pages/CompetitionPage.jsx` (the registration form)

Place it directly under the packages and above the submit button. Match the existing form styling (read the file's `s` styles and src/style.css); do not restyle anything else.

- Collapsed by default: a text button "יש לי קוד הנחה" (44px high touch target, a visible focus ring, `aria-expanded`). Tapping it reveals an input and an "החל" button on one row (stack them on very narrow screens).
- Input: `dir="ltr"`, `autocapitalize="characters"`, `autocomplete="off"`, `autocorrect="off"`, `spellcheck="false"`, `enterkeyhint="done"`, font size at least 16px (iOS zooms the page on anything smaller), placeholder `LD-XXXXXX`, paste works, the value is uppercased as typed, Enter applies instead of submitting the whole form. On open, scroll the field into view so the phone keyboard does not hide it or the button.
- States, each announced politely (`role="status"`): idle; checking (button disabled, "בודק…"); applied; error.
  - applied: a calm confirmation line with what the prize gives (`prize.items.<id>.explain` already exists in all four languages), a note that the benefit is applied after the deposit is confirmed, and a "הסר קוד" button. While applied, the form keeps the code in state.
  - error messages (small, not alarming, never blaming): not-found/bad-code ("לא מצאנו קוד כזה בחשבון שלכם. בדקו את האותיות והספרות."), redeemed ("הקוד הזה כבר נוצל."), expired ("תוקף הקוד פג."), capped-limit ("אי אפשר לממש את הקוד הזה כרגע. אפשר לכתוב לאלינה."), already on another order of this customer ("הקוד כבר מצורף להזמנה אחרת שלכם." — check client-side against the customer's own registrations via `fetchMyRegistrations`), network ("לא הצלחנו לבדוק את הקוד. נסו שוב.").
  - Empty field and the user taps "החל": the small "no code" message: "אין קוד? סובבו את גלגל המזל אחרי ההרשמה, והקוד יחכה לכם להזמנה הבאה." with a link to `/prize`.
- Helper for the customer who has a code but forgot it: after the field opens, if the signed-in customer has prizes that `src/lib/prizeRules.js` says are still available, show them as small tappable chips ("יש לך הטבה: LD-XXXXXX") that fill the field. Read them with the existing `fetchRewards`. Display copy only; the server is the judge.
- On submit, if a code is applied, add `prizeCode` (the normalised code) to the registration document, and pass it to `notifyNewRegistration` (`src/lib/notify.js`, `api/notify-registration.js`: add a line "🎁 קוד: LD-XXXXXX" in the expandable details, escaped like the other fields). Nothing else about submitting changes. If the code was applied but the customer edits the form so that it no longer makes sense, nothing breaks: the hint is harmless.
- The duplicate-registration guard, multi-day selection, per-day packages and priority logic must behave exactly as before. Add a regression check for them.

## Admin

- `/admin/registrations`: a registration row with `prizeCode` shows a small "🎁 LD-XXXXXX" tag (`translate="no"`), next to the existing tags.
- `PrizeAdminPanel`: when the selected customer has a registration carrying a `prizeCode`, highlight that prize and pre-select that order as the redemption target (the existing button and `redeemPrize` rules do the rest).

## Copy

Hebrew above is final; write proper en/ru/ar translations (not literal). Locale keys at exact parity: `node scripts/check-locales.js`. No percentages anywhere user-facing.

## Mobile and accessibility acceptance (check them with Playwright and look at the screenshots)

At 375px wide, light and dark, RTL: nothing horizontally scrolls; the input and buttons are at least 44px tall; the field is at least 16px; the keyboard does not cover the field or the submit button (scroll into view); chips wrap cleanly; messages do not push the submit button off in a jarring way; tab order and focus ring are sensible; contrast is AA. Also run a quick 375px pass over the other customer screens that this feature touches or leads to (thank-you screen, `/prize`, `/my-competitions`) and fix any phone-layout problem you find, reporting each one. Do not redesign anything.

## Tests

Function tests: valid code, normalisation (`ld-ab12cd`, spaces, no prefix), not found, someone else's code (same answer as not found), redeemed, expired, capped-limit, `TEST`. UI logic test for the state machine where feasible. Do not submit real registrations; verify the submit path with a mock or a unit test and say so.

## Housekeeping and push

- Add `functions/.env.*` to `.gitignore` (the file Firebase created holds a personal email) unless it is already ignored.
- Update CLAUDE.md in a few lines (the code field, `checkPrizeCode`, `prizeCode` is a hint only, single-redemption limit for multi-competition prizes).
- Commit in small commits, then push: `git push -u origin HEAD:release/wheel`. If the push fails (no GitHub login in this session), do not retry; print the exact command for Itamar to run in his own terminal. Do NOT push to `main`.
- Final report in simple English: five-line summary, a table of checks (name | result | evidence), what was verified for real vs by mock, and a numbered list for Itamar. It MUST include: `firebase deploy --only functions` (the new `checkPrizeCode` is not live until he runs it; rules are unchanged), the push command if you could not run it, and "open the preview on a real phone".
