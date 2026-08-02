# LensDance — Test Report & Fix Prompt

**Site:** https://www.lens-dance.com
**Date:** 2026-07-06
**Scope:** Full source-code security/bug/UX audit of the client and admin experience.

> **Note on method.** A live click-through as the admin and client accounts via Chrome was
> requested but could not be run in this session: the Chrome extension was not connected and the
> admin password is not available in the repo (it was removed from `CLAUDE.md`/`.env`). This
> report is a thorough **source-code audit** of every page and API route, which finds logic bugs,
> vulnerabilities and UX problems more reliably than clicking. A **manual live-test checklist** is
> included at the end so the same flows can be verified in the browser. Reconnect Chrome + provide
> the admin password and the live pass can be added.

---

## Severity summary

| # | Severity | Area | Issue |
|---|----------|------|-------|
| 1 | **High** | Security | `api/image.js` is an open proxy (SSRF / bandwidth abuse) |
| 2 | **High** | Functional | Password-reset flow is broken end-to-end |
| 3 | **High** | Functional/UX | Registration form fails silently for logged-out users |
| 4 | Medium | Security | Admin identity is a hard-coded email in ~6 places |
| 5 | Medium | Data | `users` schema mismatch between signup and admin-sync |
| 6 | Medium | Hygiene | Dead `CompetitionRegistration.jsx` component |
| 7 | Medium | UX | No route guards — protected pages flash content |
| 8 | Low | Security | `api/media.js` unauthenticated (public-only, low risk) |
| 9 | Low | Functional | SMS login likely non-functional; no user doc created |
| 10 | Low | Robustness | Folder-key matching guesses email variants |
| 11 | Info | UX / a11y / i18n | Generic errors, missing focus states/alt text, mixed i18n |

---

## Detailed findings

### 1. `api/image.js` is an open image proxy — **High (security)**
`api/image.js` fetches whatever is passed in `?url=` server-side and returns it. There is no
allowlist restricting the host to the Firebase Storage bucket.
- **Impact:** Server-Side Request Forgery — an attacker can probe internal/metadata endpoints from
  the Vercel function, and use the endpoint as a free bandwidth/resize proxy for arbitrary URLs.
- **Location:** `api/image.js`, lines 10–35 (`const { url } = req.query; … await fetch(url)`).
- **Fix:** Parse `url`, and reject anything whose hostname is not
  `firebasestorage.googleapis.com` (or the exact bucket host). Return 400 on mismatch.

### 2. Password-reset flow is broken end-to-end — **High (functional)**
The "שכחת סיסמה?" (Forgot password) link on the login page points to `/forgot-password`, but that
route renders **`ForgotPasswordPage.jsx`, which is actually an SMS phone-login component**
(`SmsAuthComponent`), not a "send reset email" form. Nowhere in the app is
`sendPasswordResetEmail` called, so **no reset email is ever generated**. `ResetPasswordPage.jsx`
(the `oobCode` handler) is correct but orphaned — nothing produces the link it consumes. The error
state of `ResetPasswordPage` even links back to `/forgot-password` ("request a new reset link"),
which again lands on SMS login.
- **Impact:** A user who forgets their password has no working way to recover it.
- **Location:** route `/forgot-password` in `src/App.js:69`; `src/pages/ForgotPasswordPage.jsx`
  (whole file is SMS auth); `src/pages/ResetPasswordPage.jsx:123`.
- **Fix:** Make `/forgot-password` a real form that calls
  `sendPasswordResetEmail(auth, email)` and shows a "check your inbox" confirmation. Move the SMS
  component to its own route (e.g. `/sms-login`) if it is still wanted.

### 3. Registration form fails silently for logged-out users — **High (functional/UX)**
`/register` (`CompetitionPage.jsx`) shows the full terms + multi-field form to everyone. But the
Firestore rule for `registrations` is `allow create: if request.auth != null`, and the submit
handler writes `userId: user?.uid || null`. A logged-out visitor can complete the entire form,
press submit, and gets only the generic Hebrew message **"אירעה שגיאה. נסו שוב."** — with no hint
that they must sign in first.
- **Impact:** Lost registrations; confused users; looks like the site is broken.
- **Location:** `src/pages/CompetitionPage.jsx:116–135`; rule in `firestore.rules:29`.
- **Fix:** If `!user`, gate the form behind a "please log in / sign up to register" call-to-action
  (or surface a `permission-denied`-specific message telling them to log in).

### 4. Admin identity is a hard-coded email in ~6 places — **Medium (security)**
`lensdance29@gmail.com` is duplicated across `constants.js`, `AdminPage.jsx`,
`AdminRegistrationsPage.jsx`, `firestore.rules`, `api/admin-sync-auth-users.js`. Any typo/rename
silently breaks admin access or, worse, leaves a stale grant.
- **Fix:** Move to a Firebase custom claim (`admin: true`) checked via `request.auth.token.admin`
  in rules and `getIdTokenResult()` in the client; keep the email only as a one-time bootstrap.

### 5. `users` schema mismatch between signup and admin-sync — **Medium (data)**
Signup (`SignupPage.jsx`) writes `{ name, username, email, discipline, role, createdAt }`.
`api/admin-sync-auth-users.js` writes `{ uid, email, displayName, photoURL, createdAt }` — no
`username`/`name`/`discipline`. Any page that reads `username` (including the new admin
registrations column, see "Implemented" below) will show nothing for users that exist only via the
sync path.
- **Fix:** Standardize on one shape. Have the sync populate `name`/`username`
  (fallback from `displayName`) and `discipline: "other"`, or read both keys on the client.

