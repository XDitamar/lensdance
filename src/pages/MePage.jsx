import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { auth, storage } from "../firebase";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import "../style.css";

/* ---------------------------------------------
 * iOS video priming
 * ---------------------------------------------- */
let __videosPrimed = false;
function isLikelyIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isiOSDevice =
    /iP(hone|od|ad)/.test(ua) ||
    (/Mac/.test(ua) && typeof window !== "undefined" && "ontouchend" in window);
  return isiOSDevice;
}
function primeIOSVideosOnce() {
  if (__videosPrimed || !isLikelyIOS()) return;
  __videosPrimed = true;
  const vids = document.querySelectorAll('video[data-prime="1"]');
  vids.forEach((v) => {
    try {
      v.muted = true;
      v.playsInline = true;
      const p = v.play();
      if (p && typeof p.then === "function") {
        p.then(() => v.pause()).catch(() => {});
      } else {
        v.pause();
      }
    } catch {}
  });
}
if (typeof window !== "undefined") {
  const handler = () => {
    primeIOSVideosOnce();
    window.removeEventListener("touchstart", handler, true);
    window.removeEventListener("pointerdown", handler, true);
    window.removeEventListener("click", handler, true);
  };
  window.addEventListener("touchstart", handler, true);
  window.addEventListener("pointerdown", handler, true);
  window.addEventListener("click", handler, true);
}

/* ---------------------------------------------
 * Downloads helpers
 * ---------------------------------------------- */
