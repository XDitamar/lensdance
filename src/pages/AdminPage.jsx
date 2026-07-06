// src/pages/AdminPage.jsx
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { auth, storage, db } from "../firebase";
import {
  ref,
  listAll,
  getDownloadURL,
  uploadBytesResumable,
  deleteObject,
  updateMetadata,
} from "firebase/storage";
import { collection, getDocs } from "firebase/firestore";
import { folderKeysFor, fetchDownloadsForFolder } from "../lib/downloads";
import "../style.css";

const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL || "lensdance29@gmail.com";

/* ---------------- helpers: filenames & metadata ---------------- */

function guessExtFromMime(mime = "") {
  const m = mime.toLowerCase();
  if (m.includes("jpeg")) return "jpg";
  if (m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("gif")) return "gif";
  if (m.includes("webp")) return "webp";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("quicktime")) return "mov";
  if (m.includes("mov")) return "mov";
  if (m.includes("mkv")) return "mkv";
  if (m.includes("avi")) return "avi";
  return "bin";
}

function sanitizeFilename(name, fallbackMime) {
  const hasExt = /\.[A-Za-z0-9]{2,5}$/.test(name);
  const ext = hasExt ? name.split(".").pop() : guessExtFromMime(fallbackMime);
  const base = (hasExt ? name.slice(0, -(ext.length + 1)) : name)
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[\u0000-\u001f]/g, ""); // eslint-disable-line no-control-regex
  return `${base || "file"}.${ext}`;
}

