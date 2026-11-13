# WHEEL-PHASE-2 — one combined brief (read WHEEL-BRIEF.md first, this extends and overrides it)

Work in order. `npm run build` before every commit. Do NOT push. Don't invent business facts; use the copy below.

## A. Security first: close the prize-forgery gap

Winners write their own prize into `users/{uid}.prizes`, so a prize can be forged. Fix:
1. Create `api/verify-prize.js`: verifies each prize's HMAC signature server-side with `SPIN_SECRET`; returns valid/invalid per prize. Caller must be a real signed-in user or the admin (same identitytoolkit check the other endpoints use). `api/spin.js` already references this file.
2. Admin page: show "verified / not verified" beside every prize. "Redeemed" is only available on verified, non-expired, redeemable prizes.
3. Comment in code: the real fix is working FIREBASE_* credentials on Vercel so the server can write; until then redemption-time verification is the enforcement.

## B. Business rules decided by Itamar / Alina

1. **Capped prizes** = #6 (50% package), #7 (free extended pack), #8 (free reel), #9 (3 free competitions), #10 (team prize), #11 (jackpot). Each user is honoured for **ONE** capped prize in total.
   - Enforce at redemption: only the earliest verified capped prize per user (by signed timestamp) is redeemable; later ones show "not redeemable — one capped prize per customer".
   - Best-effort at draw time: the client sends its prior signed prizes; `api/spin.js` verifies them and, if a capped prize is already held, redraws among non-capped prizes only (renormalise weights at draw time; the weights table itself stays unchanged).
   - Comment that a client can withhold its history, which is why redemption is the real enforcement.
2. **Expiry**: every prize is valid until the end of the season. One constant `PRIZE_VALID_UNTIL` in `src/config/features.js`, placeholder `"2027-06-30"`, commented clearly as a placeholder for Itamar to set. Include `validUntil` in the signed payload; show it on the won screen and in the admin list; expired prizes are not redeemable.
3. The wheel itself still ends 31.12.2026 (server-enforced, already built).

## C. Wheel UX changes

### C1. Bigger wheel
Enlarge the wheel substantially: `width: min(92vw, 560px)` on phones/tablets, larger on desktop (target about 600–680px, still fully visible without scrolling the spin button off-screen at 1280×720). The hub (Alina's logo) scales with it and stays fixed (no rotation). No layout shift while spinning. Re-check light + dark.

### C2. Short names on the slices + a one-line explanation
The current slice names are long and unclear. Use SHORT labels on the wheel (max ~2 words, readable at 375px) and a one-line plain explanation shown in three places:
- under the wheel as a "what can I win?" list (collapsed `<details>` on mobile, open on desktop),
- when a slice is tapped/focused/hovered (small tooltip or card, keyboard accessible),
- on the result screen, together with the prize.

Copy (Hebrew is final; write proper en/ru/ar translations, not literal ones):

| # | Short label (on the wheel) | Explanation (one line) |
|---|---|---|
| 1 | 5% הנחה | 5% הנחה על חבילה אחת לבחירתך |
| 2 | 10% הנחה | 10% הנחה על חבילות הצילום בתחרות לבחירתך |
| 3 | משלוח מהיר | שדרוג לאספקה מהירה של התמונות שלך |
| 4 | 15% הנחה | 15% הנחה על התמונות בשתי התחרויות הבאות לבחירתך |
| 5 | 20% סרטון | 20% הנחה על סרטון ריל או סרטון ארוך |
| 6 | 50% הנחה | 50% הנחה על חבילה אחת בתחרות לבחירתך |
| 7 | חבילה מורחבת | חבילת תמונות מורחבת במתנה |
| 8 | ריל מתנה | סרטון ריל במתנה |
| 9 | 3 תחרויות | כרטיסייה: שלוש התחרויות הבאות בחינם |
| 10 | קבוצה מנצחת | בוחרים 5 חברים, וכולכם מקבלים 50% הנחה על חבילות לבחירתכם |
| 11 | ג'קפוט | סרטון ארוך במתנה וחבילת תמונות מורחבת, בשתי תחרויות לבחירתך (לא שניהם באותה תחרות) |

Row 9's wording is taken from Alina's note as written; add a code comment `TODO: confirm exact wording with Alina`.

The full-length prize names from WHEEL-BRIEF.md remain what is stored on the user's prize record.

### C3. Odds: off the wheel page, disclosed in the rules page
Do NOT show any percentages, "rare/common" words, or tier hints on the wheel page, slices, tooltips, result screen or small print. Rarity tiers only drive how much celebration the reveal has.

The odds are disclosed in a dedicated rules page, which is the standard place for them:
- New public route `/prize-terms` ("תקנון גלגל המזל") in all four languages, written as a plain rules document: who may spin and how spins are earned (deposit paid), the end date 31.12.2026, prize list with each prize's conditions, the capped-prize rule, expiry, no cash value, no combining, Alina's confirmation, and a **table with the exact probability of every prize**, generated from the same weights the server uses (single source of truth, so the page can never drift from the real draw).
- The small print on the wheel page ends with a clearly readable link "תקנון מלא והסתברויות" (not hidden, not tiny-grey-on-grey; normal link styling, keyboard focusable, sufficient contrast) to `/prize-terms`.
- The link must also be visible on the result screen next to the prize.
- Do not obscure the link or make it look like something else; the goal is that the odds are off the main screen but easy to find for anyone who looks.
- Mark the page copy with a `TODO: legal review` comment. Do not present it as legally reviewed.
- The weights live only in server code plus this page's generated table.

### C4. Small print (all four languages, parity)
Keep it short: the wheel is available until 31.12.2026; benefits are not redeemable for cash and cannot be combined unless stated; prizes valid until the season-end date; one capped prize per customer; prizes subject to Alina's confirmation; the link to the full rules and odds (`/prize-terms`). No percentages in the small print itself.

## D. Skills / plugins

Invoke them, don't just mention them: **frontend-design** (direction for the bigger wheel + the "what can I win" panel), **Taste Skill**, **emil-design-eng** (interaction feel), **Impeccable** (run its audit pass on `/prize` at the end and fix what it finds), **Playwright** (screenshots at 375 and 1280, light and dark: idle, spinning, result, ended, no-spins; tooltip/explanation open; confirm the wheel and spin button fit the viewport). Motion MCP is optional; plain CSS is fine if it looks good.

## E. Accessibility

Slice explanations reachable by keyboard and by screen reader (the wheel graphic stays `aria-hidden`; the prize list is real text). `prefers-reduced-motion` still honoured. Contrast checked at the new size in both themes. Labels readable at 375px.

## F. Housekeeping

- Update `CLAUDE.md`: wheel is on; client-side guard limitation; real fix = FIREBASE_* credentials; `PRIZE_VALID_UNTIL` is a placeholder; odds are intentionally hidden.
- Update `WHEEL-BRIEF.md` open questions with the answers above.
- Locale key parity across he/en/ru/ar: print the check result.
- Re-run the 100,000-draw simulation including the capped-prize redraw case and paste the numbers.

## G. Done criteria / summary

`npm run build` passes, parity printed, screenshots reviewed by you, simulation numbers shown, commit (no push). List anything you could not verify. Note these as risks, don't block on them:
- Odds disclosure: the odds are published in `/prize-terms` rather than on the wheel page. Whether that is sufficient, and whether a prize wheel tied to a purchase needs a permit under Israeli promotion/lottery rules, is a question for a lawyer. Itamar/Alina must check before launch.
- `SPIN_SECRET` must be set in Vercel before the wheel works in production.
