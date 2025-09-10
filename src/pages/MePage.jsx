// src/pages/MePage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { auth, storage } from "../firebase";
import { ref, listAll, getDownloadURL, getBlob } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import "../style.css";

/* ========================== Helpers ========================== */

// Detect iOS / iPadOS (incl. iPad in desktop mode)
function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const touchMac = platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || touchMac;
}

// Feature-detect directory picker (Android/desktop Chrome/Edge)
function canPickDirectory() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

// Web Share (iOS): lets the user “Save to Files / Save Image”
async function shareFilesIOS(files, title) {
  // @ts-ignore
  if (navigator?.canShare && navigator.canShare({ files }) && navigator.share) {
    try {
      // @ts-ignore
      await navigator.share({ files, title: title || "Save media" });
      return true;
    } catch {
      return false; // user canceled
    }
  }
  return false;
}

// Create a File from Blob
function fileFromBlob(blob, filename) {
  return new File([blob], filename, { type: blob.type || "application/octet-stream" });
}

// Batch helper for iOS share limits
function* batchBySizeAndCount(items, { maxBytes = 45 * 1024 * 1024, maxCount = 10 } = {}) {
  let batch = [];
  let total = 0;
  for (const it of items) {
    const approx = 5 * 1024 * 1024; // conservative per-item estimate
    const wouldExceed = batch.length >= maxCount || total + approx > maxBytes;
    if (batch.length && wouldExceed) {
      yield batch;
      batch = [];
      total = 0;
    }
    batch.push(it);
    total += approx;
  }
  if (batch.length) yield batch;
}

// Unique name inside a chosen directory (adds " (1)" if exists)
async function getUniqueFileHandle(dirHandle, name) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let candidate = name;
  let n = 1;

  while (true) {
    try {
      // Try to get existing (if it exists, we need a new name)
      await dirHandle.getFileHandle(candidate, { create: false });
      // Exists → try next
      candidate = `${base} (${n++})${ext}`;
    } catch {
      // Not found → create this one
      return await dirHandle.getFileHandle(candidate, { create: true });
    }
  }
}

/* ========================== Component ========================== */

