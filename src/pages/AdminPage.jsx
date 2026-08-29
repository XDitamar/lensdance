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
import { fetchLikesForUser } from "../lib/likes";
import { useTranslation } from "react-i18next";
import { DISCIPLINES, disciplineKey } from "../constants";
import "../style.css";

const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL || "lensdance29@gmail.com";

/* Riding discipline (`users/{uid}.discipline`, set from /change-discipline).
   Profiles created before the field existed simply have none. */
const NO_DISCIPLINE = "__none__";

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
  const { t, i18n } = useTranslation();
  const disciplineLabel = (id) => t(disciplineKey(id));
  const [searchTerm, setSearchTerm] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState(""); // "" = all
  const [sortBy, setSortBy] = useState("name"); // "name" | "discipline"
  const [users, setUsers] = useState([]); // Firestore user profiles (name, email, uid…)
  const [downloads, setDownloads] = useState([]);
  const [downloadsLoading, setDownloadsLoading] = useState(false);
  /* The photos this client hearted in their own gallery. The visual version —
     hearts drawn on the pictures themselves — is on /me?uid=…, linked from the
     button above; this list is the quick read: what they loved, and when. */
  const [likes, setLikes] = useState([]);
  const [likesLoading, setLikesLoading] = useState(false);
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

      /* Thumbnails, not originals.
         This grid used to point every <img> at the full-resolution download
         URL. A folder of thirty 8 MB photographs then decoded a couple of
         hundred megabytes of bitmap at once — Chrome survives it, Safari kills
         the tab, and a killed tab looks exactly like a blank white page with
         the whole app gone. /me has always resized through /api/image; this
         page simply never did.
         The original stays on `url` for Open and Delete, which need the real
         file. Only what is painted is shrunk. */
      const isProduction =
        window.location.hostname !== "localhost" &&
        !window.location.hostname.startsWith("127.");

      const mediaPromises = res.items.map(async (itemRef) => {
        if (itemRef.name === ".placeholder") return null;

        const url = await getDownloadURL(itemRef);
        const type = itemRef.name.split(".").pop();
        const isVid = /^(mp4|mov|avi|webm|mkv|m4v)$/i.test(type || "");
        const thumbUrl = !isVid && isProduction
          ? `/api/image?url=${encodeURIComponent(url)}&w=480&q=70`
          : url;

        return {
          id: itemRef.fullPath,
          url,
          thumbUrl,
          isVideo: isVid,
          type,
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
    setLikes([]);
    setDownloadsLoading(true);
    try {
      setDownloads(await fetchDownloadsForFolder(folder));
    } catch (e) {
      console.warn("Could not load downloads:", e);
    } finally {
      setDownloadsLoading(false);
    }

    /* Likes are keyed by uid, not by folder name — a folder is derived from an
       email and several spellings map to the same person, whereas the uid is
       the account itself. An account-less folder simply has no likes to show. */
    const uid = userForFolder(folder)?.uid;
    if (!uid) return;
    setLikesLoading(true);
    try {
      setLikes(await fetchLikesForUser(uid));
    } catch (e) {
      console.warn("Could not load likes:", e);
    } finally {
      setLikesLoading(false);
    }
  };

  // --- Live search + discipline filter + sort ---
  // Matches full name, email or folder; then narrows to one riding discipline
  // and orders the result. Runs on every keystroke over an in-memory list, so
  // there's no need to debounce it.
  useEffect(() => {
    const term = searchTerm.trim().toLowerCase();

    let list = allFolders;

    if (term !== "") {
      list = list.filter((folder) => {
        const u = userForFolder(folder);
        const haystack = [folder, u?.name, u?.email, u?.username, disciplineLabel(u?.discipline)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      });
    }

    if (disciplineFilter) {
      list = list.filter((folder) => {
        const d = userForFolder(folder)?.discipline;
        // The "no category yet" bucket has to be selectable too, otherwise
        // older profiles are invisible whenever a filter is on.
        return disciplineFilter === NO_DISCIPLINE ? !d : d === disciplineFilter;
      });
    }

    const byName = (folder) =>
      (userForFolder(folder)?.name || folder || "").toLocaleLowerCase("he");

    const sorted = [...list].sort((a, b) => {
      if (sortBy === "discipline") {
        // Group by category, keeping the uncategorised users last, then sort
        // by name inside each group.
        const rank = (folder) => {
          const d = userForFolder(folder)?.discipline;
          const i = DISCIPLINES.findIndex((x) => x.id === d);
          return i === -1 ? DISCIPLINES.length : i;
        };
        const diff = rank(a) - rank(b);
        if (diff !== 0) return diff;
      }
      return byName(a).localeCompare(byName(b), "he");
    });

    setUserFolders(sorted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, disciplineFilter, sortBy, allFolders, users, t]);

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
      t("admin.confirmDeleteAll")
    );
    if (!ok) return;

    try {
      setBusy(true);
      setError("");

      const itemsToDelete = mediaItems.filter((it) => it.name !== ".placeholder");

      const failed = [];
      for (const item of itemsToDelete) {
        try {
          await deleteObject(ref(storage, item.id));
        } catch (e) {
          // "object-not-found" is not a failure: the goal is for the file to be
          // gone, and it already is. This shows up when the listing the page is
          // working from is older than the bucket.
          if (e?.code === "storage/object-not-found") continue;
          failed.push(item.name);
          console.error("Failed to delete", item.id, e);
        }
      }

      // Say so rather than silently leaving files behind — the grid refreshes
      // either way, so without this the leftovers just look like a glitch.
      if (failed.length) {
        setError(`${failed.length} file(s) could not be deleted: ${failed.join(", ")}`);
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
      
      {/* Search + riding-discipline filter + sort */}
      <div style={{ marginBottom: "20px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder={t("registrations.search")}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: "10px",
            borderRadius: "5px",
            border: "1px solid #ccc",
            flex: "1 1 220px",
            minWidth: 180,
          }}
        />

        <select
          value={disciplineFilter}
          onChange={(e) => setDisciplineFilter(e.target.value)}
          title={t("admin.filterByDiscipline")}
          style={{ padding: "10px", borderRadius: "5px", border: "1px solid #ccc" }}
        >
          <option value="">{t("registrations.allCategories")}</option>
          {DISCIPLINES.map((d) => (
            <option key={d.id} value={d.id}>{t(disciplineKey(d.id))}</option>
          ))}
          <option value={NO_DISCIPLINE}>{t("disciplines.none")}</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          title={t("admin.sort")}
          style={{ padding: "10px", borderRadius: "5px", border: "1px solid #ccc" }}
        >
          <option value="name">{t("admin.sortByName")}</option>
          <option value="discipline">{t("admin.sortByDiscipline")}</option>
        </select>

        {(searchTerm || disciplineFilter || sortBy !== "name") && (
          <button
            className="filter-button"
            onClick={() => { setSearchTerm(""); setDisciplineFilter(""); setSortBy("name"); }}
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
                    <span style={{ fontSize: 10, opacity: u?.discipline ? 0.85 : 0.4 }}>
                      {disciplineLabel(u?.discipline)}
                    </span>
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
                  {t("admin.openGallery")}
                </Link>
              )}
              <button className="filter-button" onClick={() => { setCurrentFolder(null); setDownloads([]); }}>
                Back to users
              </button>
            </div>
          </div>

          {/* ── Photos this client marked as favourites ──
              Shown as thumbnails, not a list of filenames. The point of this
              panel is reading someone's taste at a glance — which crops, which
              light, which moments they go for — and "DSC_8944.jpg" tells you
              none of that.
              The pictures come from `mediaItems`, already loaded for this
              folder, so nothing extra is fetched. A like whose file is no
              longer in the folder still shows, as a caption with no picture,
              rather than vanishing without explanation. */}
          <div style={{ marginBottom: 16, border: "1px solid #E2D9CE", borderRadius: 8, background: "#FDFAF5" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #EDE8DF", fontWeight: 700, fontSize: 14 }}>
              {t("admin.likes")} {likesLoading ? "" : `(${likes.length})`}
            </div>
            <div style={{ maxHeight: 300, overflowY: "auto", padding: "12px 14px" }}>
              {likesLoading ? (
                <p style={{ color: "#888", fontSize: 13 }}>{t("admin.likesLoading")}</p>
              ) : likes.length === 0 ? (
                <p style={{ color: "#888", fontSize: 13 }}>{t("admin.likesEmpty")}</p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {likes.map((l) => {
                    const media = mediaItems.find((m) => m.id === l.path);
                    const ext = (l.name || l.path || "").split(".").pop().toLowerCase();
                    const isVid = ["mp4", "mov", "webm", "m4v"].includes(ext);
                    const when = l.likedAt?.seconds
                      ? new Date(l.likedAt.seconds * 1000).toLocaleDateString(i18n.language)
                      : "";
                    return (
                      <a
                        key={l.id}
                        href={media?.url || undefined}
                        target="_blank"
                        rel="noreferrer"
                        title={`${l.name || l.path}${when ? ` · ${when}` : ""}`}
                        style={{
                          width: 118, textDecoration: "none", color: "#6A5A50",
                          cursor: media?.url ? "zoom-in" : "default",
                        }}
                      >
                        <div style={{
                          position: "relative", width: 118, height: 118,
                          background: "#EDE8DF", borderRadius: 6, overflow: "hidden",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {media?.url ? (
                            isVid ? (
                              <>
                                <video src={media.url} muted playsInline preload="metadata"
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                {/* preload="metadata" does not paint a frame, so a
                                    clip would otherwise be an unexplained grey
                                    square. The marker says "this is a video". */}
                                <span style={{
                                  position: "absolute", inset: 0, display: "flex",
                                  alignItems: "center", justifyContent: "center",
                                  color: "rgba(255,255,255,.9)", fontSize: 22,
                                  textShadow: "0 1px 4px rgba(0,0,0,.5)",
                                  background: "rgba(0,0,0,.18)", pointerEvents: "none",
                                }} aria-hidden="true">▶</span>
                              </>
                            ) : (
                              <img src={media.thumbUrl || media.url} alt={l.name || ""}
                                loading="lazy" decoding="async"
                                style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            )
                          ) : (
                            <span style={{ fontSize: 20, color: "#C4B7A6" }} aria-hidden="true">🖼</span>
                          )}
                          <span style={{
                            position: "absolute", top: 5, left: 5,
                            width: 20, height: 20, borderRadius: "50%",
                            background: "rgba(255,255,255,.92)", color: "#E2607A",
                            fontSize: 11, lineHeight: "20px", textAlign: "center",
                          }} aria-hidden="true">♥</span>
                        </div>
                        <div style={{
                          fontSize: 10, marginTop: 4, direction: "ltr",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {l.name || l.path}
                        </div>
                        {when && <div style={{ fontSize: 9, color: "#A89D90", direction: "ltr" }}>{when}</div>}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Download history for this user ── */}
          <div style={{ marginBottom: 16, border: "1px solid #E2D9CE", borderRadius: 8, background: "#FDFAF5" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #EDE8DF", fontWeight: 700, fontSize: 14 }}>
              {t("admin.downloads")} {downloadsLoading ? "" : `(${downloads.length})`}
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto", padding: "6px 14px" }}>
              {downloadsLoading ? (
                <p style={{ color: "#888", fontSize: 13 }}>{t("admin.downloadsLoading")}</p>
              ) : downloads.length === 0 ? (
                <p style={{ color: "#888", fontSize: 13 }}>{t("admin.downloadsEmpty")}</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {downloads.map((d) => (
                    <li key={d.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: "1px solid #F0EBE2", fontSize: 13 }}>
                      <span style={{ direction: "ltr", wordBreak: "break-all" }}>
                        {d.isVideo ? "🎬 " : "🖼️ "}
                        {d.url ? (
                          <a href={d.url} target="_blank" rel="noreferrer" style={{ color: "#4A3525" }}>
                            {d.fileName || d.filePath || t("admin.file")}
                          </a>
                        ) : (
                          d.fileName || d.filePath || t("admin.file")
                        )}
                      </span>
                      <span style={{ color: "#999", whiteSpace: "nowrap" }}>
                        {d.at?.seconds ? new Date(d.at.seconds * 1000).toLocaleString(i18n.language) : ""}
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
                  /* thumbUrl, lazy, async: only what is actually on screen gets
                     downloaded and decoded. With originals and eager loading a
                     large folder could exhaust the tab's memory — see the note
                     in fetchMediaInFolder. */
                  <img
                    src={item.thumbUrl || item.url}
                    alt={item.name}
                    loading="lazy"
                    decoding="async"
                    style={{ width: "100%", borderRadius: "8px" }}
                  />
                ) : (
                  /* preload="metadata" fetches a few kilobytes of header rather
                     than buffering every clip in the folder at once. */
                  <video
                    src={item.url}
                    controls
                    preload="metadata"
                    playsInline
                    style={{ width: "100%", borderRadius: "8px" }}
                  />
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