# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LensDance is a website for an equestrian/horse-riding photographer. Clients sign in to view and download their photos; an admin uploads media and manages competition registrations. Stack: Create React App (React 18, JavaScript, no TypeScript in app code) + Firebase (Auth, Firestore, Storage) + Vercel serverless functions in `api/`.

## Commands

- `npm start` — run the CRA dev server at http://localhost:3000
- `npm run build` — production build to `build/`
- `npm test` — Jest/react-scripts test runner (watch mode); run a single file with `npm test -- src/App.test.js`
- `npm run vercel-dev` — run with Vercel serverless functions (`api/`) locally

Node 22.x is required (`engines` in package.json). Deployment is Vercel (`vercel.json`): CRA build, SPA rewrite of all non-`/api/` routes to `index.html`, long cache headers on `/api/image` and `/static/`.

## Test Accounts

- Client (simulated customer): `test@gmail.com` / password `test@gmail.com`
- Admin: `lensdance29@gmail.com` / password `[REMOVED - check environment variables]`

## Architecture

### Frontend (`src/`)

- Routing in `src/App.js` (react-router v7). Entry `src/index.js` wraps the app in `BrowserRouter` + `AuthProvider` and registers a service worker (`/sw.js`) for image caching.
- Auth: `src/context/AuthContext.jsx` exposes `useAuth()` (`user`, `loading`, `logout`) over Firebase Auth. Firebase client config is hardcoded in `src/firebase.js` (project `lensdance-8d29c`).
- Admin identity is email-based, not role-based: `lensdance29@gmail.com`, via `useIsAdmin()` hook and `REACT_APP_ADMIN_EMAIL` fallbacks in pages. The same email is hardcoded in `firestore.rules` (`isAdmin()`).
- Per-user media: each client's photos live in a Firebase Storage folder named after a sanitized version of their email (`.#$[]` replaced with `_`). `src/lib/downloads.js` (`folderKeysFor`) generates all plausible folder keys so the admin can match download logs to folders.
- `/me` (`MePage.jsx`, largest page) — client's personal gallery: lists their Storage folder, downloads files (single + zip via jszip/file-saver), logs each download to the `downloads` collection.
- `/admin` (`AdminPage.jsx`) — upload/delete media into user folders, view per-user download history. `/admin/registrations` — manage competition sign-ups.
- `/register` (`CompetitionPage.jsx` + `CompetitionRegistration.jsx`) — competition registration with Hebrew terms (TERMS), writes to `registrations`; package IDs (`photos`, `video`, `short`) must stay stable — the admin page maps them.
- Public gallery: `src/lib/galleryCache.js` caches the Storage `MainGallery` folder session-wide and pre-warms images from the app root. In production, grid images go through `/api/image` for resizing.
- Geo pricing: `src/hooks/useGeoPrice.js` — detects country via ipapi.co (cached in sessionStorage); Israel gets ₪ prices, everyone else USD (`PRICES.IL` / `PRICES.INTL`).
- i18n: i18next (`src/i18n.js`) plus a Google Translate loader and floating translate button. Much of the UI text is Hebrew (RTL).
- Contact/WhatsApp config in `src/config/contact.js`.

### Serverless (`api/`, Vercel functions)

