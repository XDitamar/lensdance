// scripts/whitelist.cjs
//
// The single source of truth for "which accounts survive a purge", shared by
// audit-users.cjs and purge-users.cjs so the two can never disagree about who
// is protected.
//
// Anything not on this list is treated as disposable by purge-users.cjs.
// Add an address here BEFORE running the purge, not after.

const WHITELIST = [
  "lensdance29@gmail.com",   // Alina — the admin account
  "test2@gmail.com",
  "danonitamar2006@gmail.com",
  "claude@gmail.com",
  "test@gmail.com",
];

/**
 * Storage folders that belong to the site itself rather than to a client, and
 * must survive regardless of the whitelist. Deleting these empties the public
 * gallery.
 */
const RESERVED_FOLDERS = ["MainGallery", "public", "mediaGallery"];

/**
 * Firestore collections that hold site configuration rather than per-user data.
 * Documents here have no owner, so ownership can't be judged — never touched.
 */
const RESERVED_COLLECTIONS = ["settings", "mediaGallery"];

const normalise = (email) => String(email || "").trim().toLowerCase();

const WHITELIST_SET = new Set(WHITELIST.map(normalise));

const isWhitelisted = (email) => WHITELIST_SET.has(normalise(email));

/**
 * The Storage folder name the app derives from an email — see folderKeysFor()
 * in src/lib/downloads.js. Kept identical here on purpose: if the app's
 * sanitising ever changes, this must change with it or the purge will delete a
 * protected user's folder.
 */
const folderKeyFor = (email) => normalise(email).replace(/[.#$[\]]/g, "_");

module.exports = {
  WHITELIST,
  WHITELIST_SET,
  RESERVED_FOLDERS,
  RESERVED_COLLECTIONS,
  normalise,
  isWhitelisted,
  folderKeyFor,
};
