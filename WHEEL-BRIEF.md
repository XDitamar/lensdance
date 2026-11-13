# WHEEL-BRIEF — re-enable and finish the LensDance prize wheel

Read CLAUDE.md first (especially: "The prize wheel is built and switched off", the `retention/{uid}` note, and the broken firebase-admin on Vercel). Then do this brief. Work in small steps, run `npm run build` before every commit, and do NOT push — Itamar pushes.

## 0. Skills / plugins to use (all are installed — invoke them, don't just mention them)

- **frontend-design** — before touching the wheel UI, to set a clear design direction that fits the existing site (cream/brown palette, Georgia + Arial, `--pz-*` tokens, light + dark via `html[data-theme="dark"]`).
- **Taste Skill** (4 sub-skills) — apply to typography, spacing, colour restraint. The wheel previously looked "childish"; it must feel like a premium photography brand.
- **emil-design-eng** — for the feel of the interaction: easing, wind-up / spin / settle, press states, result reveal, no layout shift.
- **Motion AI Kit** (`/motion`, MCP) — for the spin and the win reveal. Respect `prefers-reduced-motion` (skip spin animation, show result directly).
- **Impeccable** — run its polish/audit pass at the end on `/prize`.
- **Playwright** — verify. Screenshot `/prize` at 375px and 1280px, light AND dark, idle / spinning / result states, plus the "no spins left" and "wheel ended" states. Look at the screenshots yourself and fix what is off.
- find-skills — only if something is missing.

## 1. Turn it back on

- `src/config/features.js`: `PRIZE_WHEEL = true`.
- `src/App.js`: restore the `/prize` import and route (commented out).
- Header settings row + spins badge are already guarded by `PRIZE_WHEEL`; confirm they appear.
- Confirm spins are credited when a deposit is marked paid (`toggleDeposit` → `addSpins`, only on the false→true transition).

## 2. End date: the wheel is available until 31.12.2026

- Add `PRIZE_WHEEL_UNTIL = "2026-12-31"` (end of day, Asia/Jerusalem) in `src/config/features.js`.
- **Enforce it server-side in `api/spin.js`** too (a client clock can be faked). After the date the server refuses spins and the page shows a calm "the wheel has ended" state instead of the wheel.
- Show the end date on the page.

## 3. The prizes (Hebrew labels are final copy — keep exactly)

Slice **angles stay equal** (readability). Probability is independent of slice size.
Weights are out of 1000. The server draw uses `crypto.randomInt(1000)`. Tune only via the weights, in ONE place.

| # | Label (he) | Weight | Odds | Tier |
|---|---|---|---|---|
| 1 | 5% הנחה על חבילה לבחירתך | 320 | 32% | common |
| 2 | 10% הנחה על חבילות צילום לבחירתך (בתחרות) | 260 | 26% | common |
| 3 | שדרוג לאספקה מהירה | 150 | 15% | medium |
| 4 | 15% הנחה על תמונות בשתי התחרויות הבאות לבחירתך | 130 | 13% | medium |
| 5 | 20% הנחה על סרטון ריל / סרטון ארוך | 80 | 8% | low |
| 6 | 50% הנחה על חבילה לבחירתך (בתחרות אחת) | 25 | 2.5% | rare |
| 7 | חבילת תמונות מורחבת במתנה | 12 | 1.2% | rare |
| 8 | סרטון ריל במתנה | 8 | 0.8% | rare |
| 9 | כרטיסייה: שלוש התחרויות הבאות בחינם | 10 | 1% | ultra-rare |
| 10 | **קבוצה מנצחת** — הזוכה בוחר 5 חברים שמקבלים יחד איתו 50% הנחה על חבילות לבחירתם | 4 | 0.4% | ultra-rare |
| 11 | **ג'קפוט** — סרטון ארוך במתנה + חבילת תמונות מורחבת, לשתי תחרויות לבחירתך (לא שניהם באותה תחרות) | 1 | 0.1% | near-impossible |

Total = 1000. Rarity tiers drive the reveal: common = quiet, rare = more celebration, ultra-rare/jackpot = full moment (still tasteful, no confetti cartoon).

