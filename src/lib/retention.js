// src/lib/retention.js
//
// ─────────────────────────────────────────────────────────────────────────────
// HOW LONG A CLIENT'S PHOTOS STAY ONLINE
// ─────────────────────────────────────────────────────────────────────────────
//
// Storage costs money per month, forever, for photographs almost everybody
// downloads in the first week. So a gallery is available for a fixed window and
// then cleared.
//
// The clock does NOT start when the files are uploaded. Alina uploads in
// batches — a competition might take three sittings — and a timer that began
// with the first file would quietly eat days before the gallery was even
// complete. She presses "start" on the client's folder when the upload is
// finished, and that is the moment recorded here.
//
//   retention/{uid}  { startedAt, expiresAt, days, deletedAt }
//
// WHY ITS OWN COLLECTION, and not a field on `users`. A user may write their
// own `users` document — that is how the name and cover image are saved — so an
// expiry stored there could be pushed into the future by the client whose
// photos it governs. This collection is admin-write, client-read: they can see
// the countdown, they cannot move it.
//
// DELETION is done by api/cleanup-expired-photos.js on a schedule, not by the
// browser. Nothing can be relied on to happen in a page nobody has open.

import { doc, getDoc, getDocs, collection, serverTimestamp, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";

export const RETENTION = "retention";

/** How long a gallery stays up once the photographer starts the clock. */
export const RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Firestore Timestamp | Date | null → Date | null, without throwing. */
export function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Whole days left before a gallery comes down.
 *
 * Rounds UP, so "1 day left" means the client still has today — telling
 * somebody they have 0 days left while the photos are in fact still there is
 * the kind of detail that produces a panicked phone call.
 * Negative once it has passed; null when no clock is running.
 */
export function daysLeft(expiresAt, now = Date.now()) {
  const end = toDate(expiresAt);
  if (!end) return null;
  return Math.ceil((end.getTime() - now) / DAY_MS);
}

export const hasExpired = (expiresAt, now = Date.now()) => {
  const end = toDate(expiresAt);
  return !!end && end.getTime() <= now;
};

/* ── Reading ────────────────────────────────────────────────────────────── */

/** The retention record for one client, or null when no clock has been started. */
export async function fetchRetention(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, RETENTION, uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

/** Every retention record. Admin only — used by the cleanup job's dry run. */
export async function fetchAllRetention() {
  const snap = await getDocs(collection(db, RETENTION));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

/* ── Writing (admin only — enforced in firestore.rules) ─────────────────── */

/**
 * Start (or restart) the clock for one client.
 *
 * `expiresAt` is computed here rather than at read time so the deadline is a
 * fact stored once, not something recalculated — and so changing
 * RETENTION_DAYS later cannot silently move a date a client has already been
 * told. `folder` is recorded because the cleanup job works on Storage folders
 * and must not have to guess which one belongs to this uid.
 */
export async function startRetention({ uid, folder, email, days = RETENTION_DAYS }) {
  if (!uid) throw new Error("startRetention needs a uid");
  const expires = new Date(Date.now() + days * DAY_MS);
  await setDoc(doc(db, RETENTION, uid), {
    startedAt: serverTimestamp(),
    expiresAt: expires,
    days,
    folder: folder || null,
    userEmail: email || null,
    deletedAt: null,
  });
  return expires;
}

/** Stop the clock — the gallery stays up until someone starts it again. */
export async function clearRetention(uid) {
  if (!uid) return;
  await deleteDoc(doc(db, RETENTION, uid));
}