function buildAttachmentURL(url, filename) {
  try {
    const u = new URL(url);
    u.searchParams.set("alt", "media");
    u.searchParams.set(
      "response-content-disposition",
      `attachment; filename="${(filename || "download").replace(/"/g, "")}"`
    );
    u.searchParams.set("response-content-type", "application/octet-stream");
    return u.toString();
  } catch {
    return url;
  }
}
async function nativeDownload(url, filename = "download", opts = { prefer: "auto" }) {
  const dlUrl = buildAttachmentURL(url, filename);
  const blobDownload = async () => {
    const res = await fetch(dlUrl, { credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = objectUrl;
      a.setAttribute("download", filename || "download");
      a.style.position = "fixed";
      a.style.left = "-9999px";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };
  if (opts?.prefer === "blob") return blobDownload();
  if (!opts || opts.prefer === "auto") {
    const ext = (url.split("?")[0].split(".").pop() || "").toLowerCase();
    const isVideo = /(mp4|mov|avi|mkv|webm)$/i.test(ext);
    if (isVideo) {
      try {
        let frame = document.getElementById("hidden-download-frame");
        if (!frame) {
          frame = document.createElement("iframe");
          frame.id = "hidden-download-frame";
          frame.style.display = "none";
          document.body.appendChild(frame);
        }
        frame.src = dlUrl;
        return;
      } catch {}
    } else {
      try {
        return await blobDownload();
      } catch {}
    }
  }
  if (opts?.prefer === "iframe") {
    try {
      let frame = document.getElementById("hidden-download-frame");
      if (!frame) {
        frame = document.createElement("iframe");
        frame.id = "hidden-download-frame";
        frame.style.display = "none";
        document.body.appendChild(frame);
      }
      frame.src = dlUrl;
      return;
    } catch {}
  }
  try {
    const a = document.createElement("a");
    a.href = dlUrl;
    a.setAttribute("download", filename || "download");
    a.rel = "noopener";
    a.style.position = "fixed";
    a.style.left = "-9999px";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  } catch {
    window.location.href = dlUrl;
  }
}

/* ---------------------------------------------
 * Media utils
 * ---------------------------------------------- */
const extFromUrl = (url = "") => url.split("?")[0].split(".").pop().toLowerCase();
const isVideoExt = (ext = "") => /(mp4|mov|avi|mkv|webm)$/i.test(ext || "");
const isImageExt = (ext = "") => /(png|jpg|jpeg|gif|webp|heic|heif|svg)$/i.test(ext || "");
const isVideoUrl = (url = "") => isVideoExt(extFromUrl(url));


/* ---------------------------------------------
 * MediaTile – כל תמונות הדף נטענות מיד
 * ---------------------------------------------- */
const MediaTile = React.memo(({ url, alt, isVideo, onClick, variant = "half", idx }) => {
  return (
    <div
      className={`tile ${variant}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
      style={{ position: "relative", overflow: "hidden", cursor: "pointer" }}
    >
      {isVideo ? (
        /* סרטון בגריד: רק placeholder + אייקון play – לא טוענים את הסרטון */
        <>
          <div style={{
            position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
            background: "#1a1a1a",
          }} />
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: 64, height: 64, borderRadius: "50%",
            background: "rgba(255,255,255,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
            pointerEvents: "none",
          }}>
            <svg viewBox="0 0 24 24" width="32" height="32" fill="#333">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
          <div style={{
            position: "absolute", bottom: 8, left: 0, right: 0,
            textAlign: "center", color: "#fff", fontSize: "0.75rem",
            textShadow: "0 1px 3px rgba(0,0,0,0.8)",
            pointerEvents: "none",
          }}>
            ▶ לחץ לצפייה
          </div>
        </>
      ) : (
        <img
          src={url}
          alt={alt}
          className="tile-media"
          loading="eager"
          decoding="async"
          fetchpriority={idx < 3 ? "high" : "auto"}
          style={{
            position: "absolute",
            top: 0, left: 0,
            width: "100%", height: "100%",
            objectFit: "cover",
          }}
        />
      )}
    </div>
  );
});

/* ---------------------------------------------
 * listAllRecursive – גם תתי־תיקיות
 * ---------------------------------------------- */
async function listAllRecursive(folderRef) {
  const res = await listAll(folderRef);
  const files = [...res.items];

  for (const prefix of res.prefixes) {
    const childFiles = await listAllRecursive(prefix);
    files.push(...childFiles);
  }

  return files;
}

/* ---------------------------------------------
 *   תיקיות אפשריות למשתמש (לשילוב גרסאות ישנות/חדשות)
 * ---------------------------------------------- */
function getUserFolderCandidates(user) {
  const email = user.email || "";
  const uid = user.uid || "";

  const sanitized = email.replace(/[.#$[\]]/g, "_");
  const lowerSanitized = email.toLowerCase().replace(/[.#$[\]]/g, "_");
  const plain = email;
  const lowerPlain = email.toLowerCase();

  const set = new Set(
    [sanitized, lowerSanitized, plain, lowerPlain, uid].filter(Boolean)
  );

  return Array.from(set);
}

/* ---------------------------------------------
 * Page
 * ---------------------------------------------- */
export default function MePage() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mediaItems, setMediaItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [installingAll, setInstallingAll] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const fetchMedia = async (u) => {
    if (!u) {
      setMediaItems([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const folderCandidates = getUserFolderCandidates(u);
      console.log("Trying folders:", folderCandidates);

      const allFileRefsMap = new Map(); // key = fullPath

      for (const path of folderCandidates) {
        try {
          const folderRef = ref(storage, path);
          const files = await listAllRecursive(folderRef);
          files.forEach((f) => {
            if (!allFileRefsMap.has(f.fullPath)) {
              allFileRefsMap.set(f.fullPath, f);
            }
          });
        } catch (e) {
          console.warn("Folder not found or error:", path, e?.message);
        }
      }

      const allItemRefs = Array.from(allFileRefsMap.values());

      const baseItemsPromises = allItemRefs.map(async (itemRef) => {
        if (itemRef.name === ".placeholder") return null;

        const fullUrl = await getDownloadURL(itemRef);
        const type = itemRef.name.split(".").pop();
        const isVid = isVideoExt((type || "").toLowerCase()) || isVideoUrl(fullUrl);
        // variant יוגדר ב-applyPattern לפי מיקום (wide/half), לא לפי גודל התמונה
        // כך נחסכת טעינה כפולה של כל תמונה רק לצורך מדידת מימדים
        const variant = "wide";

        let gridUrl = fullUrl;
        let lqipUrl = undefined;

        // בפרודקשן (Vercel) נשתמש ב-/api/image שמקטין את התמונה
        // בדב (localhost) נשתמש ישירות ב-URL המקורי
        if (!isVid) {
          const isProduction = window.location.hostname !== "localhost" &&
            !window.location.hostname.startsWith("127.");
          const resizedUrl = isProduction
            ? `/api/image?url=${encodeURIComponent(fullUrl)}&w=1280&q=70`
            : fullUrl;
          gridUrl = resizedUrl;
          lqipUrl = resizedUrl;
        }

        return {
          id: itemRef.fullPath,
          url: fullUrl,      // FULL (למודאל / הורדה)
          gridUrl,           // קטן ומהיר לגריד
          name: itemRef.name,
          type,
          isVideo: isVid,
          variant,
          lqipUrl,
        };
      });

      const mediaData = (await Promise.all(baseItemsPromises)).filter(Boolean);
      setMediaItems(mediaData);
    } catch (e) {
      console.error(e);
      setError("טעינת הגלריה הפרטית נכשלה.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    fetchMedia(user);
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

  const patternedItems = useMemo(() => {
    let out = [];
    let i = 0;
    while (i < filteredMediaItems.length) {
      if (i % 3 === 0) {
        out.push({ ...filteredMediaItems[i], variant: "wide" });
        i++;
      } else {
        out.push({ ...filteredMediaItems[i], variant: "half" });
        if (i + 1 < filteredMediaItems.length) {
          out.push({ ...filteredMediaItems[i + 1], variant: "half" });
        }
        i += 2;
      }
    }
    return out;
  }, [filteredMediaItems]);

  const totalPages = Math.ceil(patternedItems.length / itemsPerPage) || 1;
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return patternedItems.slice(start, start + itemsPerPage);
  }, [patternedItems, currentPage, itemsPerPage]);

  const openModal = (item) => {
    setSelectedItem(item);
    setModalOpen(true);
  };
  const closeModal = () => {
    setSelectedItem(null);
    setModalOpen(false);
  };

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (e) => e.key === "Escape" && closeModal();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  if (authLoading || loading) {
    return (
      <div className="container" style={{ textAlign: "center" }}>
        <p>{authLoading ? "בודק התחברות..." : "טוען את הגלריה שלך..."}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="container" style={{ textAlign: "center" }}>
        <h2 className="section-title">הגלריה שלי</h2>
        <p>אינך מחובר.</p>
        <Link className="auth-primary" to="/login">
          התחבר כדי לצפות בתמונות שלך
        </Link>
      </main>
    );
  }

  if (error) {
    return (
      <main className="container" style={{ textAlign: "center" }}>
        <h2 className="section-title">הגלריה שלי</h2>
        <p>{error}</p>
      </main>
    );
  }

  return (
    <main className="container">
      <h2 className="section-title">הגלריה שלי</h2>

      {/* Filter */}
      <div className="gallery-buttons">
        <button
          onClick={() => setFilter("all")}
          className={`filter-button ${filter === "all" ? "active" : ""}`}
        >
          הכל
        </button>
        <button
          onClick={() => setFilter("images")}
          className={`filter-button ${filter === "images" ? "active" : ""}`}
        >
          תמונות
        </button>
        <button
          onClick={() => setFilter("videos")}
          className={`filter-button ${filter === "videos" ? "active" : ""}`}
        >
          סרטונים
        </button>
      </div>

      {/* Gallery */}
      <div className="gallery-grid collage">
        {pageItems.length > 0 ? (
          pageItems.map((m, idx) => (
            <MediaTile
              key={m.id}
              url={m.gridUrl || m.url}
              alt={m.name}
              isVideo={m.isVideo ?? isVideoUrl(m.url)}
              variant={m.variant || "half"}
              idx={idx}
              onClick={() => openModal(m)}
            />
          ))
        ) : (
          <p style={{ marginTop: 20, color: "#666" }}>לא נמצאו פריטים בעמוד זה.</p>
        )}
      </div>

      {/* Pagination + Download all */}
      {(totalPages > 1 || patternedItems.length > 0) && (
        <div style={{ marginTop: 14 }}>
          {totalPages > 1 && (
            <div className="pagination-row">
              <div className="pagination" style={{ direction: "ltr" }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
                  <button
                    key={num}
                    className={`page-btn ${currentPage === num ? "active" : ""}`}
                    onClick={() => setCurrentPage(num)}
                    aria-current={currentPage === num ? "page" : undefined}
                    style={{
                      background: currentPage === num ? "#6A402A" : "#eee",
                      color: currentPage === num ? "#fff" : "#111",
                      border: "none",
                      padding: "6px 12px",
                      borderRadius: 8,
                      cursor: "pointer",
                      minWidth: 36,
                      fontWeight: currentPage === num ? 700 : 500,
                    }}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          )}

          {patternedItems.length > 0 && (
            <div className="download-row">
              <button
                type="button"
                className="download-btn"
                disabled={installingAll}
                onClick={async () => {
                  setInstallingAll(true);
                  try {
                    for (const item of patternedItems) {
                      await nativeDownload(item.url, item.name, { prefer: "auto" });
                      await new Promise((r) => setTimeout(r, 350));
                    }
                  } finally {
                    setInstallingAll(false);
                  }
                }}
              >
                {installingAll ? "מוריד..." : "הורד הכל"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal – תמיד full-res */}
      {modalOpen && selectedItem && (
        <div className="media-modal" onClick={closeModal} role="dialog" aria-modal="true">
          <div className="media-modal-content" onClick={(e) => e.stopPropagation()}>
            {isVideoUrl(selectedItem.url) ? (
              <video
                src={selectedItem.url}
                controls
                className="modal-media"
                preload="metadata"
                playsInline
                style={{ background: "#000", maxHeight: "80vh", width: "100%" }}
              />
            ) : (
              <img
                src={selectedItem.url}
                alt={selectedItem.name}
                className="modal-media"
                style={{
                  background: "#111",
                  maxHeight: "80vh",
                  width: "100%",
                  objectFit: "contain",
                }}
              />
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="download-btn"
                onClick={() =>
                  nativeDownload(selectedItem.url, selectedItem.name, { prefer: "auto" })
                }
              >
                הורד
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
