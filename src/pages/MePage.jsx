import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { auth, storage, db } from "../firebase";
import { ref, listAll, getDownloadURL, uploadBytes } from "firebase/storage";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { logDownload } from "../lib/downloads";
import "../style.css";

const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL || "lensdance29@gmail.com";

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
// eslint-disable-next-line no-unused-vars
const MediaTile = React.memo(({ url, alt, isVideo, onClick, variant = "half", idx }) => {
  const { t } = useTranslation();
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
            {t("me.playVideo")}
          </div>
        </>
      ) : (
        <img
          src={url}
          alt={alt}
          className="tile-media"
          loading={idx < 4 ? "eager" : "lazy"}
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
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mediaItems, setMediaItems] = useState([]);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line no-unused-vars
  const [installingAll, setInstallingAll] = useState(false);
  const [error, setError] = useState("");
  // eslint-disable-next-line no-unused-vars
  const [filter, setFilter] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  // eslint-disable-next-line no-unused-vars
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // New state variables for cover layout
  const [userData, setUserData] = useState(null);
  const [activeHorse, setActiveHorse] = useState(0);
  const [selectedItems, setSelectedItems] = useState([]);
  const [loaded, setLoaded] = useState({}); // fade-in tracking, keyed by item id

  // Whose gallery we're showing. The admin can open any client's page via
  // /me?uid=<uid>; everyone else always sees their own.
  const [searchParams] = useSearchParams();
  const isAdmin = user?.email === ADMIN_EMAIL;
  const requestedUid = searchParams.get("uid");
  const targetUid = isAdmin && requestedUid ? requestedUid : user?.uid || null;

  // Admin editing of the displayed gallery's title + cover image
  const [ownerEmail, setOwnerEmail] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingCover, setSavingCover] = useState(false);

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

      // Prefer the canonical folderKey stored on the user's profile; fall back
      // to guessing sanitized-email variants for older accounts.
      let folderCandidates = getUserFolderCandidates(u);
      try {
        const profileSnap = await getDoc(doc(db, "users", u.uid));
        const storedKey = profileSnap.exists() ? profileSnap.data().folderKey : "";
        if (storedKey) folderCandidates = [storedKey, ...folderCandidates.filter(k => k !== storedKey)];
      } catch (e) {
        console.warn("Could not read folderKey from profile:", e?.message);
      }
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

        // בפרודקשן (Vercel) נשתמש ב-/api/image שמקטין את התמונה
        // בדב (localhost) נשתמש ישירות ב-URL המקורי
        const isProduction = window.location.hostname !== "localhost" &&
          !window.location.hostname.startsWith("127.");
        const sized = (w, q) => (!isVid && isProduction)
          ? `/api/image?url=${encodeURIComponent(fullUrl)}&w=${w}&q=${q}`
          : fullUrl;

        const thumbUrl = sized(640, 70);   // אריח קטן בגריד
        const gridUrl  = sized(1280, 72);  // אריח רחב
        const modalUrl = sized(1600, 80);  // תצוגה מוגדלת — לא הקובץ המקורי הכבד

        return {
          id: itemRef.fullPath,
          url: fullUrl,      // מקורי — להורדה בלבד
          thumbUrl,
          gridUrl,
          modalUrl,
          name: itemRef.name,
          type,
          isVideo: isVid,
          variant,
          lqipUrl: thumbUrl,
        };
      });

      const mediaData = (await Promise.all(baseItemsPromises)).filter(Boolean);
      setMediaItems(mediaData);
    } catch (e) {
      console.error(e);
      setError(t("me.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      let email = user.email;
      try {
        if (targetUid) {
          const snap = await getDoc(doc(db, "users", targetUid));
          if (!cancelled && snap.exists()) {
            const data = snap.data();
            setUserData(data);
            setTitleDraft(data.name || "");
            if (data.email) email = data.email;
          }
        }
      } catch (e) {
        console.warn("Could not load user data:", e);
      }
      if (!cancelled) setOwnerEmail(email);
      await fetchMedia({ uid: targetUid, email });
    })();

    return () => {
      cancelled = true;
    };
    // fetchMedia is re-created on every render; listing it here would refetch
    // the whole gallery on each one. This must run only when the viewer or the
    // gallery being viewed actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, targetUid]);

  // Records a download under the gallery's OWNER (not the viewer), so an admin
  // downloading a client's photos still shows up in that client's history.
  const recordDownload = (item) => {
    if (!targetUid && !ownerEmail) return;
    logDownload({ user: { uid: targetUid, email: ownerEmail }, item, ownerEmail });
  };

  // Admin: save an edited gallery title (stored on the user's profile as `name`)
  const saveTitle = async () => {
    if (!targetUid) return;
    const name = titleDraft.trim();
    try {
      await updateDoc(doc(db, "users", targetUid), { name });
      setUserData((d) => ({ ...(d || {}), name }));
      setEditingTitle(false);
    } catch (e) {
      alert(t("me.titleSaveFailed", { detail: e.message }));
    }
  };

  // Admin: upload a new cover image. Stored under covers/<uid> so it never
  // shows up inside the user's photo gallery.
  const onPickCover = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !targetUid) return;
    setSavingCover(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const coverRef = ref(storage, `covers/${targetUid}.${ext}`);
      await uploadBytes(coverRef, file, {
        contentType: file.type || "image/jpeg",
        cacheControl: "public, max-age=3600",
      });
      const url = await getDownloadURL(coverRef);
      await updateDoc(doc(db, "users", targetUid), { coverImage: url });
      setUserData((d) => ({ ...(d || {}), coverImage: url }));
    } catch (err) {
      alert(t("me.coverUploadFailed", { detail: err.message }));
    } finally {
      setSavingCover(false);
      if (e.target) e.target.value = "";
    }
  };

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

  // eslint-disable-next-line no-unused-vars
  const totalPages = Math.ceil(patternedItems.length / itemsPerPage) || 1;
  // eslint-disable-next-line no-unused-vars
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

  // Handler functions for new layout
  const handleSelectAll = () => {
    if (selectedItems.length === mediaItems.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(mediaItems.map(item => item.id));
    }
  };

  const handleDownloadSelected = async () => {
    const itemsToDownload = mediaItems.filter(item => selectedItems.includes(item.id));
    setInstallingAll(true);
    try {
      for (const item of itemsToDownload) {
        await nativeDownload(item.url, item.name, { prefer: "auto" });
        recordDownload(item);
        await new Promise((r) => setTimeout(r, 350));
      }
    } finally {
      setInstallingAll(false);
    }
  };

  const handleToggleSelect = (item) => {
    setSelectedItems(prev => 
      prev.includes(item.id) 
        ? prev.filter(id => id !== item.id)
        : [...prev, item.id]
    );
  };

  const handleOpenModal = (item) => {
    openModal(item);
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
        <p>{authLoading ? t("me.checkingAuth") : t("me.loading")}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="container" style={{ textAlign: "center" }}>
        <h2 className="section-title">{t("me.title")}</h2>
        <p>{t("me.notSignedIn")}</p>
        <Link className="auth-primary" to="/login">
          {t("me.signInPrompt")}
        </Link>
      </main>
    );
  }

  if (error) {
    return (
      <main className="container" style={{ textAlign: "center" }}>
        <h2 className="section-title">{t("me.title")}</h2>
        <p>{error}</p>
      </main>
    );
  }

  return (
    <div style={{ background: "#F5F1EA", minHeight: "100vh", direction: i18n.dir() }}>

      {/* ══════════════════════════════════════
          COVER IMAGE
      ══════════════════════════════════════ */}
      <div style={{ position: "relative", height: 380, overflow: "hidden", background: "#1A1208" }}>

        {/* Background image — coverImage from Firestore, fallback to first media */}
        <img
          src={userData?.coverImage || (mediaItems[0]?.gridUrl) || (mediaItems[0]?.url) || "/pics/pic1.webp"}
          alt={t("me.coverAlt")}
          fetchpriority="high"
          decoding="async"
          style={{
            width: "100%", height: "100%",
            objectFit: "cover", objectPosition: "center 25%",
            display: "block",
          }}
        />

        {/* Gradient overlay */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to top, rgba(20,10,4,.88) 0%, rgba(0,0,0,.1) 55%, transparent 100%)",
        }} />

        {/* Admin: change cover image */}
        {isAdmin && (
          <label style={{
            position: "absolute", top: 14, left: 14, zIndex: 5,
            fontFamily: "Arial, sans-serif", fontSize: 9,
            letterSpacing: ".16em", textTransform: "uppercase",
            color: "#fff", background: "rgba(0,0,0,.45)",
            border: "1px solid rgba(255,255,255,.5)",
            padding: "7px 14px", cursor: savingCover ? "wait" : "pointer",
            backdropFilter: "blur(2px)",
          }}>
            {savingCover ? t("me.uploading") : t("me.changeCover")}
            <input type="file" accept="image/*" onChange={onPickCover}
              disabled={savingCover} style={{ display: "none" }} />
          </label>
        )}

        {/* Centered bottom content */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", padding: "0 36px 32px",
          textAlign: "center",
        }}>

          {/* Eyebrow */}
          <span style={{
            fontFamily: "Arial, sans-serif", fontSize: 9,
            letterSpacing: ".24em", textTransform: "uppercase",
            color: "rgba(255,255,255,.45)", marginBottom: 10,
          }}>
            {t("me.personalGallery", { year: new Date().getFullYear() })}
          </span>

          {/* Rider name — editable by admin */}
          {isAdmin && editingTitle ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center", margin: "0 0 8px" }}>
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                autoFocus
                style={{
                  fontFamily: "Georgia, serif", fontSize: 26, color: "#fff",
                  background: "transparent", border: "none",
                  borderBottom: "2px solid rgba(255,255,255,.6)",
                  textAlign: "center", outline: "none", minWidth: 220,
                }}
              />
              <button onClick={saveTitle} style={{
                fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".14em",
                textTransform: "uppercase", color: "#2C1E12", background: "#fff",
                border: "none", padding: "7px 14px", cursor: "pointer",
              }}>{t("common.save")}</button>
              <button onClick={() => { setEditingTitle(false); setTitleDraft(userData?.name || ""); }} style={{
                fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".14em",
                textTransform: "uppercase", color: "rgba(255,255,255,.7)",
                background: "transparent", border: "none", cursor: "pointer",
              }}>{t("common.cancel")}</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 8px" }}>
              <h1 style={{
                fontFamily: "Georgia, serif", fontSize: 30,
                fontWeight: 400, color: "#fff",
                letterSpacing: ".04em", margin: 0,
              }}>
                {userData?.name || user?.displayName || t("me.yourGallery")}
              </h1>
              {isAdmin && (
                <button
                  onClick={() => { setEditingTitle(true); setTitleDraft(userData?.name || ""); }}
                  title={t("me.editTitle")}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.85)", fontSize: 15 }}
                >✏️</button>
              )}
            </div>
          )}

          {/* Nudge users without a full name to set one (helps the admin match photos) */}
          {!isAdmin && user && !(userData?.name || user?.displayName) && (
            <Link to="/change-name" style={{
              fontFamily: "Arial, sans-serif", fontSize: 11, letterSpacing: ".08em",
              color: "#FDFAF5", background: "rgba(178,150,125,.85)",
              padding: "8px 16px", textDecoration: "none", marginBottom: 14, display: "inline-block",
            }}>
              {t("me.addNameHint")}
            </Link>
          )}

          {/* Current horse name with decorative lines */}
          {userData?.horses?.length > 0 && (
            <div style={{
              display: "flex", alignItems: "center",
              gap: 12, marginBottom: 20,
            }}>
              <div style={{ height: 1, width: 32, background: "rgba(255,255,255,.3)" }} />
              <span style={{
                fontFamily: "Arial, sans-serif", fontSize: 12,
                letterSpacing: ".14em", color: "rgba(255,255,255,.72)",
              }}>
                {userData.horses[activeHorse]?.name || ""}
              </span>
              <div style={{ height: 1, width: 32, background: "rgba(255,255,255,.3)" }} />
            </div>
          )}

          {/* Horse switcher tabs — only if multiple horses */}
          {userData?.horses?.length > 1 && (
            <div style={{ display: "flex", gap: 8 }}>
              {userData.horses.map((horse, i) => (
                <button
                  key={i}
                  onClick={() => setActiveHorse(i)}
                  style={{
                    fontFamily: "Arial, sans-serif",
                    fontSize: 9, letterSpacing: ".18em",
                    textTransform: "uppercase",
                    padding: "8px 22px", cursor: "pointer",
                    border: `1px solid rgba(255,255,255,${activeHorse === i ? .72 : .3})`,
                    background: activeHorse === i ? "rgba(255,255,255,.15)" : "transparent",
                    color: `rgba(255,255,255,${activeHorse === i ? 1 : .5})`,
                    transition: "all .2s",
                  }}
                >
                  {horse.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════
          STATS BAR
      ══════════════════════════════════════ */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        background: "#EDE8DF",
        borderBottom: "1px solid #DDD8CF",
      }}>
        {[
          ["📸", mediaItems.filter(m => !m.isVideo).length, t("me.photos")],
          ["🎬", mediaItems.filter(m => m.isVideo).length, t("me.videos")],
          ["📅", userData?.lastShootDate || "—", t("me.date")],
        ].map(([icon, val, label], i) => (
          <div key={i} style={{
            padding: "13px 16px", textAlign: "center",
            borderLeft: i > 0 ? "1px solid #DDD8CF" : "none",
          }}>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 13, color: "#2C1E12", marginBottom: 2 }}>
              {icon} {val}
            </div>
            <span style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".1em", color: "#B2967D" }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════
          TOOLBAR — select & download
      ══════════════════════════════════════ */}
      <div style={{
        padding: "13px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid #E2D9CE",
        background: "#FDFAF5",
      }}>
        <span style={{ fontFamily: "Arial, sans-serif", fontSize: 10, letterSpacing: ".08em", color: "#9A8878" }}>
          {t("me.countLine", { count: mediaItems.length })}
        </span>
        <div style={{ display: "flex", gap: 10 }}>
          {/* Select all button */}
          <button
            onClick={handleSelectAll}
            style={{
              fontFamily: "Arial, sans-serif", fontSize: 9,
              letterSpacing: ".14em", textTransform: "uppercase",
              color: "#B2967D", background: "transparent", border: "none",
              cursor: "pointer", borderBottom: "1px solid #B2967D", paddingBottom: 1,
            }}
          >
            {t("me.selectAll")}
          </button>
          {/* Download button */}
          <button
            onClick={handleDownloadSelected}
            style={{
              fontFamily: "Arial, sans-serif", fontSize: 9,
              letterSpacing: ".14em", textTransform: "uppercase",
              color: "#4A3525", border: "1px solid #4A3525",
              background: "transparent", padding: "6px 16px", cursor: "pointer",
            }}
          >
            {t("me.downloadSelected")}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════
          PHOTO / VIDEO GRID — masonry
          Same layout as the public gallery: every frame is shown WHOLE. Tiles
          share a column width and take their height from the media itself, so
          a vertical clip stands tall next to a landscape still and neither is
          cropped. Column count lives in style.css (.gallery-masonry).
      ══════════════════════════════════════ */}
      <div style={{ padding: "16px 22px 40px", background: "#FAFAF8" }}>
        <div className="gallery-masonry">
          {mediaItems.map((item, index) => {
            const isVideo = item.isVideo;
            const isLoaded = loaded[item.id];
            const isSelected = selectedItems?.includes(item.id);

            return (
              <div
                key={item.id || index}
                className={`gallery-tile${isLoaded ? " is-loaded" : ""}`}
                onClick={() => handleOpenModal(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleOpenModal(item)}
              >
                {isVideo ? (
                  <>
                    <video
                      src={item.gridUrl || item.url}
                      className="gallery-tile-media"
                      muted playsInline preload="metadata"
                      onLoadedMetadata={() => setLoaded((l) => ({ ...l, [item.id]: true }))}
                    />
                    <span className="gallery-tile-play" aria-hidden="true" />
                  </>
                ) : (
                  <img
                    src={item.thumbUrl || item.gridUrl || item.url}
                    alt=""
                    className="gallery-tile-media"
                    loading={index < 4 ? "eager" : "lazy"}
                    fetchpriority={index < 2 ? "high" : undefined}
                    decoding="async"
                    onLoad={(e) => {
                      /* Lock the tile to the real ratio as soon as it is known,
                         so the columns stop reflowing as later photos arrive. */
                      const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                      if (w && h) e.currentTarget.parentElement.style.aspectRatio = `${w} / ${h}`;
                      setLoaded((l) => ({ ...l, [item.id]: true }));
                    }}
                  />
                )}

                {/* Selection checkbox — sits above the media, and stops the
                    click from also opening the lightbox. */}
                <div
                  onClick={e => { e.stopPropagation(); handleToggleSelect(item); }}
                  style={{
                    position: "absolute", top: 8, right: 8, zIndex: 2,
                    width: 20, height: 20, borderRadius: "50%",
                    border: `1.5px solid rgba(255,255,255,${isSelected ? 0 : .6})`,
                    background: isSelected ? "#B2967D" : "rgba(0,0,0,.2)",
                    cursor: "pointer", transition: "all .15s",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {isSelected && (
                    <span style={{ color: "#fff", fontSize: 10, lineHeight: 1 }}>✓</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Watermark */}
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <span style={{ fontFamily: "Arial, sans-serif", fontSize: 8, letterSpacing: ".12em", color: "#C0B0A0" }}>
            Lens Dance Photography · lens-dance.com
          </span>
        </div>
      </div>

      {/* Keep existing modal JSX below — do not change it */}
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
                src={selectedItem.modalUrl || selectedItem.url}
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
                onClick={() => {
                  nativeDownload(selectedItem.url, selectedItem.name, { prefer: "auto" });
                  recordDownload(selectedItem);
                }}
              >
                {t("me.download")}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}