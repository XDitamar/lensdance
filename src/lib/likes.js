// src/lib/likes.js
//
// ─────────────────────────────────────────────────────────────────────────────
// PHOTO LIKES — the client marks favourites, the photographer sees them
// ─────────────────────────────────────────────────────────────────────────────
//
// A rider goes through their gallery and hearts the shots they love. Alina then
// opens their profile on /admin and sees exactly which ones — which is the
// difference between guessing what to print, retouch further or post, and
// knowing.
//
//   photoLikes/{uid__path}  { userId, userEmail, path, name, likedAt }
//
// THE DOCUMENT ID IS DERIVED, NOT RANDOM. It is the user's uid plus the photo's
// Storage path, so liking is a plain setDoc and unliking a plain deleteDoc —
// no read-then-write, no chance of two documents for the same photo if someone
// double-taps, and the same result whichever device they use.
//
// Storage paths contain "/" which a Firestore document id may not, so the
// separator is swapped for "|". That is reversible, but nothing needs to
// reverse it: the path is also stored as a field, which is what everything
// reads.
//
// PRIVACY. A like is visible to the person who made it and to the admin, and
// to nobody else — see firestore.rules. Riders are marking pictures of
// themselves; that list should not leak sideways.

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

export const PHOTO_LIKES = "photoLikes";

/**
 * uid + Storage path → a stable document id.
 *
 * Firestore ids may not contain "/" and are capped at 1500 bytes. Paths here
 * are short (a folder and a filename), but the slice is a cheap guard against
 * a pathological name rather than a silent write failure later.
 */
export function likeId(uid, path) {
  return `${uid}__${String(path || "").replace(/\//g, "|")}`.slice(0, 1400);
}

/** Every path this user has liked, as a Set for O(1) lookups while rendering. */
export async function fetchLikedPaths(uid) {
  if (!uid) return new Set();
  const snap = await getDocs(query(collection(db, PHOTO_LIKES), where("userId", "==", uid)));
  return new Set(snap.docs.map((d) => d.data().path).filter(Boolean));
}

/**
 * Admin view: everything one user has liked, newest first.
 * Returns the documents rather than just paths, because the admin list shows
 * the file name and when it was liked.
 */
export async function fetchLikesForUser(uid) {
  if (!uid) return [];
  const snap = await getDocs(query(collection(db, PHOTO_LIKES), where("userId", "==", uid)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.likedAt?.seconds || 0) - (a.likedAt?.seconds || 0));
}

/**
 * Turn a like on or off. `next` is the state you want, so the caller can flip
 * its own UI first and call this with the result — no guessing what the
 * server currently thinks.
 */
export async function setLiked({ uid, email, path, name, next }) {
  const ref = doc(db, PHOTO_LIKES, likeId(uid, path));
  if (!next) return deleteDoc(ref);
  return setDoc(ref, {
    userId: uid,
    userEmail: email || null,
    path,
    name: name || path.split("/").pop() || "",
    likedAt: serverTimestamp(),
  });
}
