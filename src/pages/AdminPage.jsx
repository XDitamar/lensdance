// src/pages/AdminPage.jsx
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { auth, storage } from "../firebase";
import {
  ref,
  listAll,
  getDownloadURL,
  uploadBytesResumable,
  deleteObject,
  updateMetadata,
} from "firebase/storage";
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
    .replace(/[\/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[\u0000-\u001F]/g, "");
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
  const [userFolders, setUserFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [mediaItems, setMediaItems] = useState([]);

  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState({});
  const [uploadErrors, setUploadErrors] = useState({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const user = auth.currentUser;
  const isAdmin = !!user && user.email === ADMIN_EMAIL;

  // --- Fetch User Folders from Storage ---
  const fetchUserFolders = async () => {
    try {
      setError("");
      const listRef = ref(storage, "/");
      const res = await listAll(listRef);
      const folders = res.prefixes.map((folderRef) => folderRef.name);
      setUserFolders(folders);
    } catch (e) {
      console.error(e);
      setError("Failed to load user folders.");
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
        // לא טוענים לפה את ה-placeholder בכלל
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

      // מדלגים על כל קובץ ששמו .placeholder (ליתר ביטחון, למרות שהוא לא ב-mediaItems)
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

      {/* Folder Selection */}
      {!currentFolder ? (
        <div>
          <h3 style={{ marginBottom: "15px" }}>Select a User Gallery:</h3>
          <div className="gallery-grid">
            {userFolders.map((folder) => (
              <button
                key={folder}
                className="filter-button"
                onClick={() => {
                  setCurrentFolder(folder);
                  fetchMediaInFolder(folder);
                }}
              >
                {folder}
              </button>
            ))}
          </div>
          {userFolders.length === 0 && !busy && !error && (
            <p>No user galleries found.</p>
          )}
          {error && <div className="auth-error">{error}</div>}
        </div>
      ) : (
        <div>
          <h3 style={{ marginBottom: "10px" }}>
            Viewing: <span style={{ color: "var(--brown-600)" }}>{currentFolder}</span>
          </h3>
          <button
            className="filter-button"
            onClick={() => {
              setCurrentFolder(null);
              setMediaItems([]);
              fetchUserFolders();
            }}
          >
            Back to Folders
          </button>

          {/* Upload & actions card */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #e9e9e9",
              borderRadius: 12,
              padding: 16,
              marginBottom: 20,
              marginTop: 20,
              boxShadow: "0 4px 12px rgba(0,0,0,.06)",
            }}
          >
            <div
              style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={onPickFiles}
              />
              <button className="auth-primary" onClick={uploadAll} disabled={!files.length || busy}>
                {busy
                  ? "Uploading..."
                  : files.length
                  ? `Upload ${files.length} file${files.length > 1 ? "s" : ""}`
                  : "Upload"}
              </button>
              {!!files.length && (
                <button
                  className="filter-button"
                  onClick={() => {
                    setFiles([]);
                    setProgress({});
                    setUploadErrors({});
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                  disabled={busy}
                >
                  Clear selection
                </button>
              )}

              {mediaItems.length > 0 && (
                <>
                  <button
                    className="filter-button"
                    onClick={forceAttachmentForExisting}
                    disabled={busy}
                    title="Update existing files so browsers will download them instead of previewing"
                  >
                    Fix existing files (force download)
                  </button>

                  {/* Delete all media in this folder (בלי placeholder) */}
                  <button
                    className="filter-button"
                    onClick={deleteAllInCurrentFolder}
                    disabled={busy}
                    style={{ backgroundColor: "#b31010", color: "#fff" }}
                    title="Delete all media files in this gallery (folder + placeholder stay)"
                  >
                    Delete all
                  </button>
                </>
              )}
            </div>

            {!!files.length && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: ".95rem", color: "#555", marginBottom: 8 }}>
                  Selected: <strong>{files.length}</strong> file
                  {files.length > 1 ? "s" : ""}
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {files.map((f) => (
                    <li
                      key={f.name + f.lastModified}
                      style={{ padding: "6px 0", borderTop: "1px solid #eee" }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ fontSize: ".9rem" }}>
                          <strong>{f.name}</strong> ({Math.round(f.size / 1024)} KB)
                        </span>
                        {typeof progress[f.name] === "number" && (
                          <div
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={progress[f.name]}
                            style={{
                              flex: 1,
                              height: 8,
                              background: "#f1f1f1",
                              borderRadius: 999,
                              overflow: "hidden",
                              minWidth: 120,
                            }}
                          >
                            <div
                              style={{
                                width: `${progress[f.name]}%`,
                                height: "100%",
                                background: "var(--brown-600)",
                              }}
                            />
                          </div>
                        )}
                        {uploadErrors[f.name] && (
                          <span className="auth-error" style={{ marginLeft: 8 }}>
                            {uploadErrors[f.name]}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {error && (
                  <div className="auth-error" style={{ marginTop: 10 }}>
                    {error}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Gallery */}
          <div className="gallery-grid">
            {mediaItems.map((m) => (
              <div key={m.id} className="gallery-item">
                {/(mp4|mov|avi|mkv)$/i.test(m.type || "") ? (
                  <video controls src={m.url} className="gallery-item-media" />
                ) : (
                  <img src={m.url} alt="admin media" className="gallery-item-media" />
                )}
                <button
                  className="auth-primary"
                  style={{ marginTop: 10 }}
                  onClick={() => del(m.id)}
                  disabled={busy}
                >
                  {busy ? "Working..." : "Delete"}
                </button>
              </div>
            ))}
          </div>
          {mediaItems.length === 0 && (
            <p style={{ marginTop: 20, color: "#666" }}>No media in this gallery.</p>
          )}
        </div>
      )}
    </main>
  );
}
