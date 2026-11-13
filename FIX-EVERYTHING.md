# FIX-EVERYTHING — commit, merge, verify, and ship the prize wheel + roster safely

Itamar does NOT want to check things by hand. Do the work, prove it with commands, and report plainly. Read CLAUDE.md first. Write your final report in simple English, with a 5-line summary at the very top.

## 0. Ground rules

- NEVER use `git add -A`, `git add .` or `git commit -a`. Stage files by name only.
- NEVER commit `.env`, anything under `src/gallery/`, `src/images/`, `public/*.jpeg`, `graphify-out/`, or the stray untracked file `claude`. Do not delete the file `claude`; just report that it exists.
- Do not print secret VALUES anywhere (env vars, tokens, `.env` contents). Variable NAMES are fine.
- Do not rewrite history (no rebase, no force-push, no `reset --hard`).
- Do not touch the design of existing pages beyond what is listed here.

## 1. Understand the git state (it is noisy)

The repo has `*.jpeg` under Git LFS and CRLF/LF differences, so `git status` can show dozens of "modified" files that are not real changes. Check with
`git diff --ignore-cr-at-eol --stat -- . ':(exclude)src/gallery' ':(exclude)src/images' ':(exclude)public/comp.jpeg'`
The real uncommitted changes should be these files (verify, and tell me if anything else shows up):
`CLAUDE.md`, `api/_prizes.js`, `api/spin.js`, `src/config/prizes.js`, `src/lib/rewards.js`, `src/locales/{ar,en,he,ru}.json`, `src/pages/AdminRegistrationsPage.jsx`, `src/pages/PrizePage.jsx`, `vercel.json`, plus the new files `api/_lib/roster.js`, `api/_lib/rosterData.js`, `api/send-roster.js` and `api/telegram-webhook.js`.
Also add `graphify-out/` to `.gitignore`.
Leave `WHEEL-BRIEF.md`, `WHEEL-PHASE-2.md`, `WHEEL-PHASE-3.md` and this file untracked.

## 2. Commit the real changes

Stage only the files above (+ `.gitignore`), run `git diff --cached --stat` and confirm it is about 13 small files (if any locale file shows thousands of changed lines, that is a line-ending problem: fix it by normalising line endings of that file to what HEAD uses, then re-check). Commit with a clear message.

## 3. Merge origin/main (it has 5 commits by the "bot:" account that local does not have)

`git fetch --tags origin`, then `git merge origin/main` (a merge, not a rebase). The remote commits touch `src/lib/shareFiles.js`, `src/locales/*.json`, `src/pages/CompetitionPage.jsx`, `src/style.css`. They are Alina's change requests (shaking registrations page, translate button hiding the hamburger menu, package wording incl. other languages, download-all). Resolve any conflict by KEEPING BOTH SIDES' intent:
- locale JSON: union of keys; where both changed the same key, the origin/main (bot) wording wins for the package wording Alina asked for, our wording wins for prize/wheel/roster keys.
- `CompetitionPage.jsx`: keep Alina's changes AND our thank-you-screen wheel link and per-day packages.
After resolving, show me a short list of every conflict and how you resolved it.

## 4. Verification suite (all of it must pass; fix what fails)

