// src/pages/MePage.jsx
import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { auth, storage } from "../firebase";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import "../style.css";

/* ========================== Utilities ========================== */

/** iOS / iPadOS detection (כולל iPad במצב Desktop) */
function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const touchMac = platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || touchMac;
}

/** URL שמכריח bytes + מציע filename (מועיל לאנדרואיד/דסקטופ) */
function buildAttachmentURL(url, filename) {
  try {
    const u = new URL(url);
    u.searchParams.set("alt", "media");
    u.searchParams.set(
      "response-content-disposition",
      `attachment; filename="${(filename || "download").replace(/"/g, "")}"`
    );
    return u.toString();
  } catch {
    return url;
  }
}

/** הורדה טבעית של הדפדפן (בלי לטעון לזיכרון JS) */
function triggerNativeDownload(dlUrl) {
  try {
    const a = document.createElement("a");
    a.href = dlUrl;
    a.target = "_self"; // או "_blank"
    a.rel = "noopener";
    a.style.position = "fixed";
    a.style.left = "-9999px";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    try {
      let frame = document.getElementById("hidden-download-frame");
      if (!frame) {
        frame = document.createElement("iframe");
        frame.id = "hidden-download-frame";
        frame.style.display = "none";
        document.body.appendChild(frame);
      }
      frame.src = dlUrl;
    } catch {
      window.location.href = dlUrl;
    }
  }
}

