import { db } from "../firebase";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

// Every user's photos live in a Storage folder named after a sanitized version
// of their email (and sometimes their uid). The admin panel lists users by that
// folder name, so we tag each download record with all plausible folder keys —
// then the admin can look up a user's downloads by whichever folder they opened.
export function folderKeysFor({ email, uid } = {}) {
  const keys = new Set();
  if (email) {
    keys.add(email.replace(/[.#$[\]]/g, "_"));
    keys.add(email.toLowerCase().replace(/[.#$[\]]/g, "_"));
    keys.add(email);
    keys.add(email.toLowerCase());
  }
  if (uid) keys.add(uid);
  return Array.from(keys).filter(Boolean);
}

// Records a single download so the admin can later see what a user pulled.
export async function logDownload({ user, item, ownerEmail } = {}) {
  if (!user || !item) return;
  const email = ownerEmail || user.email || null;
  try {
    await addDoc(collection(db, "downloads"), {
      uid: user.uid,
      email,
      folderKeys: folderKeysFor({ email, uid: user.uid }),
      fileName: item.name || null,
      filePath: item.id || item.fullPath || null,
      url: item.url || null,
      isVideo: !!item.isVideo,
      at: serverTimestamp(),
    });
  } catch (e) {
    console.warn("Failed to log download:", e);
  }
}

// Returns every download recorded for a given Storage folder, newest first.
// Sorted client-side so no composite Firestore index is required.
export async function fetchDownloadsForFolder(folderName) {
  if (!folderName) return [];
  const q = query(
    collection(db, "downloads"),
    where("folderKeys", "array-contains", folderName)
  );
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0));
  return rows;
}