1. `node scripts/sync-prizes.js` then `node scripts/check-locales.js` (must say PARITY: OK).
2. Tests: `npm test -- --watchAll=false` (must pass, including `src/config/prizes.test.js`).
3. Production-style build: Vercel builds with `CI=true`, which turns ESLint warnings into errors. Run `CI=true npm run build` (PowerShell: `$env:CI="true"; npm run build`). Fix every warning you introduced.
4. Smoke tests (write them in a temp folder, do NOT commit them), with `fetch` mocked, for `api/spin.js`, `api/verify-prize.js`, `api/send-roster.js` and `api/_lib/roster.js`:
   - spin: valid order returns a signed prize; same order twice returns the same prize; someone else's order is refused; after 31.12.2026 refused; missing `SPIN_SECRET` gives `not-configured`.
   - spin TEST mode (`{ test: true }`): the admin email and an email in `WHEEL_TEST_EMAILS` get `ok`, `test: true`, code `TEST`, `signature: null` and no order lookup; any other email gets 403 `not-tester`; with `WHEEL_TEST_EMAILS` unset only the admin may test; 20,000 test draws match the weights in `api/_prizes.js`; the page (`/prize?test=1`) must not call `recordPrize` or add the result to the customer's prizes, and the regular "Spin" button must still call `onSpin(false)` (a click event must never be read as `test`).
   - verify-prize: a tampered signature, a tampered `orderId`, an expired prize, a second capped prize, and "same order as the one it was won on" are all refused; a genuine one on a later paid order is accepted.
   - send-roster: on-demand path as admin sends a document; non-admin gets 403; cron path with no competition tomorrow does nothing; cron path when firebase-admin credentials fail sends the "could not build the roster" message.
   - roster xlsx: open the generated file with Python `openpyxl` (and LibreOffice if available) and confirm one sheet per day, RTL, frozen header, filter, rows ordered by entry number then class, and that a competition with 2 days gives 2 sheets.
   - telegram-webhook (`/sum`): no secret header → 401; wrong secret → 401; a chat id not in `TELEGRAM_CHAT_ID` → ignored silently; `/sum` from a listed chat sends one document per upcoming competition with sign-ups back to THAT chat only; the same `update_id` twice is handled once; when firebase-admin fails the reply is the "could not read the sign-ups" message with the admin-page link; `?setup=1` without the CRON_SECRET bearer → 401.
   - Draw distribution: run 100,000 draws through the real draw function and confirm the observed odds match `api/_prizes.js` within normal noise.
5. If you can run `vercel dev` (CLI installed + logged in + linked + `SPIN_SECRET` available in `.env.local`), do one real end-to-end spin with Playwright as the test account from CLAUDE.md (never the admin) and take screenshots at 375 and 1280, light and dark. If you cannot, say exactly why and skip it.

## 5. Decide whether it is safe to push to main

Pushing `main` deploys to the live site that real customers use. Push `main` ONLY if ALL of these are true, otherwise push the branch `release/wheel` (a Vercel preview) instead and say what is missing:
- the merge is clean and section 4 fully passed;
- `vercel env ls production` (names only) shows `SPIN_SECRET`, `CRON_SECRET`, `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. If you cannot check (CLI not logged in), treat this as NOT satisfied;
- `git fetch` once more right before pushing, and nothing new appeared on origin/main (the bot pushes there; if something new appeared, merge it and re-run section 4).

## 6. Things you must NOT do automatically, but must report on

- `.env` is tracked by git and carries service-account material. Do NOT untrack it in this task: CRA builds on Vercel may read `REACT_APP_*` values from it. List the variable NAMES in `.env`, say which are secrets, and which `REACT_APP_*` names the code uses that are NOT set in Vercel, so Itamar knows whether `git rm --cached .env` is safe. Rotating any pushed secret has to be done by Itamar in the Google/Firebase console.
- `PRIZE_VALID_UNTIL` is a placeholder (`2027-06-30`). Itamar must set the real end-of-season date.
- Legal review of the wheel, its rules page `/prize-terms` and the odds disclosure is still outstanding.
- `/api/media` returns 500 in production because the `FIREBASE_*` credentials on Vercel are broken. The roster cron and the prize forgery protection both get better once that is fixed. Diagnose the cause if you can without printing secret values (for example a missing `project_id`, a private key without real newlines, or a variable that is not set for the Production environment) and tell Itamar the exact fix.
- Password-reset mail reaching spam needs DNS records at the domain registrar, not code.

## 7. Final report format

1. Five-line summary: what was merged, whether tests/build passed, where it was pushed (main or `release/wheel`), the single most important thing Itamar still has to do.
2. Table: check name | result | evidence (command + one-line output).
3. Conflicts and how they were resolved.
4. What you could NOT verify and why.
5. Itamar's to-do list, in order, each item one line. It MUST include, with the exact names and nothing secret printed, the Vercel environment variables he still has to set and what happens without each:
   - `SPIN_SECRET` (the wheel cannot draw without it),
   - `WHEEL_TEST_EMAILS` (optional; his own email, so he can use `/prize?test=1`),
   - `TELEGRAM_WEBHOOK_SECRET` (16+ chars of letters, digits, `_` or `-`; needed for `/sum`),
   - `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (check they exist),
   and then the one-time registration of the Telegram webhook:
   `curl -H "Authorization: Bearer <CRON_SECRET>" "https://www.lens-dance.com/api/telegram-webhook?setup=1"`
   (tell him to run it himself on his own computer; you must not run it or print the secret).
