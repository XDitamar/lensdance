// src/pages/MePage.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { auth, storage } from "../firebase";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import "../style.css";

/* ========================== Utilities ========================== */

/** זיהוי iOS / iPadOS (כולל iPad במצב "Desktop") */
function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const touchMac = platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || touchMac;
}

/** בונה URL שמכריח החזרת בתים גולמיים ומבקש כותרת attachment עם שם קובץ */
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

/** הורדה "טבעית" של הדפדפן בלי לטעון את הקובץ לזיכרון JS */
function triggerNativeDownload(dlUrl) {
  try {
    const a = document.createElement("a");
    a.href = dlUrl;
    a.target = "_self"; // או "_blank" אם מעדיפים
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

/** מביא Blob (עם הפרמטרים של attachment) */
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

/** iOS: שיתוף קבצים דרך Web Share (משם המשתמש בוחר Save to Files / שמור תמונה) */
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

/** מ-URL ל-File (fetch → Blob → File) */
async function fileFromUrl(url, filename) {
  const blob = await fetchAsBlob(url, filename);
  return new File([blob], filename, { type: blob.type || "application/octet-stream" });
}

/** חלוקה למקבצים (batch) ל-iOS כדי לא לחרוג ממגבלות השיתוף */
function* batchBySizeAndCount(items, { maxBytes = 45 * 1024 * 1024, maxCount = 10 } = {}) {
  let batch = [];
  let total = 0;
  for (const it of items) {
    // אין לנו משקל מראש → הערכה שמרנית ~5MB לפריט
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
  const [savingAllMobile, setSavingAllMobile] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ current: 0, total: 0, phase: "" });
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

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

  const openModal = (item) => {
    setSelectedItem(item);
    setModalOpen(true);
  };
  const closeModal = () => {
    setSelectedItem(null);
    setModalOpen(false);
  };

  // הורדה של פריט בודד: iOS → Share; אחרים → הורדה ישירה
  async function downloadSingle(url, filename) {
    if (isIOS()) {
      try {
        const file = await fileFromUrl(url, filename);
        const ok = await shareFilesIOS([file], filename);
        if (!ok) {
          // fallback: נסיון הורדה טבעית (ייתכן שיופיע תצוגה מקדימה במקום הורדה בתמונות)
          triggerNativeDownload(buildAttachmentURL(url, filename));
        }
      } catch {
        triggerNativeDownload(buildAttachmentURL(url, filename));
      }
    } else {
      triggerNativeDownload(buildAttachmentURL(url, filename));
    }
  }

  // שמירה של כולם (ללא ZIP): iOS במקבצים; אנדרואיד/דסקטופ הורדה ישירה לכל קובץ
  async function saveAllMobile(items) {
    if (!items.length) return;
    setSavingAllMobile(true);
    setSaveProgress({ current: 0, total: items.length, phase: "מכין..." });

    try {
      if (isIOS()) {
        const batches = Array.from(batchBySizeAndCount(items));
        let done = 0;

        for (let b = 0; b < batches.length; b++) {
          setSaveProgress({ current: done, total: items.length, phase: `מכין מקבץ ${b + 1}/${batches.length}` });

          const files = [];
          for (const it of batches[b]) {
            try {
              const f = await fileFromUrl(it.url, it.name);
              files.push(f);
              done++;
              setSaveProgress({ current: done, total: items.length, phase: `מוכן לשיתוף` });
            } catch (err) {
              console.warn("Skipping failed item:", it.name, err);
            }
          }

          if (files.length) {
            const ok = await shareFilesIOS(files, `Save ${files.length} item(s)`);
            if (!ok) {
              // אם המשתמש ביטל – עוצרים
              break;
            }
          }
        }
      } else {
        // אנדרואיד/דסקטופ: הורדה נייטיבית לכל קובץ בתור
        let count = 0;
        for (const it of items) {
          setSaveProgress({ current: count, total: items.length, phase: "מוריד..." });
          triggerNativeDownload(buildAttachmentURL(it.url, it.name));
          count++;
          setSaveProgress({ current: count, total: items.length, phase: "מוריד..." });
          await new Promise((r) => setTimeout(r, 200)); // ריווח קטן להורדות מרובות
        }
      }
    } finally {
      setSavingAllMobile(false);
      setSaveProgress({ current: 0, total: 0, phase: "" });
    }
  }

  // ---------- UI guards ----------
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

  // ---------- Page ----------
  return (
    <main className="container">
      <h2 className="section-title">My Gallery</h2>

      {/* סינון */}
      <div className="gallery-buttons">
        <button onClick={() => setFilter("all")} className="filter-button">
          הכול
        </button>
        <button onClick={() => setFilter("images")} className="filter-button">
          תמונות
        </button>
        <button onClick={() => setFilter("videos")} className="filter-button">
          וידאו
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
            לא נמצאו {filter === "all" ? "" : filter === "images" ? "תמונות" : "סרטונים"} בגלריה שלך.
          </p>
        )}
      </div>

      {/* פעולות מרובות */}
      {filteredMediaItems.length > 0 && (
        <div style={{ marginTop: 30, textAlign: "center" }}>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="download-btn"
              disabled={savingAllMobile || downloadingAll}
              onClick={() => saveAllMobile(filteredMediaItems)}
            >
              {savingAllMobile
                ? `שומר… ${saveProgress.phase} ${saveProgress.current}/${saveProgress.total}`
                : "שמור את הכול (מובייל)"}
            </button>

            <button
              type="button"
              className="secondary-btn"
              disabled={savingAllMobile || downloadingAll}
              onClick={async () => {
                try {
                  setDownloadingAll(true);
                  let i = 0;
                  for (const item of filteredMediaItems) {
                    triggerNativeDownload(buildAttachmentURL(item.url, item.name));
                    i++;
                    await new Promise((r) => setTimeout(r, 200));
                  }
                } finally {
                  setDownloadingAll(false);
                }
              }}
            >
              {downloadingAll ? "מוריד…" : "הורד כל קובץ"}
            </button>
          </div>

          {(savingAllMobile && saveProgress.total) && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
              {saveProgress.phase} {saveProgress.current}/{saveProgress.total}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {modalOpen && selectedItem && (
        <div
          className="media-modal"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="media-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            {isVideoUrl(selectedItem.url) ? (
              <video src={selectedItem.url} controls className="modal-media" />
            ) : (
              <img
                src={selectedItem.url}
                alt={selectedItem.name}
                className="modal-media"
              />
            )}

            {/* פעולות */}
            <div className="modal-actions">
              <button
                type="button"
                className="download-btn"
                onClick={() => downloadSingle(selectedItem.url, selectedItem.name)}
              >
                שמור למכשיר
              </button>

              {/* כפתור תצוגה בלשונית נפרדת (רשות) */}
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
