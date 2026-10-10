// src/lib/albums.js
//
// Which competition a photo belongs to.
//
// Storage has no folders — a path is just a string — so a file written to
// "noa@gmail_com/דירוג גביע 1 · חוות אייל/IMG_01.jpg" is tagged by the one
// thing every listing already returns: its own path. No metadata to fetch per
// file, nothing to keep in step in Firestore, and it is readable in the
// Firebase console too.
//
// A client who has been photographed three times gets three headings instead
// of one wall of two hundred pictures, and Alina stops having to remember
// which upload went with which weekend.
//
// Files uploaded before this existed sit directly in the client's folder and
// have no album. That is a state, not a bug: they show up under "all the
// rest", exactly as they always did.

/** Characters Storage dislikes in a path segment, plus the ones that confuse people. */
const UNSAFE = /[/\\#?[\]*<>:"|]+/g;

/**
 * A competition label → a folder name.
 * Kept readable rather than slugged: this name is what the client sees as a
 * heading and what Alina sees in the Firebase console, and "דירוג גביע 1"
 * beats "dirug-gavia-1" in both places.
 */
export function albumName(label) {
  return String(label || "")
    .replace(UNSAFE, " ")
    .replace(/\s+/g, " ")
    .trim()
    // A trailing dot makes a path segment that some tools silently drop.
    .replace(/\.+$/, "")
    .slice(0, 80);
}

/**
 * The album a file is in, given the client folder it was listed under.
 * "" when the file sits directly in the client's folder.
 */
export function albumOf(fullPath, rootFolder) {
  if (!fullPath || !rootFolder) return "";
  const prefix = `${rootFolder.replace(/\/+$/, "")}/`;
  if (!fullPath.startsWith(prefix)) return "";
  const rest = fullPath.slice(prefix.length);
  const cut = rest.lastIndexOf("/");
  return cut === -1 ? "" : rest.slice(0, cut);
}

/**
 * Group media items by album, in the order the albums first appear.
 * Returns [{ album, items }], with the unfiled ones last — they are the
 * oldest, and the newest work is what somebody opens the page to see.
 */
export function groupByAlbum(items, rootFolder) {
  const groups = new Map();
  for (const item of items || []) {
    const album = albumOf(item.id || item.fullPath, rootFolder);
    if (!groups.has(album)) groups.set(album, []);
    groups.get(album).push(item);
  }
  const out = [...groups.entries()].map(([album, list]) => ({ album, items: list }));
  out.sort((a, b) => (a.album ? 0 : 1) - (b.album ? 0 : 1));
  return out;
}
