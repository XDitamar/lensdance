# LensDance — Codebase Improvement Plan

A prioritized plan for improving the website codebase. Items are ordered by impact vs. effort.

## 1. Security (do first)

**Remove credentials from the repo.** `CLAUDE.md` contains the admin password in plain text and `.env` is tracked by git (it shows as modified). Move all secrets to Vercel environment variables, add `.env*` to `.gitignore`, rotate the admin password, and scrub git history if the repo is ever shared.

**Deploy Firestore rules from the repo.** `firestore.rules` was edited locally but there was no `firebase.json`, so rules changes likely never reached production — this is the probable cause of "change name / change category doesn't work". Now that `firebase.json` exists, run `firebase deploy --only firestore:rules` after every rules change (or add it to CI).

**Add a `storage.rules` file.** Storage rules are currently managed only in the Firebase console with no copy in the repo. Export them into the repo and deploy them the same way, so signup's folder-placeholder upload and per-user folder access are versioned and reviewable.

**Move admin identity to custom claims.** Admin is currently an email string hardcoded in ~6 places (frontend, rules, API). A Firebase custom claim (`admin: true`) checked via `request.auth.token.admin` is safer and removes the duplication.

## 2. Correctness and robustness

**Make multi-step flows resilient.** Signup previously failed entirely if the storage placeholder upload failed (now fixed — profile write and placeholder are best-effort). Apply the same pattern to other flows that chain Firebase calls (registration, download logging).

**Surface real error codes.** Several catch blocks showed a generic Hebrew message, hiding `permission-denied` vs network errors. Error messages now include the code; keep doing this everywhere.

**Folder-key matching is fragile.** Per-user media folders are keyed by sanitized email; `folderKeysFor` guesses variants. Store the canonical folder key on the user's Firestore doc at signup, and have the admin page read it instead of guessing.

## 3. Codebase hygiene

**Delete dead files.** `src/pages/HomePage copy.jsx`, `AccountPage.jsx` (route commented out), unused `.auth-*` CSS blocks, and `server/` scripts referenced by `dev:server` (nodemon/concurrently are devDependencies but no `server/` folder is documented). Dead code confuses every future change.

**Deduplicate shared UI.** `SettingsLayout`, `Field`, the `s` style object, and the `DISCIPLINES` list are copy-pasted across ChangeName, ChangeDiscipline, ChangePassword, and Signup. Extract to `src/components/settings/` and `src/constants.js`. A bug fixed in one copy today stays broken in the others.

**Finish the CSS-variable migration.** `style.css` mixes 47 `var()` uses with ~129 hardcoded hex values, and many pages style everything inline. Dark mode (now added) only covers tokenized styles; migrating the rest to the tokens in `:root` makes theming complete and future redesigns cheap.

**Split `MePage.jsx`.** At ~1,900 lines it holds gallery listing, downloads, zip export, admin editing, and iOS video priming. Split into hooks (`useUserMedia`, `useDownloads`) and smaller components.

## 4. Testing and CI

- The only test is the CRA default `App.test.js`. Add tests for the pure logic first: `folderKeysFor`, price selection in `useGeoPrice`, feed normalization in `InstagramFeed`/`api/instagram`.
- Add a GitHub Action (or Vercel check) that runs `npm run build` and `npm test -- --watchAll=false` on every push. The commit history ("fix vercel build" ×8) shows builds break silently.
- Add the Firebase emulator suite for local testing of rules — rules changes are currently untestable before deploy.

## 5. Performance

- Serve gallery grids via `/api/image` everywhere (MePage thumbnails included), not just the public gallery.
- Add `loading="lazy"` to grid images and `srcSet` for responsive sizes.
- The service worker caches images; add cache versioning/expiry so users don't keep stale galleries after a reshoot upload.

## 6. Product polish

- **Instagram feed**: `/api/instagram` is ready; set `INSTAGRAM_ACCESS_TOKEN` (Instagram Graph API long-lived token) or `INSTAGRAM_FEED_URL` (e.g. Behold.so) in Vercel to switch from placeholder images to real lens.dance posts.
- **i18n consistency**: UI mixes hardcoded Hebrew, i18next keys, and Google Translate. Pick one path (i18next with he/en resources) and migrate incrementally.
- **Accessibility**: the RTL layout is good; add `lang`/`dir` attributes per page, focus states on the custom buttons, and alt text from captions on gallery images.

## Suggested order

1. Secrets + rules deployment (hours, prevents live bugs)
2. Dead code deletion + shared-UI extraction (1 day)
3. CI with build + tests (half a day)
4. Folder-key canonicalization (half a day)
5. MePage split + CSS-variable migration (incremental)