function downloadableMetadata(filename, mime) {
  const safeName = String(filename).replace(/"/g, "");
  return {
    contentType: mime || "application/octet-stream",
    cacheControl: "public, max-age=3600",
    contentDisposition: `attachment; filename="${safeName}"`,
  };
}

/* ---------------------------------------------------------------- */

export default function AdminPage() {
  const [allFolders, setAllFolders] = useState([]); // שומר את כל התיקיות מהשרת
  const [userFolders, setUserFolders] = useState([]); // התיקיות שמוצגות בפועל (אחרי סינון)
  const [currentFolder, setCurrentFolder] = useState(null);
  const [mediaItems, setMediaItems] = useState([]);
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState({});
  const [uploadErrors, setUploadErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [users, setUsers] = useState([]); // Firestore user profiles (name, email, uid…)
  const [downloads, setDownloads] = useState([]);
  const [downloadsLoading, setDownloadsLoading] = useState(false);
  const inputRef = useRef(null);

  const user = auth.currentUser;
  const isAdmin = !!user && user.email === ADMIN_EMAIL;

  // Match a Storage folder name to its Firestore user profile
  const userForFolder = (folder) =>
    users.find((u) => folderKeysFor({ email: u.email, uid: u.uid }).includes(folder));

  // --- Fetch User Folders from Storage (With Debug Logs) ---
  const fetchUserFolders = async () => {
    try {
      setError("");
      setBusy(true);
      console.log("Starting to fetch folders from root...");

      const listRef = ref(storage, "/");
      const res = await listAll(listRef);

      console.log("Raw Response from Firebase:", res);
      console.log("Prefixes (Folders) found:", res.prefixes.length);
      console.log("Items (Files) found at root:", res.items.length);

      // חילוץ שמות התיקיות (Prefixes)
      const folders = res.prefixes.map((folderRef) => folderRef.name);
      
      // חילוץ קבצים שאולי נמצאים בשורש בטעות במקום בתוך תיקייה
      const filesAtRootAsFolders = res.items.map(item => item.name);
      
      // איחוד כדי לראות את כל מה שקיים בשורש (ללא כפילויות)
      const allDetectedUsers = Array.from(new Set([...folders, ...filesAtRootAsFolders]));

      console.log("Final processed folder list:", allDetectedUsers);

      setAllFolders(allDetectedUsers);
      setUserFolders(allDetectedUsers);

      if (allDetectedUsers.length === 0) {
        console.warn("No folders or files found at root.");
      }

    } catch (e) {
      console.error("Error fetching folders:", e);
      setError("Failed to load user folders. Check console for details.");
    } finally {
      setBusy(false);
    }
  };

  // --- Fetch Media from a Specific Folder (מדלגים על .placeholder) ---
  const fetchMediaInFolder = async (folderName) => {
    try {
      setBusy(true);
      setError("");
      const folderRef = ref(storage, folderName);
      const res = await listAll(folderRef);

      const mediaPromises = res.items.map(async (itemRef) => {
        if (itemRef.name === ".placeholder") return null;

        const url = await getDownloadURL(itemRef);
        return {
          id: itemRef.fullPath,
          url,
          type: itemRef.name.split(".").pop(),
          name: itemRef.name,
        };
      });

      const mediaData = (await Promise.all(mediaPromises)).filter(Boolean);
      setMediaItems(mediaData);
      setBusy(false);
    } catch (e) {
      console.error(e);
      setError("Failed to load media for this folder.");
      setBusy(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUserFolders();
    }
  }, [isAdmin]);

  // Load Firestore user profiles so folders can show real full names
  useEffect(() => {
    if (!isAdmin) return;
    getDocs(collection(db, "users"))
      .then((snap) => setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))))
      .catch((e) => console.warn("Could not load user profiles:", e));
  }, [isAdmin]);

  // Open a user folder: load its media AND that user's download history
  const openFolder = async (folder) => {
    setCurrentFolder(folder);
    fetchMediaInFolder(folder);
    setDownloads([]);
    setDownloadsLoading(true);
    try {
      setDownloads(await fetchDownloadsForFolder(folder));
    } catch (e) {
      console.warn("Could not load downloads:", e);
    } finally {
      setDownloadsLoading(false);
    }
  };

  // --- Live Search Effect (matches full name, email, or folder) ---
  useEffect(() => {
    const term = searchTerm.trim().toLowerCase();
    if (term === "") {
      setUserFolders(allFolders);
      return;
    }
    const filtered = allFolders.filter((folder) => {
      const u = userForFolder(folder);
      const haystack = [folder, u?.name, u?.email, u?.username]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
    setUserFolders(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, allFolders, users]);

  // --- Multi-file upload ---
  const onPickFiles = (e) => {
    const selected = Array.from(e.target.files || []);
    setFiles(selected);
    setProgress({});
    setUploadErrors({});
  };

  const uploadAll = async () => {
    if (!files.length || !currentFolder) return;

    try {
      setBusy(true);
      setError("");
      setProgress({});
      setUploadErrors({});

      for (const f of files) {
        const safeName = sanitizeFilename(f.name, f.type);
        const fileRef = ref(storage, `${currentFolder}/${safeName}`);
        const meta = downloadableMetadata(safeName, f.type);

        const task = uploadBytesResumable(fileRef, f, meta);

        await new Promise((resolve) => {
          task.on(
            "state_changed",
            (snap) => {
              const pct = Math.round(
                (snap.bytesTransferred / snap.totalBytes) * 100
              );
              setProgress((prev) => ({ ...prev, [f.name]: pct }));
            },
            (err) => {
              console.error("Upload failed for", f.name, err);
              setUploadErrors((prev) => ({ ...prev, [f.name]: err.message }));
              resolve();
            },
            () => {
              resolve();
            }
          );
        });
      }

      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      await fetchMediaInFolder(currentFolder);

      if (Object.keys(uploadErrors).length > 0) {
        setError("Some files failed to upload. See list below.");
      }
    } catch (e) {
      console.error(e);
      setError("Upload failed.");
      alert("Upload failed: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  // --- Force attachment metadata for existing files ---
  const forceAttachmentForExisting = async () => {
    if (!currentFolder || !mediaItems.length) return;
    if (!window.confirm("Update all files in this folder to be downloadable?")) return;

    try {
      setBusy(true);
      for (const it of mediaItems) {
        const fileRef = ref(storage, it.id);
        const safeName = sanitizeFilename(it.name || it.id.split("/").pop(), "");
        const meta = downloadableMetadata(
          safeName,
          `image/${(it.type || "jpeg").toLowerCase()}`
        );
        await updateMetadata(fileRef, meta).catch((err) => {
          console.warn("updateMetadata failed for", it.id, err);
        });
      }
      await fetchMediaInFolder(currentFolder);
      alert("Updated metadata. New uploads will already be downloadable.");
    } catch (e) {
      console.error(e);
      alert("Failed to update existing files: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  // --- Delete single item (placeholder לא מגיע לפה בכלל) ---
  const del = async (fullPath) => {
    if (!window.confirm("Delete this item?")) return;

    try {
      setBusy(true);
      setError("");

      const fileRef = ref(storage, fullPath);
      await deleteObject(fileRef);

      await fetchMediaInFolder(currentFolder);
    } catch (e) {
      console.error(e);
      setError("Delete failed.");
      alert("Delete failed: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  // --- Delete all items in current folder (לא מוחק placeholder) ---
  const deleteAllInCurrentFolder = async () => {
    if (!currentFolder || !mediaItems.length) return;

    const ok = window.confirm(
      "האם אתה בטוח שברצונך למחוק את כל המדיה בתיקייה הזו?\nהפעולה בלתי הפיכה."
    );
    if (!ok) return;

    try {
      setBusy(true);
      setError("");

      const itemsToDelete = mediaItems.filter((it) => it.name !== ".placeholder");

      for (const item of itemsToDelete) {
        try {
          const fileRef = ref(storage, item.id);
          await deleteObject(fileRef);
        } catch (e) {
          console.error("Failed to delete", item.id, e);
        }
      }

      await fetchMediaInFolder(currentFolder);
    } catch (e) {
      console.error(e);
      setError("Delete all failed.");
      alert("Delete all failed: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  // --- UI ---
  if (!user) {
    return (
      <main className="container" style={{ textAlign: "center" }}>
        <h2 className="section-title">Admin Panel</h2>
        <p>You’re not logged in.</p>
        <Link className="auth-primary" to="/login">
          Log in
        </Link>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="container" style={{ textAlign: "center" }}>
        <h2 className="section-title">Admin Panel</h2>
        <p>Not authorized</p>
      </main>
    );
  }

  return (
    <main className="container">
      <h2 className="section-title">Admin Panel</h2>
      
      {/* Search Bar */}
      <div style={{ marginBottom: "20px", display: "flex", gap: "10px" }}>
        <input
          type="text"
          placeholder="חיפוש לפי שם מלא / אימייל..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: "10px",
            borderRadius: "5px",
            border: "1px solid #ccc",
            flex: 1
          }}
        />
        {searchTerm && (
          <button 
            className="filter-button" 
            onClick={() => setSearchTerm("")}
            style={{ margin: 0 }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Folder Selection */}
      {!currentFolder ? (
        <div>
          <h3 style={{ marginBottom: "15px" }}>Select a User Gallery:</h3>
          {busy ? (
             <p>Loading users...</p>
          ) : (
            <div className="gallery-grid">
              {userFolders.map((folder) => {
                const u = userForFolder(folder);
                return (
                  <button
                    key={folder}
                    className="filter-button"
                    onClick={() => openFolder(folder)}
                    style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "center" }}
                  >
                    <span style={{ fontWeight: 700 }}>{u?.name || folder}</span>
                    {u?.name && (
                      <span style={{ fontSize: 10, opacity: 0.6, direction: "ltr" }}>{folder}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {userFolders.length === 0 && !busy && !error && (
            <p>No user galleries found.</p>
          )}
          {error && <div className="auth-error">{error}</div>}
        </div>
      ) : (
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0 }}>{userForFolder(currentFolder)?.name || currentFolder}</h3>
              <span style={{ fontSize: 12, color: "#888", direction: "ltr", display: "block" }}>
                {userForFolder(currentFolder)?.email || currentFolder}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {userForFolder(currentFolder)?.uid && (
                <Link className="filter-button" to={`/me?uid=${userForFolder(currentFolder).uid}`}>
                  פתח גלריה אישית
                </Link>
              )}
              <button className="filter-button" onClick={() => { setCurrentFolder(null); setDownloads([]); }}>
                Back to users
              </button>
            </div>
          </div>

          {/* ── Download history for this user ── */}
          <div style={{ marginBottom: 16, border: "1px solid #E2D9CE", borderRadius: 8, background: "#FDFAF5" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #EDE8DF", fontWeight: 700, fontSize: 14 }}>
              📥 תמונות שהמשתמש הוריד {downloadsLoading ? "" : `(${downloads.length})`}
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto", padding: "6px 14px" }}>
              {downloadsLoading ? (
                <p style={{ color: "#888", fontSize: 13 }}>טוען היסטוריית הורדות…</p>
              ) : downloads.length === 0 ? (
                <p style={{ color: "#888", fontSize: 13 }}>המשתמש עדיין לא הוריד תמונות.</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {downloads.map((d) => (
                    <li key={d.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: "1px solid #F0EBE2", fontSize: 13 }}>
                      <span style={{ direction: "ltr", wordBreak: "break-all" }}>
                        {d.isVideo ? "🎬 " : "🖼️ "}
                        {d.url ? (
                          <a href={d.url} target="_blank" rel="noreferrer" style={{ color: "#4A3525" }}>
                            {d.fileName || d.filePath || "קובץ"}
                          </a>
                        ) : (
                          d.fileName || d.filePath || "קובץ"
                        )}
                      </span>
                      <span style={{ color: "#999", whiteSpace: "nowrap" }}>
                        {d.at?.seconds ? new Date(d.at.seconds * 1000).toLocaleString("he-IL") : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
            <input ref={inputRef} type="file" multiple onChange={onPickFiles} />
            <button className="filter-button" onClick={uploadAll} disabled={busy || !files.length}>
              Upload
            </button>
            <button className="filter-button" onClick={forceAttachmentForExisting} disabled={busy || !mediaItems.length}>
              Make all downloadable
            </button>
            <button className="filter-button" onClick={deleteAllInCurrentFolder} disabled={busy || !mediaItems.length}>
              Delete all
            </button>
          </div>

          {!!files.length && (
            <ul style={{ marginBottom: "12px" }}>
              {files.map((f) => (
                <li key={f.name}>
                  {f.name} {progress[f.name] != null ? `- ${progress[f.name]}%` : ""}
                  {uploadErrors[f.name] ? ` (Error: ${uploadErrors[f.name]})` : ""}
                </li>
              ))}
            </ul>
          )}

          {busy && <p>Loading media...</p>}

          <div className="gallery-grid">
            {mediaItems.map((item) => (
              <div key={item.id} className="gallery-item">
                {/[.]?(jpg|jpeg|png|gif|webp)$/i.test(item.name) ? (
                  <img src={item.url} alt={item.name} style={{ width: "100%", borderRadius: "8px" }} />
                ) : (
                  <video src={item.url} controls style={{ width: "100%", borderRadius: "8px" }} />
                )}
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <a className="filter-button" href={item.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                  <button className="filter-button" onClick={() => del(item.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {!mediaItems.length && !busy && <p>No media in this folder.</p>}
        </section>
      )}
    </main>
  );
}