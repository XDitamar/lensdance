// src/lib/galleryAccess.js
//
// ─────────────────────────────────────────────────────────────────────────────
// WHETHER A CLIENT MAY TAKE THEIR PHOTOS YET
// ─────────────────────────────────────────────────────────────────────────────
//
// A gallery goes up before the balance is paid — that is the point, the client
// sees exactly what they are buying. Until Alina releases it, the gallery is
// LOCKED: the originals are not offered, and what is displayed is a small,
// heavily compressed preview with her logo across it.
//
//   retention/{uid}  { …the 30-day clock…, unlocked: boolean, unlockedAt }
//
// LOCKED IS THE DEFAULT, and it is the default by absence: no document, or no
// field, means locked. A new client cannot be left open by someone forgetting
// to close something, which is the failure mode worth designing against — the
// opposite mistake costs a message asking Alina to press a button.
//
// ── WHY IT LIVES ON THE RETENTION DOCUMENT ─────────────────────────────────
// Not on `users`: clients write their own profile (name, cover image), so a
// flag stored there could be flipped by the person it restrains.
//
// Not in a collection of its own either, though that was the first shape. A
// new collection is refused by the default-deny rule until firestore.rules is
// published by hand — and the failure mode of an unpublished rule here is
// every gallery reading as locked with no way for Alina to open one. Riding
// along on `retention` means this works the moment it is deployed: that
// document is already admin-write and client-read, which is exactly the
// permission this needs, and it is already about one client's gallery
// lifecycle.
//
// The price is that retention.js must stop treating that document as solely
// its own — startRetention merges instead of overwriting, clearRetention
// blanks the clock fields instead of deleting the record, and fetchRetention
// reports "no clock" when there is no expiry. All three are marked there.
//
// ── WHAT THIS IS AND IS NOT ────────────────────────────────────────────────
// This governs what the site offers. It is not DRM: a download URL that has
// been handed out stays fetchable, and no website can stop a screenshot — see
// the note in MePage about why the preview itself is degraded rather than the
// screen "protected". The lock is there so the ordinary path — open the
// gallery, press download — gives nothing usable until the work is paid for.

import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";

/** Same document as the retention clock — see the note above. */
export const GALLERY_ACCESS = "retention";

/**
 * Is this client's gallery released?
 *
 * A failed read answers `false`. Refusing to guess "open" on a permission
 * error or a network blip keeps the safe answer the default one.
 */
export async function isUnlocked(uid) {
  if (!uid) return false;
  try {
    const snap = await getDoc(doc(db, GALLERY_ACCESS, uid));
    return snap.exists() ? snap.data().unlocked === true : false;
  } catch (err) {
    console.warn("Could not read gallery access:", err?.code || err);
    return false;
  }
}

/** Release or re-lock one client's gallery. Admin only (firestore.rules). */
export async function setUnlocked(uid, unlocked) {
  if (!uid) throw new Error("setUnlocked needs a uid");
  await setDoc(
    doc(db, GALLERY_ACCESS, uid),
    { unlocked: !!unlocked, unlockedAt: serverTimestamp() },
    { merge: true }
  );
}
