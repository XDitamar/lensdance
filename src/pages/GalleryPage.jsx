// src/pages/GalleryPage.jsx
import React, { useEffect, useState, useMemo } from "react";
import { storage } from "../firebase";
import {
  ref as storageRef,
  listAll,
  getDownloadURL,
  getMetadata,
} from "firebase/storage";

const IMAGES_PATH = "images/public"; // adjust if needed
const VIDEOS_PATH = "videos/public"; // adjust if needed

export default function GalleryPage() {
  const [media, setMedia] = useState([]);
  const [tab, setTab] = useState("images");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const images = useMemo(() => media.filter((m) => m.type === "image"), [media]);
  const videos = useMemo(() => media.filter((m) => m.type === "video"), [media]);

  useEffect(() => {
    let cancelled = false;

    async function listFolder(prefix, assumedType) {
      const out = [];
      const folder = storageRef(storage, prefix);

      // listAll = one level; if you need deep subfolders, iterate prefixes too
      const listing = await listAll(folder);

      // items = files in the folder
      const metas = await Promise.all(
        listing.items.map(async (itemRef) => {
          const [url, meta] = await Promise.all([
            getDownloadURL(itemRef),
            getMetadata(itemRef).catch(() => null), // metadata may fail if rules restrict
          ]);

          const contentType =
            meta?.contentType ||
            (assumedType === "image" ? "image/*" : assumedType === "video" ? "video/*" : "");
          const type = contentType.startsWith("image")
            ? "image"
            : contentType.startsWith("video")
            ? "video"
            : assumedType || "other";

          return {
            id: itemRef.fullPath,
            url,
            type,
            name: itemRef.name,
            size: meta?.size ? Number(meta.size) : undefined,
            updated: meta?.updated || meta?.timeCreated || undefined,
          };
        })
      );

      out.push(...metas);

      // If you want to include subfolders, recurse here:
      // for (const p of listing.prefixes) { ... }

      return out;
    }

    (async () => {
      try {
        setLoading(true);
        setErr("");

        const [imgs, vids] = await Promise.all([
          listFolder(IMAGES_PATH, "image"),
          listFolder(VIDEOS_PATH, "video"),
        ]);

        if (!cancelled) {
          // newest first if timestamp exists
          const all = [...imgs, ...vids].sort((a, b) =>
            (b.updated || "").localeCompare(a.updated || "")
          );
          setMedia(all);
        }
      } catch (e) {
        if (!cancelled) setErr(e.message || "Failed to load from Firebase Storage");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="container">
      <h2 className="section-title">Gallery (Firebase ✅)</h2>

      <div style={{ display: "inline-flex", gap: 8, marginBottom: 16 }}>
        <button
          className="auth-primary"
          style={{ opacity: tab === "images" ? 1 : 0.7 }}
          onClick={() => setTab("images")}
        >
          Photos ({images.length})
        </button>
        <button
          className="auth-primary"
          style={{ opacity: tab === "videos" ? 1 : 0.7 }}
          onClick={() => setTab("videos")}
        >
          Videos ({videos.length})
        </button>
      </div>

      {loading && <p>Loading…</p>}
      {err && <div className="auth-error">{err}</div>}

      {!loading && !err && tab === "images" && (
        <div style={grid}>
          {images.map((img) => (
            <a key={img.id} href={img.url} target="_blank" rel="noreferrer" style={card}>
              <img src={img.url} alt={img.name} style={imgStyle} loading="lazy" />
            </a>
          ))}
          {images.length === 0 && <p>No photos yet.</p>}
        </div>
      )}

      {!loading && !err && tab === "videos" && (
        <div style={grid}>
          {videos.map((v) => (
            <div key={v.id} style={card}>
              <video
                src={v.url}
                controls
                preload="metadata"
                style={{ width: "100%", display: "block", borderRadius: 8 }}
              />
            </div>
          ))}
          {videos.length === 0 && <p>No videos yet.</p>}
        </div>
      )}
    </div>
  );
}

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 16,
  marginTop: 12,
};

const card = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 10,
  padding: 8,
  boxShadow: "0 4px 12px rgba(0,0,0,.06)",
};

const imgStyle = {
  width: "100%",
  height: 260,
  objectFit: "cover",
  display: "block",
  borderRadius: 8,
};