- `api/image.js` — image proxy: fetches a Firebase download URL, resizes with sharp to WebP (`?url=&w=&q=`), heavy CDN caching. Gallery grid performance depends on it.
- `api/media.js` — lists Storage `public/` files with 1-hour signed URLs (firebase-admin).
- `api/admin-sync-auth-users.js` — POST, syncs all Firebase Auth users into the Firestore `users` collection; authorized by `x-admin-email` header matching the admin email.
- `api/send-roster.js` + `api/_lib/roster.js` — the competition roster as an .xlsx (one row per rider per day; written with jszip, no spreadsheet library) sent to Alina's Telegram. Cron (`0 5 * * *`, CRON_SECRET bearer) sends it the day before a competition's `startDate`; the "send me the roster" button on `/admin/registrations` sends it on demand, reading `registrations` with the admin's own ID token (no server credentials needed). The cron needs working firebase-admin credentials; when they fail it sends Alina a "could not build the roster, use the button" message instead of staying silent. Test the cron with `GET /api/send-roster?for=YYYY-MM-DD` and the CRON_SECRET bearer.
- Server-side env vars: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_SERVICE_ACCOUNT`, `ADMIN_EMAIL` (see `.env` / `.env.local`, not committed).

### Firestore collections (rules in `firestore.rules`)

- `users` — profile per Auth user; readable/writable by the owner and the admin.
- `downloads` — download log; any signed-in user can create, only admin reads, never updated/deleted.
- `registrations` — competition sign-ups; create by signed-in users, read by admin only.
- `agreements` — create/read by signed-in users, immutable.
- `mediaGallery` — public read, client writes blocked.
- `settings` — public read, admin write (competition title etc.).
- Default deny for everything else. When adding a collection, update `firestore.rules` — the default rule blocks it.

## Conventions

- Comments and UI strings mix Hebrew and English; keep Hebrew user-facing text as-is unless asked.
- Styling is plain CSS files (`src/style.css`, per-page CSS) — no CSS framework.
- ESLint via CRA defaults (`react-app` config); no separate lint script.

## State of play (handover — October 2026)

### Before anything else

- **There are ~10 local commits that have never been pushed**, plus uncommitted
  edits on top. Several bugs Alina is still reporting are *already fixed in
  those commits* and simply not deployed — multi-day selection on the sign-up
  form, the main gallery missing from the admin list, the registration page
  "shaking". Push and deploy first, then re-test, before debugging anything.
- **`.env` is tracked by git.** It is listed in `.gitignore` but was committed
  before that, so the ignore rule does nothing. It carries Firebase service
  account material. `git rm --cached .env` and rotate anything that has been
  pushed. This has been flagged repeatedly and not yet done.

### Things that are broken in production right now

- `/api/media` returns 500. The `FIREBASE_*` service-account variables on
  Vercel do not work, which is why nothing server-side can write to Firestore.
  Several designs below are shaped around that limitation.
- Password reset emails land in spam: Firebase sends them from
  `noreply@lensdance-8d29c.firebaseapp.com`. The fix is the custom-domain flow
  in Authentication → Templates plus DNS records on lens-dance.com, not code.

### Decisions that are not obvious from the code

- **Storage has no CORS policy.** `<img>` works, `fetch()` does not. That is
  why `/api/file` exists: it proxies a Storage URL server-side so the bytes
  arrive same-origin, which is what lets the gallery build a zip (desktop) or
  a share sheet (phone). Setting CORS on the bucket would make the proxy
  unnecessary; `src/lib/fetchMedia.js` already prefers the direct route.
- **`retention/{uid}` carries three unrelated things** — the 30-day clock,
  the download lock (`unlocked` / `unlockedAlbums`), and prize redemptions
  (`redeemed.<code>` = which order a prize was spent on, and when).
  Not good design, but deliberate: it is the only document with admin-write /
  client-read permissions, and a new collection is denied by default until
  firestore.rules is published by hand in the console.
- **An upload's competition is its folder.** `client/תחרות/photo.jpg`. The path
  is the tag, so listings carry it for free. Admin listing must therefore be
  recursive (it is).
- **The prize wheel is ON** (`PRIZE_WHEEL = true`, `/prize` live, public rules at
  `/prize-terms`) and its server side lives in **Firebase, not Vercel**: Cloud
  Functions 2nd gen in `functions/` (`spin`, `redeemPrize`, `savePrizeExtra`,
  callable, region `europe-west1`, `maxInstances` 5). It needs the Blaze plan.
  - **Data**: `users/{uid}/prizes/{orderId}`, ONE document per order; its
    existence IS "this order has been spun" (no spin counter anywhere). Fields:
    `prizeId, label, tier, code, orderId, issuedAt` (the ORDER's submittedAt),
    `createdAt, validUntil, redeemed` (null or `{at, orderId, by}`), `extra`
    (null, or the team / jackpot details). Nothing about the wheel is stored on
    `users/{uid}` itself (its owner can write it).
  - **Why there is no signature**: `firestore.rules` lets clients only READ
    `users/{uid}/prizes`; only the functions (Admin SDK, built-in credentials)
    write it. A record that cannot be forged needs no checksum, and a customer
    cannot delete an old prize to hide it from the one-capped-prize rule. The
    broken `FIREBASE_*` variables on Vercel no longer matter for the wheel.
  - **Flow**: one spin per ORDER (a registration), no deposit needed to spin. The
    thank-you screen links to `/prize?order=<registrationId>`. `spin` runs in a
    transaction: it returns the stored prize if there is one (retries and double
    clicks cannot reroll), otherwise checks the order (the caller's own, placed
    by 31.12.2026) and draws with `crypto.randomInt(1000)` over the weights.
  - **Redeeming**: only the admin, via `redeemPrize`, on a LATER order of the
    same customer whose deposit is paid, never the order it was won on, not
    expired, not already redeemed, and for the six capped prizes (#6 to #11)
    only the customer's EARLIEST one (a redeemed capped prize still counts).
    `savePrizeExtra` takes the team / jackpot details once, validated again on
    the server. The reasons the admin screen shows (`src/lib/prizeRules.js`) are
    a display copy of `functions/lib/wheel.js`, parity-tested.
  - **Entering a code on the sign-up form** (`PrizeCodeApply`, phone-first): a
    returning customer can attach a prize they already have to a NEW order.
    `checkPrizeCode` (callable) looks up `{ code }` among the CALLER'S OWN
    prizes only (`users/{uid}/prizes`, `code` field) and answers `ok` or a
    reason (`not-found` also covers someone else's code and `TEST`,
    `redeemed`, `expired`, `capped-limit`). The code goes on the registration as
    `prizeCode`, which is a HINT only: it shows a gift tag and a pre-selection
    for Alina, who still redeems through `redeemPrize` once the deposit is paid;
    nothing trusts the field. Prizes with a multi-competition wording (#4 and
    #9) stay single-redemption in the system; Alina handles the extra
    competitions by hand. `checkPrizeCode` is live only after
    `firebase deploy --only functions` (rules are unchanged).
  - **The prizes table has ONE source**, `api/_prizes.js` (weights, labels, end
    dates, the functions region). `node scripts/sync-prizes.js` writes
    `src/config/prizes.js` and `functions/prizes.js`; `src/config/prizes.test.js`
    fails on any drift. Changing weights or `PRIZE_VALID_UNTIL` means: edit
    `api/_prizes.js` (and `src/config/features.js` for the dates), run the sync,
    redeploy the functions.
  - **Test spins**: `/prize?test=1` adds a "test spin" button. `spin` accepts
    `{ test: true }` (the exact value only) from the admin and from emails in
    the `WHEEL_TEST_EMAILS` function parameter (`functions/.env`, see
    `functions/env.example`; unset = admin only). It writes nothing.
  - **Deploy**: `firebase deploy --only functions` and
    `firebase deploy --only firestore:rules` (rules and functions together).
    Vercel needs no environment variable for the wheel.
  - **Local testing needs no Vercel**: `REACT_APP_USE_EMULATORS=1 npm start`
    (development builds only) talks to the Firebase emulators (Auth, Firestore,
    Functions: `firebase emulators:start`; needs Java). Function logic tests:
    `cd functions && npm test`. Rules tests: `scripts/firestore-rules.test.js`.
  - **`PRIZE_VALID_UNTIL` (`src/config/features.js` and `api/_prizes.js`) is a
    PLACEHOLDER** (`2027-06-30`). Itamar to set the real end of season.
  - **Odds are intentionally NOT on the wheel page**: no percentages and no
    "rare" wording there. They are in `/prize-terms`, generated from the same
    weights. Legal review of that approach is still outstanding.
- **English is served from `en.json`, not Google Translate** (`NATIVE_TARGETS`
  in `src/lib/lang.js`). Google now runs only for languages with no locale
  file. Google's banner is hidden in style.css.
- Locale files must stay at exact key parity: run `node scripts/check-locales.js`. (Earlier the check
  was a one-liner comparing flattened keys.)

### Known-unfinished work

- Privacy policy, terms, cookie policy and accessibility statement pages:
  agreed, not written. Business details were never supplied.
- Fabricated content to remove, confirmed with the owner: the three named
  testimonials in `locales/*.json`, and the eight invented posts in
  `components/InstagramFeed.jsx`.
- Accessibility: alt text, keyboard focus, contrast, button labels.
- No account-deletion flow, which Amendment 13 now makes a legal matter.
- No rate limiting on `/api/file` or `/api/image`, and no spend
  cap on Vercel or GCP. The owner has already had one billing incident.
