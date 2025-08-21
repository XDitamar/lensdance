// src/pages/MePage.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { auth, storage } from "../firebase";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import "../style.css";

/** Build a URL that asks Firebase/GCS to set Content-Disposition: attachment */
function buildAttachmentURL(originalUrl, filename = "download") {
  try {
    const u = new URL(originalUrl);
    // Make sure we request the raw bytes
    if (!u.searchParams.has("alt")) u.searchParams.set("alt", "media");
    // Force download with a filename hint
    u.searchParams.set(
      "response-content-disposition",
      `attachment; filename="${filename}"`
    );
    return u.toString();
  } catch {
    return originalUrl;
  }
}

/** Try direct "attachment" download first, then fallback to blob */
async function forceDownload(url, filename = "download") {
  // 1) Try the attachment URL (often enough for desktop + many mobiles)
  const attachmentUrl = buildAttachmentURL(url, filename);
  try {
    // Attempt a quick HEAD to ensure it's reachable as attachment (not required, but avoids some odd cases)
    await fetch(attachmentUrl, { method: "HEAD", cache: "no-store", mode: "no-cors" });
    const a = document.createElement("a");
    a.href = attachmentUrl;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  } catch {
    // ignore and try blob below
  }

  // 2) Robust fallback: fetch bytes → blob → object URL → <a download>
  try {
    const res = await fetch(url, { cache: "no-store", credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();

    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // give the browser a tick to start saving before revoking
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (err) {
    console.error("Download failed, last-resort open:", err);
    // 3) Last resort (some very old mobile browsers): open in same tab and let the user save
    window.location.href = attachmentUrl || url;
  }
}

export default function MePage() {
  const [mediaItems, setMediaItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null); // { id, url, name, type }

  const user = auth.currentUser;

  const extFromUrl = (url) => url.split("?")[0].split(".").pop().toLowerCase();
  const isVideoExt = (ext) => /(mp4|mov|avi|mkv)$/i.test(ext);
  const isImageExt = (ext) => /(png|jpg|jpeg|gif|webp)$/i.test(ext);
  const isVideoUrl = (url) => isVideoExt(extFromUrl(url));

  // --- Fetch Media from User's Folder ---
  const fetchMedia = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      // Sanitize the email to get the correct folder name
      const sanitizedEmail = user.email.replace(/[.#$[\]]/g, "_");
      const userFolderRef = ref(storage, sanitizedEmail);

      const res = await listAll(userFolderRef);

      const mediaPromises = res.items.map(async (itemRef) => {
        if (itemRef.name === ".placeholder") return null; // ignore placeholder
        const url = await getDownloadURL(itemRef);
        const type = itemRef.name.split(".").pop();
        return {
          id: itemRef.fullPath,
          url,
          name: itemRef.name,
          type,
        };
      });

      const mediaData = await Promise.all(mediaPromises);
      setMediaItems(mediaData.filter((x) => x !== null));
      setLoading(false);
    } catch (e) {
      console.error(e);
      setError("Failed to load your private gallery.");
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

  // Close on Escape
  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (e) => e.key === "Escape" && closeModal();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  // --- UI Guards ---
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

      {/* Filter buttons */}
      <div className="gallery-buttons">
        <button onClick={() => setFilter("all")} className="filter-button">
          All
        </button>
        <button onClick={() => setFilter("images")} className="filter-button">
          Images
        </button>
        <button onClick={() => setFilter("videos")} className="filter-button">
          Videos
        </button>
      </div>

      {/* Gallery Grid */}
      <div className="gallery-grid">
        {filteredMediaItems.length > 0 ? (
          filteredMediaItems.map((m) => (
            <div
              key={m.id}
              className="gallery-item"
              onClick={() => openModal(m)}
            >
              {isVideoUrl(m.url) ? (
                <video src={m.url} className="gallery-item-media" />
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

      {/* Download All (downloads all items in current filter) */}
      {filteredMediaItems.length > 0 && (
        <div style={{ marginTop: 30, textAlign: "center" }}>
          <button
            className="download-btn"
            onClick={async () => {
              // Sequential downloads for reliability (esp. on mobile).
              for (const item of filteredMediaItems) {
                await forceDownload(item.url, item.name);
                // small pause helps some browsers queue properly
                await new Promise((r) => setTimeout(r, 150));
              }
            }}
          >
            Download All
          </button>
        </div>
      )}

      {/* Modal with click-outside-to-close + single download */}
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

            {/* Modal actions row */}
            <div className="modal-actions">
              <button
                className="download-btn"
                onClick={() =>
                  forceDownload(selectedItem.url, selectedItem.name)
                }
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