### 6. Dead `CompetitionRegistration.jsx` — **Medium (hygiene)**
`src/pages/CompetitionRegistration.jsx` is not routed, only `console.log`s on submit, and
references price fields (`prices.perEntry` etc.) that don't match the live pricing shape. It is
confusing dead code that looks like the real registration form.
- **Fix:** Delete it (the live form is `CompetitionPage.jsx`).

### 7. No route guards — **Medium (UX)**
`/me`, `/admin`, `/admin/registrations`, `/change-*` are all plain public routes; protection is
done inside each component via a redirect `useEffect`. This causes a brief flash of protected
content/loaders and duplicates the guard logic per page.
- **Fix:** Add a `<ProtectedRoute>` (and `<AdminRoute>`) wrapper in `App.js`. (Firestore rules
  remain the real security boundary — this is about UX and consistency.)

### 8. `api/media.js` is unauthenticated — **Low (security)**
It lists everything under Storage `public/` and returns 1-hour signed URLs with no auth check.
Because it is scoped to `public/`, exposure is low, but note that anyone can enumerate the public
bucket contents and hotlink.
- **Fix:** Acceptable if `public/` truly is public; otherwise add an auth/referer check.

### 9. SMS login likely non-functional; no user doc — **Low (functional)**
`SmsAuthComponent` needs Firebase Phone Auth (billing + reCAPTCHA + authorized domains) to work,
and on success it just `navigate('/')` without ensuring a `users/{uid}` doc exists, so an
SMS-only user would have a broken profile (no gallery folder, no name).
- **Fix:** Confirm phone auth is configured, or remove the feature; if kept, create the user doc
  on first SMS login.

### 10. Folder-key matching guesses email variants — **Low (robustness)**
Per-user media folders are keyed by a sanitized email, and `folderKeysFor` (used in
`MePage.jsx:235–241`) generates several plausible variants to match. This is fragile across
email-case changes.
- **Fix:** Store the canonical folder key on the `users` doc at signup and read it directly.

### 11. UX / accessibility / i18n polish — **Info**
- Generic error strings ("אירעה שגיאה. נסו שוב.") hide the real cause on login/registration.
- Custom emoji checkboxes/radios lack visible focus states; gallery images lack alt text.
- Text is a mix of hard-coded Hebrew, i18next keys and Google Translate — pick one path.
- Competition day options (`חמישי/שישי/רביעי`) are hard-coded in the form while the title is
  admin-editable — inconsistent.

---

## ✅ Implemented in this session (per your request)

**Admin registrations now show each registrant's email and username.**
- `src/pages/CompetitionPage.jsx` — new registrations now also store `userEmail` and `userName`
  on the registration document.
- `src/pages/AdminRegistrationsPage.jsx` — for each sign-up the admin now sees an **✉️ email** and
  **👤 @username** line (pulled from the `users` doc, with the stored `userEmail` as fallback);
  search now also matches email/username; sign-ups with no linked account show
  "נרשם ללא חשבון מחובר".
- **Caveat (finding #5):** for accounts created only via `admin-sync-auth-users`, `username` may be
  blank because the sync doesn't write it — the email still shows. Fixing #5 resolves this.

---

## Manual live-test checklist (run in Chrome)

**As client (`test@gmail.com`):**
1. Log in → confirm redirect to `/me` and gallery loads.
2. Download a single photo and a zip → confirm files save and a `downloads` log is written.
3. Click "שכחת סיסמה?" on `/login` → **expected bug #2** (SMS screen, no reset email).
4. Log out, open `/register`, fill and submit → **expected bug #3** (silent generic error).
5. Change name / discipline / password from settings → confirm each persists.

**As admin (`lensdance29@gmail.com`):**
6. Open `/admin` → upload and delete media into a user folder; view download history.
7. Open `/admin/registrations` → confirm the new email + username lines appear and search works.
8. Edit the competition title on `/register` → confirm it saves (`settings/competition`).
9. Trigger the auth-user sync → confirm `users` docs are created (watch for the schema gap #5).

---

## FIX PROMPT — paste this back to have the issues fixed

> Fix the following LensDance issues, in priority order. After each, keep Hebrew user-facing text
> and the existing visual style; run `npm run build` to confirm it compiles.
>
> 1. **Secure `api/image.js`:** only allow `?url=` whose hostname is
>    `firebasestorage.googleapis.com` (or the exact bucket host); return HTTP 400 otherwise.
> 2. **Fix the password-reset flow:** replace `/forgot-password` with a real form that calls
>    `sendPasswordResetEmail(auth, email)` and shows a "check your inbox" confirmation and error
>    handling. Move the existing SMS component to `/sms-login` (or delete it). Verify the
>    `ResetPasswordPage` `oobCode` flow works end-to-end and its "request a new link" link points
>    to the new form.
> 3. **Gate `/register` for logged-out users:** if not signed in, show a "log in / sign up to
>    register" call-to-action instead of letting the form submit and fail; and map
>    `permission-denied` to a clear Hebrew message.
> 4. **Unify the `users` schema:** make `api/admin-sync-auth-users.js` write `name`/`username`
>    (fallback from `displayName`) and `discipline: "other"` so admin views show username for all
>    users.
> 5. **Delete** the unused `src/pages/CompetitionRegistration.jsx`.
> 6. **Add route guards:** a `<ProtectedRoute>` for `/me` and settings pages and an `<AdminRoute>`
>    for `/admin` and `/admin/registrations`, in `src/App.js`.
> 7. **Move admin identity to a Firebase custom claim** (`admin: true`), updating `firestore.rules`
>    (`request.auth.token.admin`), the client `useIsAdmin` check, and the API header check; keep the
>    email only as a bootstrap.
> 8. **Store a canonical folder key** on the `users` doc at signup and read it in `MePage` instead
>    of guessing email variants.
> 9. **Polish:** surface specific error messages on login/registration; add focus states to the
>    custom checkboxes/radios and alt text to gallery images.