export default function MePage() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [mediaItems, setMediaItems] = useState([]); // [{id(fullPath), url, name, type}]
  const [loading, setLoading] = useState(true);

  const [savingAllToFolder, setSavingAllToFolder] = useState(false);
  const [folderProgress, setFolderProgress] = useState({ current: 0, total: 0, name: "" });

  const [savingAllIOS, setSavingAllIOS] = useState(false);
  const [iosProgress, setIosProgress] = useState({ current: 0, total: 0, phase: "" });

  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const extFromUrl = (url) => url.split("?")[0].split(".").pop().toLowerCase();
  const isVideoExt = (ext) => /(mp4|mov|avi|mkv)$/i.test(ext || "");
  const isImageExt = (ext) => /(png|jpg|jpeg|gif|webp)$/i.test(ext || "");
  const isVideoUrl = (url) => isVideoExt(extFromUrl(url));

  // Auth subscription
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Load user's media
  const fetchMedia = async (u) => {
    if (!u) {
      setMediaItems([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError("");

      const email = u.email || "";
      const sanitizedEmail = email.replace(/[.#$[\]]/g, "_");
      const userFolderRef = ref(storage, sanitizedEmail);
      const res = await listAll(userFolderRef);

      const mediaPromises = res.items.map(async (itemRef) => {
        if (itemRef.name === ".placeholder") return null;
        const url = await getDownloadURL(itemRef); // for preview
        const type = itemRef.name.split(".").pop();
        return { id: itemRef.fullPath, url, name: itemRef.name, type };
      });

      const mediaData = await Promise.all(mediaPromises);
      if (isMounted.current) setMediaItems(mediaData.filter(Boolean));
    } catch (e) {
      console.error(e);
      setError("Failed to load your private gallery.");
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    fetchMedia(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const filteredMediaItems = useMemo(
    () =>
      mediaItems.filter((item) => {
        const ext = (item.type || "").toLowerCase();
        if (filter === "images") return isImageExt(ext);
        if (filter === "videos") return isVideoExt(ext);
        return true;
      }),
    [mediaItems, filter]
  );

  const openModal = (item) => {
    setSelectedItem(item);
    setModalOpen(true);
  };
  const closeModal = () => {
    setSelectedItem(null);
    setModalOpen(false);
  };

  /* ---------- NEW: Save ALL to a chosen folder (Android/Desktop) ---------- */
  const saveAllToFolder = async () => {
    if (!filteredMediaItems.length) return;
    if (!canPickDirectory()) {
      alert("Your browser doesn't support choosing a folder. On iOS use the Share button; otherwise update Chrome/Edge.");
      return;
    }

    try {
      setSavingAllToFolder(true);
      setFolderProgress({ current: 0, total: filteredMediaItems.length, name: "" });

      // Ask the user to pick a folder (one user gesture)
      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });

      let done = 0;
      for (const it of filteredMediaItems) {
        setFolderProgress({ current: done, total: filteredMediaItems.length, name: it.name });

        // Get bytes from Firebase without CORS issues
        const blob = await getBlob(ref(storage, it.id));

        // Create unique file (avoid overwrite) and write
        const fh = await getUniqueFileHandle(dirHandle, it.name);
        const writable = await fh.createWritable();
        await writable.write(blob);
        await writable.close();

        done++;
        setFolderProgress({ current: done, total: filteredMediaItems.length, name: it.name });

        // small yield so UI stays responsive on big batches
        if (done % 5 === 0) await new Promise((r) => setTimeout(r, 0));
      }

      alert("All files saved to the chosen folder.");
    } catch (e) {
      console.error("Save to folder failed:", e);
      alert("Couldn't save all files. Make sure you chose a writable folder and try again.");
    } finally {
      if (isMounted.current) {
        setSavingAllToFolder(false);
        setFolderProgress({ current: 0, total: 0, name: "" });
      }
    }
  };

  /* ---------- iOS: Share & Save ALL in batches ---------- */
  const shareAllIOS = async () => {
    if (!filteredMediaItems.length) return;

    try {
      setSavingAllIOS(true);
      setIosProgress({ current: 0, total: filteredMediaItems.length, phase: "Preparing…" });

      const batches = Array.from(batchBySizeAndCount(filteredMediaItems));
      let done = 0;

      for (let b = 0; b < batches.length; b++) {
        setIosProgress({ current: done, total: filteredMediaItems.length, phase: `Downloading batch ${b + 1}/${batches.length}` });

        const files = [];
        for (const it of batches[b]) {
          try {
            const blob = await getBlob(ref(storage, it.id));
            files.push(fileFromBlob(blob, it.name));
          } catch (e) {
            console.warn("Skip:", it.name, e);
          }
          done++;
          setIosProgress({ current: done, total: filteredMediaItems.length, phase: "Preparing…" });
        }

        if (files.length) {
          const ok = await shareFilesIOS(files, `Save ${files.length} item(s)`);
          if (!ok) break; // user canceled
        }
      }
    } catch (e) {
      console.error("iOS share failed:", e);
      alert("Couldn't share all files. Try fewer files or smaller videos.");
    } finally {
      if (isMounted.current) {
        setSavingAllIOS(false);
        setIosProgress({ current: 0, total: 0, phase: "" });
      }
    }
  };

  /* ========================== UI ========================== */

  if (authLoading || loading) {
    return (
      <div className="container" style={{ textAlign: "center" }}>
        <p>{authLoading ? "Checking login..." : "Loading your gallery..."}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="container" style={{ textAlign: "center" }}>
        <h2 className="section-title">My Gallery</h2>
        <p>You're not logged in.</p>
        <Link className="auth-primary" to="/login">
          Log in to view your pics
        </Link>
      </main>
    );
  }

  if (error) {
    return (
      <main className="container" style={{ textAlign: "center" }}>
        <h2 className="section-title">My Gallery</h2>
        <p>{error}</p>
      </main>
    );
  }

  return (
    <main className="container">
      <h2 className="section-title">My Gallery</h2>

      {/* Filter */}
      <div className="gallery-buttons">
        <button
          onClick={() => setFilter("all")}
          className={`filter-button ${filter === "all" ? "active" : ""}`}
        >
          All
        </button>
        <button
          onClick={() => setFilter("images")}
          className={`filter-button ${filter === "images" ? "active" : ""}`}
        >
          Images
        </button>
        <button
          onClick={() => setFilter("videos")}
          className={`filter-button ${filter === "videos" ? "active" : ""}`}
        >
          Videos
        </button>
      </div>

      {/* Grid */}
      <div className="gallery-grid">
        {filteredMediaItems.length > 0 ? (
          filteredMediaItems.map((m) => (
            <div
              key={m.id}
              className="gallery-item"
              onClick={() => openModal(m)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && openModal(m)}
            >
              {isVideoUrl(m.url) ? (
                <video src={m.url} className="gallery-item-media" playsInline muted />
              ) : (
                <img src={m.url} alt={m.name} className="gallery-item-media" />
              )}
            </div>
          ))
        ) : (
          <p style={{ marginTop: 20, color: "#666" }}>
            No {filter === "all" ? "" : filter} found in your gallery.
          </p>
        )}
      </div>

      {/* Bulk actions */}
      {filteredMediaItems.length > 0 && (
        <div style={{ marginTop: 30, textAlign: "center" }}>
          {/* Android/Desktop path: real files to a chosen folder */}
          {canPickDirectory() && !isIOS() && (
            <button
              type="button"
              className="download-btn"
              disabled={savingAllToFolder}
              onClick={saveAllToFolder}
              title="Choose a folder and save every file into it"
            >
              {savingAllToFolder
                ? `Saving… ${folderProgress.current}/${folderProgress.total}${folderProgress.name ? " (" + folderProgress.name + ")" : ""}`
                : "Save All to Folder"}
            </button>
          )}

          {/* iOS path: share in batches */}
          {isIOS() && (
            <button
              type="button"
              className="download-btn"
              disabled={savingAllIOS}
              onClick={shareAllIOS}
              title="Share all files in batches, then Save to Files/Photos"
            >
              {savingAllIOS
                ? `${iosProgress.phase} ${iosProgress.current}/${iosProgress.total}`
                : "Share & Save All (iOS)"}
            </button>
          )}

          {/* Fallback notice if neither path shown */}
          {!canPickDirectory() && !isIOS() && (
            <p style={{ marginTop: 10, color: "#666" }}>
              Your browser can’t save to a folder. Update Chrome/Edge, or use “Share & Save” on iOS.
            </p>
          )}
        </div>
      )}

      {/* Modal */}
      {modalOpen && selectedItem && (
        <div className="media-modal" onClick={closeModal} role="dialog" aria-modal="true">
          <div className="media-modal-content" onClick={(e) => e.stopPropagation()}>
            {isVideoUrl(selectedItem.url) ? (
              <video src={selectedItem.url} controls className="modal-media" />
            ) : (
              <img src={selectedItem.url} alt={selectedItem.name} className="modal-media" />
            )}

            {/* Single-item actions (optional: add a per-file save here if you want) */}
            <div className="modal-actions">
              {/* Example of a per-file save to folder if supported */}
              {canPickDirectory() && !isIOS() && (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={async () => {
                    try {
                      // @ts-ignore
                      const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
                      const blob = await getBlob(ref(storage, selectedItem.id));
                      const fh = await getUniqueFileHandle(dirHandle, selectedItem.name);
                      const writable = await fh.createWritable();
                      await writable.write(blob);
                      await writable.close();
                      alert("Saved to the chosen folder.");
                    } catch (e) {
                      console.error(e);
                      alert("Couldn't save to the folder.");
                    }
                  }}
                >
                  Save to Folder
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
