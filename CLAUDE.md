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
