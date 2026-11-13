# Prize code on the registration form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, this session). Steps use `- [ ]`.

**Goal:** A returning customer attaches a prize code to a NEW registration; the form says what it gives, the code travels with the order as a hint, Alina still redeems it.

**Architecture:** `checkPrizeCode` callable (looks the code up only inside the CALLER's own `users/{uid}/prizes`, judged by the existing `checkPrize` in `functions/lib/wheel.js`). A pure reducer drives the form control (`src/lib/prizeCodeState.js`); the control (`src/components/PrizeCodeApply.jsx`) is phone-first. The registration gets `prizeCode` (a hint, never proof); the Telegram alert and the admin list show it, and the admin panel pre-selects that order.

**Tech Stack:** firebase-functions 6 (v2 callable), `node:test`, React 18 / CRA / Jest, Playwright, Firebase emulators.

**Spec:** `WHEEL-CODE-ENTRY.md` (decisions 1 to 4 are final).

## Global Constraints

- No worktrees or branches; do not touch `.env`; never print secrets; NEVER submit a real registration to the real Firestore (the browser run points at the emulators).
- `CI=true npm run build` before every commit; locale parity (`node scripts/check-locales.js`).
- No Firestore triggers, no price recalculation on the form, no multi-use prizes. A code outside the caller's own prizes behaves exactly like one that does not exist.
- Hebrew copy in the brief is final; proper en/ru/ar. No percentages in new user-facing copy.
- Phone first: 375px, light and dark, RTL; input font at least 16px; targets at least 44px high; visible focus ring; `role="status"` announcements.
- Function options: `maxInstances` 5, 30 s, 256 MiB, same region constant.
- Push `HEAD:release/wheel` once; never `main`; no retry on failure.

## Review Focus

- A code typed in lower case, with spaces, hyphens or without `LD-` finds the same prize; Hebrew letters, emoji, empty and over-long input are `bad-code`.
- `TEST`, `LD-TEST` and another customer's real code answer `not-found`, indistinguishable from a made-up one.
- Enter in the field applies the code and does NOT submit the whole form.
- Duplicate-registration guard, multi-day selection, per-day packages and priority behave exactly as before (a real submit to the emulator).
- A code already attached to another order of the same customer is refused on the form.
- The Telegram alert escapes the code (`<`, `&`).

---

### Task 1: Server, `checkPrizeCode` (functions/)
**Files:** Modify `functions/lib/wheel.js`, `functions/handlers.js`, `functions/index.js`; Test `functions/test/wheel.test.js`, `functions/test/handlers.test.js`; extend `functions/e2e/wheel-api.js`.
**Produces:** `normaliseCode(raw): string|null`, `isTestCode(raw): boolean`, `codeReason(prizeReason): "redeemed"|"expired"|"capped-limit"|null`; handler `checkPrizeCode({ code }) -> { ok:true, prize:{prizeId,label,tier}, validUntil } | { ok:false, reason }`, reason in `not-found|redeemed|expired|capped-limit|bad-code`.
- [ ] Tests first: normalisation table (`ld-ab12cd`, ` LD AB12CD `, `ab12cd`, `LD-AB12CD`; bad: empty, 5 or 7 chars, 0/O/1/I, Hebrew, emoji, 60 chars); valid; not found; someone else's code (same answer); redeemed; expired; capped-limit (second capped) and the earliest capped passes; `TEST`; unsigned -> `not-signed-in`.
- [ ] Implement reusing `checkPrize`; query `where("code","==",X).limit(1)`; load all prizes only for a capped prize. Run `cd functions && npm test`.

### Task 2: Client library and the state machine
**Files:** Modify `src/lib/functions.js` (`callCheckPrizeCode`), `src/lib/rewards.js` (`checkPrizeCode(code)`, `normaliseCode`); Create `src/lib/prizeCodeState.js`; Test `src/lib/rewards.test.js`, `src/lib/prizeCodeState.test.js`.
**Produces:** reducer `prizeCodeReducer(state, action)` with states idle/open/checking/applied/error and actions toggle, type, fill, submit, result, fail, remove; error keys `empty|not-found|redeemed|expired|capped|attached|network`.
- [ ] Tests first (every transition; Enter path; remove; duplicate-attached; network), plus parity of `normaliseCode` with `functions/lib/wheel.js`. Implement.

### Task 3: The form control and its integration
**Files:** Create `src/components/PrizeCodeApply.jsx`, `src/components/PrizeCodeApply.css`; Modify `src/pages/CompetitionPage.jsx`, `src/lib/notify.js`, `api/notify-registration.js`, locale files (`competition.prizeCode.*`, four languages).
- [ ] Place it directly under the packages (after the priority add-on) and above contact and submit. Save `prizeCode` on the registration only when applied; pass it to `notifyNewRegistration`; add `🎁 קוד: ...` (escaped) to the expandable details.
- [ ] Mock-verify the notification (escaping) with a temp test.

### Task 4: Admin
**Files:** Modify `src/pages/AdminRegistrationsPage.jsx` (tag `🎁 LD-XXXXXX`, `translate="no"`; pass `prizeCode` in `orders`), `src/components/PrizeAdminPanel.jsx` (highlight the prize, pre-select that order), locale files (one key).
- [ ] Jest or browser check that the preselection only happens when the order is eligible.

### Task 5: Browser checks (emulators, nothing real)
- [ ] Playwright against the emulators at 375 and 1280, light and dark: valid code, every error, empty-field message, chips, Enter does not submit, no horizontal scroll, 44px targets, 16px input, scroll into view; a real submit TO THE EMULATOR for: plain, with code, multi-day with per-day packages, priority, and the duplicate guard. Pass over thank-you, `/prize`, `/my-competitions` at 375 and fix phone problems.

### Task 6: Housekeeping, commits, push, report
- [ ] `.gitignore` covers `functions/.env.*`; CLAUDE.md in a few lines (staged without the other session's unrelated notes); superpowers:verification-before-completion; small commits; `git push -u origin HEAD:release/wheel` once; report.