/** מביא Blob עם פרמטרי attachment */
async function fetchAsBlob(url, filename) {
  const dlUrl = buildAttachmentURL(url, filename);
  const resp = await fetch(dlUrl, {
    method: "GET",
    mode: "cors",
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.blob();
}

/** יוצר File מ-URL (fetch → Blob → File) */
async function fileFromUrl(url, filename) {
  const blob = await fetchAsBlob(url, filename);
  return new File([blob], filename, { type: blob.type || "application/octet-stream" });
}

/** iOS: שיתוף קבצים (Save to Files / Save Image) */
async function shareFilesIOS(files, title) {
  // @ts-ignore
  if (navigator?.canShare && navigator.canShare({ files }) && navigator.share) {
    try {
      // @ts-ignore
      await navigator.share({ files, title: title || "Save Media" });
      return true;
    } catch {
      return false; // בוטל או נכשל
    }
  }
  return false;
}

/** חלוקה למקבצים (batch) כדי לא לחרוג ממגבלות iOS */
function* batchBySizeAndCount(items, { maxBytes = 45 * 1024 * 1024, maxCount = 10 } = {}) {
  let batch = [];
  let total = 0;
  for (const it of items) {
    // אין לנו משקל מראש → הערכה שמרנית ~5MB
    const size = 5 * 1024 * 1024;
    const wouldExceed = batch.length >= maxCount || total + size > maxBytes;
    if (batch.length && wouldExceed) {
      yield batch;
      batch = [];
      total = 0;
    }
    batch.push(it);
    total += size;
  }
  if (batch.length) yield batch;
}

/* ========================== Component ========================== */

export default function MePage() {
  const [mediaItems, setMediaItems] = useState([]); // [{id,url,name,type}]
  const [loading, setLoading] = useState(true);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const [savingAllIOS, setSavingAllIOS] = useState(false);
  const [preparedBatches, setPreparedBatches] = useState([]); // Array<Array<File>>
  const [prepProgress, setPrepProgress] = useState({ current: 0, total: 0, phase: "" });

  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [preparedFile, setPreparedFile] = useState(null); // File מוכן לשיתוף עבור פריט בודד
  const modalFetchAbort = useRef(null);

  const user = auth.currentUser;

  const extFromUrl = (url) => url.split("?")[0].split(".").pop().toLowerCase();
  const isVideoExt = (ext) => /(mp4|mov|avi|mkv)$/i.test(ext || "");
  const isImageExt = (ext) => /(png|jpg|jpeg|gif|webp)$/i.test(ext || "");
  const isVideoUrl = (url) => isVideoExt(extFromUrl(url));

  // הבאת המדיה של המשתמש
  const fetchMedia = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError("");

      const sanitizedEmail = user.email.replace(/[.#$[\]]/g, "_");
      const userFolderRef = ref(storage, sanitizedEmail);
      const res = await listAll(userFolderRef);

      const mediaPromises = res.items.map(async (itemRef) => {
        if (itemRef.name === ".placeholder") return null;
        const url = await getDownloadURL(itemRef);
        const type = itemRef.name.split(".").pop();
        return { id: itemRef.fullPath, url, name: itemRef.name, type };
      });

      const mediaData = await Promise.all(mediaPromises);
      setMediaItems(mediaData.filter(Boolean));
    } catch (e) {
      console.error(e);
      setError("Failed to load your private gallery.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filteredMediaItems = mediaItems.filter((item) => {
    const ext = (item.type || "").toLowerCase();
    if (filter === "images") return isImageExt(ext);
    if (filter === "videos") return isVideoExt(ext);
    return true;
  });

  /* ==================== Modal prep (single item, iOS) ==================== */
  const openModal = async (item) => {
    setSelectedItem(item);
    setModalOpen(true);
    setPreparedFile(null);

    // מכינים מראש את הקובץ ל-iOS כדי שה-share יקרה מיד בלחיצה
    if (isIOS()) {
      try {
        const ctrl = new AbortController();
        modalFetchAbort.current = ctrl;
        const blob = await fetchAsBlob(item.url, item.name);
        if (ctrl.signal.aborted) return;
        setPreparedFile(new File([blob], item.name, { type: blob.type || "application/octet-stream" }));
      } catch (e) {
        console.warn("Prefetch for modal failed:", e);
      } finally {
        modalFetchAbort.current = null;
      }
    }
  };

  const closeModal = () => {
    setSelectedItem(null);
    setModalOpen(false);
    setPreparedFile(null);
    if (modalFetchAbort.current) modalFetchAbort.current.abort();
  };

  // שמירה של פריט בודד
  async function saveSingle(item) {
    if (isIOS()) {
      try {
        const file = preparedFile || (await fileFromUrl(item.url, item.name));
        const ok = await shareFilesIOS([file], item.name);
        if (!ok) triggerNativeDownload(buildAttachmentURL(item.url, item.name));
      } catch {
        triggerNativeDownload(buildAttachmentURL(item.url, item.name));
      }
    } else {
      triggerNativeDownload(buildAttachmentURL(item.url, item.name));
    }
  }

  /* ==================== iOS: prepare & share all ==================== */

  // שלב 1: הכנה לשיתוף – יוצר מקבצים של Files בזיכרון
  async function prepareAllIOS(items) {
    if (!items.length) return;
    if (!isIOS()) return; // רלוונטי רק ל-iOS

    setSavingAllIOS(true);
    setPreparedBatches([]);
    setPrepProgress({ current: 0, total: items.length, phase: "מכין..." });

    try {
      const batches = Array.from(batchBySizeAndCount(items));
      const prepared = [];
      let done = 0;

      for (let b = 0; b < batches.length; b++) {
        setPrepProgress({ current: done, total: items.length, phase: `מוריד מקבץ ${b + 1}/${batches.length}` });
        const files = [];
        for (const it of batches[b]) {
          try {
            const blob = await fetchAsBlob(it.url, it.name);
            files.push(new File([blob], it.name, { type: blob.type || "application/octet-stream" }));
          } catch (e) {
            console.warn("Skipping failed item:", it.name, e);
          }
          done++;
          setPrepProgress({ current: done, total: items.length, phase: `מכין...` });
        }
        if (files.length) prepared.push(files);
      }

      setPreparedBatches(prepared);
      setPrepProgress((p) => ({ ...p, phase: "מוכן לשיתוף" }));
    } catch (e) {
      console.error("Prepare all iOS failed:", e);
      alert("הכנת הקבצים נכשלה. נסה/י לבחור פחות קבצים או קבצים קטנים יותר.");
    } finally {
      setSavingAllIOS(false);
    }
  }

  // שלב 2: שיתוף & שמירה – קריאה אחת ל-share לכל מקבץ
  async function sharePreparedIOS() {
    if (!preparedBatches.length) return;
    for (let i = 0; i < preparedBatches.length; i++) {
      const ok = await shareFilesIOS(preparedBatches[i], `Save ${preparedBatches[i].length} item(s)`);
      if (!ok) break; // אם המשתמש ביטל – מפסיקים
    }
    // ניקוי
    setPreparedBatches([]);
    setPrepProgress({ current: 0, total: 0, phase: "" });
  }

  /* ==================== Android/Desktop: download each ==================== */
  async function downloadEach(items) {
    if (!items.length) return;
    setDownloadingAll(true);
    try {
      for (const it of items) {
        triggerNativeDownload(buildAttachmentURL(it.url, it.name));
        await new Promise((r) => setTimeout(r, 200)); // ריווח קטן
      }
    } finally {
      setDownloadingAll(false);
    }
  }

  /* ==================== UI ==================== */

  if (loading) {
    return (
      <div className="container" style={{ textAlign: "center" }}>
        <p>Loading your gallery...</p>
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

      {/* סינון */}
      <div className="gallery-buttons">
        <button onClick={() => setFilter("all")} className="filter-button">הכול</button>
        <button onClick={() => setFilter("images")} className="filter-button">תמונות</button>
        <button onClick={() => setFilter("videos")} className="filter-button">וידאו</button>
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
            לא נמצאו {filter === "all" ? "" : filter === "images" ? "תמונות" : "סרטונים"} בגלריה שלך.
          </p>
        )}
      </div>

      {/* פעולות מרובות */}
      {filteredMediaItems.length > 0 && (
        <div style={{ marginTop: 30, textAlign: "center" }}>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            {isIOS() ? (
              <>
                <button
                  type="button"
                  className="download-btn"
                  disabled={savingAllIOS || !!preparedBatches.length}
                  onClick={() => prepareAllIOS(filteredMediaItems)}
                >
                  {savingAllIOS
                    ? `מכין… ${prepProgress.phase} ${prepProgress.current}/${prepProgress.total}`
                    : "הכן את הכול לשיתוף (iOS)"}
                </button>

                <button
                  type="button"
                  className="download-btn"
                  disabled={!preparedBatches.length}
                  onClick={sharePreparedIOS}
                >
                  שתף ושמור (iOS)
                </button>
              </>
            ) : (
              <button
                type="button"
                className="download-btn"
                disabled={downloadingAll}
                onClick={() => downloadEach(filteredMediaItems)}
              >
                {downloadingAll ? "מוריד…" : "הורד כל קובץ"}
              </button>
            )}
          </div>

          {isIOS() && (savingAllIOS || preparedBatches.length > 0) && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
              {prepProgress.phase && `${prepProgress.phase} ${prepProgress.current}/${prepProgress.total}`}
              {preparedBatches.length > 0 && " • מוכן לשיתוף"}
            </div>
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

            {/* פעולות */}
            <div className="modal-actions">
              <button
                type="button"
                className="download-btn"
                onClick={() => saveSingle(selectedItem)}
              >
                שמור למכשיר
              </button>

              {/* אופציונלי: תצוגה בלשונית */}
              {/* <button
                type="button"
                className="secondary-btn"
                onClick={() => window.open(selectedItem.url, "_blank", "noopener,noreferrer")}
              >
                תצוגה מקדימה
              </button> */}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
