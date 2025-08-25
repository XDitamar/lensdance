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
} from "firebase/storage";
import "../style.css";

const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL || "lensdance29@gmail.com";

export default function AdminPage() {
  const [userFolders, setUserFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [mediaItems, setMediaItems] = useState([]);

  // NEW: multi-file selection + per-file progress/errors
  const [files, setFiles] = useState([]); // File[]
  const [progress, setProgress] = useState({}); // { [fileName]: number }
  const [uploadErrors, setUploadErrors] = useState({}); // { [fileName]: string }

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

  // --- Fetch Media from a Specific Folder ---
  const fetchMediaInFolder = async (folderName) => {
    try {
      setBusy(true);
      setError("");
      const folderRef = ref(storage, folderName);
      const res = await listAll(folderRef);

      const mediaPromises = res.items.map(async (itemRef) => {
        const url = await getDownloadURL(itemRef);
        return {
          id: itemRef.fullPath,
          url,
          type: itemRef.name.split(".").pop(),
        };
      });

      const mediaData = await Promise.all(mediaPromises);
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

  // --- Multi-file upload (desktop + mobile) ---
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

      // Upload sequentially so progress updates are clear and we don't spike bandwidth/memory on mobile.
      for (const f of files) {
        const fileRef = ref(storage, `${currentFolder}/${f.name}`);
        const task = uploadBytesResumable(fileRef, f);

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
              // continue with the rest
              resolve();
            },
            () => {
              resolve();
            }
          );
        });
      }

      // Clear selection and refresh gallery
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      await fetchMediaInFolder(currentFolder);

      // If any errors happened, surface a friendly message
      const hadErrors = Object.keys(uploadErrors).length > 0;
      if (hadErrors) {
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

          {/* Upload card */}
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
                // Tip: if you want the camera by default on mobile, add: capture="environment"
              />
              <button className="auth-primary" onClick={uploadAll} disabled={!files.length || busy}>
                {busy ? "Uploading..." : files.length ? `Upload ${files.length} file${
                  files.length > 1 ? "s" : ""
                }` : "Upload"}
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
            </div>

            {!!files.length && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: ".95rem", color: "#555", marginBottom: 8 }}>
                  Selected: <strong>{files.length}</strong> file{files.length > 1 ? "s" : ""}
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {files.map((f) => (
                    <li
                      key={f.name + f.lastModified}
                      style={{
                        padding: "6px 0",
                        borderTop: "1px solid #eee",
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
                {m.type.match(/(mp4|mov|avi|mkv)$/i) ? (
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
