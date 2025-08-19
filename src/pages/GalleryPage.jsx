// src/pages/GalleryPage.jsx
import React, { useEffect, useState } from "react";

export default function GalleryPage() {
  const [media, setMedia] = useState([]);
  const [tab, setTab] = useState("images");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr("");
        // ✅ Call your serverless API (make sure /api/media exists)
        const r = await fetch("/api/media");
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json();
        console.log("Fetched media ✅", data); // debug in DevTools
        setMedia(data);
      } catch (e) {
        setErr(e.message || "Failed to load media");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const images = media.filter((m) => m.type === "image");
  const videos = media.filter((m) => m.type === "video");

  return (
    <div className="container">
      <h2 className="section-title">Gallery (Testing 1 build ✅)</h2>

      {/* Tabs */}
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
            <a
              key={img.id}
              href={img.url}
              target="_blank"
              rel="noreferrer"
              style={card}
            >
              <img
                src={img.url}
                alt={img.name}
                style={imgStyle}
                loading="lazy"
              />
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