Rules:
- `api/spin.js` PRIZES and `src/lib/rewards.js` WHEEL currently duplicate the list and must match. Make this a single source of truth if the Vercel function can import it (e.g. `api/_prizes.js`), otherwise keep two copies plus a comment and a check that fails the build/test if they drift.
- Results stay HMAC-signed (`SPIN_SECRET`); server cannot write Firestore. Keep `recordPrize` (arrayUnion on `users/{uid}.prizes`) and store the prize id, label, tier, timestamp, signature.
- Prize labels need all four locales (he/en/ru/ar) at **exact key parity**. Run the flattened-key parity check after editing locales. English/Russian/Arabic translations: write them properly, not literal.

### Special flows
- **#10 Team prize**: after winning, show a small form where the winner enters 5 friends' emails (or names + phone). Store it on the winner's own `users/{uid}` doc (owner-writable, so no rule change). Validate 5 distinct entries, can only be submitted once, admin can see it on the admin page next to the user. Add a consent line: the winner confirms the friends agreed to be contacted.
- **#11 Jackpot**: after winning, the winner picks two competitions from the list (`fetchCompetitions`), one for the long video and the other for the extended pack. Enforce "not both in the same competition" in the UI and validation. Store on the user doc, visible to admin.
- **#9 Three free competitions**: record it; admin sees it. Do not invent an automation for it.

## 4. Small print (under the wheel, small type, all four languages)

Include: the wheel is available until 31.12.2026; benefits are not cash-redeemable and cannot be combined unless stated; prizes are subject to Alina's confirmation; the odds table (publish the percentages above); reference to the site terms. Mark the text `TODO: legal review` in a code comment — see "risks" below. Do not claim anything not in this brief.

## 5. Accessibility (the site has an open accessibility task — don't make it worse)

- Spin button is a real `<button>` with a clear label, keyboard-focusable, visible focus ring.
- Result announced via `aria-live="polite"`; the wheel graphic is `aria-hidden` and the prize list is available as text.
- `prefers-reduced-motion` honoured.
- Contrast checked in both themes.
- Locked/blocked states have text, not just colour.

## 6. Admin

- Admin page: show each user's won prizes, with the special-flow details (team list, jackpot picks), so Alina can honour them.
- A way for Alina to mark a prize as "redeemed" (store on `retention/{uid}` since it is admin-write; do not add a collection).

## 7. Done criteria

- `npm run build` passes, locale parity verified (print the result).
- Simulation: write a tiny script that runs the draw 100,000 times and prints the observed distribution; paste the numbers in your summary so Itamar can see the odds are honoured.
- Playwright screenshots reviewed (375 / 1280, light / dark, all states).
- Summarise what changed, list anything you could not verify, and list the open questions below.

## Open questions: ANSWERED (WHEEL-PHASE-2.md)

1. Prize #9 ("one per receipt"): answered through the capped-prize rule. #6 to #11 are capped: each user is honoured for ONE capped prize in total (the earliest verified one by signed timestamp).
2. Expiry: every prize is valid until the end of the season, `PRIZE_VALID_UNTIL` in `src/config/features.js` (and `api/_prizes.js`). The value `2027-06-30` is a PLACEHOLDER for Itamar to set.
3. Cap on 50% / free-package wins: covered by the same one-capped-prize-per-customer rule.

## Risks to flag in the summary (do not block on them)

- A prize wheel tied to a purchase may count as a promotion/lottery under Israeli law and may need a published תקנון or even a permit. Itamar/Alina should check with a lawyer before launch. Say this plainly; don't present the small print as legally reviewed.
- `SPIN_SECRET` must be set in Vercel before the wheel works in production.
- The 50% / free-package / jackpot prizes have a real cost. Include the expected cost per 100 spins in the summary using the weights above, so Alina can decide whether the odds are right.


## Phase 3 note (WHEEL-PHASE-3.md)

Spins are now one per ORDER, available right after ordering (no deposit needed to spin); the prize is redeemable only on a LATER order whose deposit is paid, never on the order it was won on. Spins are no longer credited when a deposit is marked paid. This supersedes sections 1 ("Confirm spins are credited when a deposit is marked paid") and 6 ("mark as redeemed": it is now recorded against a specific order).
