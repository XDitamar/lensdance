// src/pages/AdminPage.jsx
import React, { useState, useEffect } from "react";
import { auth } from "../firebase";

const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL || "lensdance29@gmail.com";

export default function AdminPage() {
  const [media, setMedia] = useState([]);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch media list
  const fetchMedia = async () => {
    try {
      const res = await fetch("/api/media");
      const data = await res.json();
      setMedia(data);
    } catch (err) {
      console.error("Failed to fetch media", err);
    }
  };

  useEffect(() => {
    fetchMedia();
  }, []);

  // Upload file to Bunny via API
  const upload = async () => {
    if (!file) return;
    const user = auth.currentUser;
    if (!user || user.email !== ADMIN_EMAIL) {
      alert("Not authorized");
      return;
    }

    try {
      setLoading(true);
      const token = await user.getIdToken();
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      setFile(null);
      await fetchMedia();
    } catch (err) {
      console.error("Upload error:", err);
      alert("Upload failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete media
  const del = async (id) => {
    const user = auth.currentUser;
    if (!user || user.email !== ADMIN_EMAIL) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/media/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      await fetchMedia();
    } catch (err) {
      console.error("Delete error:", err);
      alert("Delete failed: " + err.message);
    }
  };

  // Check if logged in as admin
  const user = auth.currentUser;
  if (!user || user.email !== ADMIN_EMAIL) {
    return <p style={{ padding: 40 }}>Not authorized</p>;
  }

  return (
    <main className="admin-wrap container">
      <h1 className="section-title">Admin Panel</h1>

      {/* Upload controls */}
      <div style={{ marginBottom: 20 }}>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files[0])}
          accept="image/*,video/*"
        />
        <button
          className="auth-primary"
          onClick={upload}
          disabled={!file || loading}
          style={{ marginLeft: 10 }}
        >
          {loading ? "Uploading..." : "Upload"}
        </button>
      </div>

      {/* Gallery */}
      <div className="gallery-grid">
        {media.map((m) => (
          <div key={m.id} className="gallery-item">
            {m.type?.startsWith("video") ? (
              <video controls src={m.url} style={{ width: "100%" }} />
            ) : (
              <img src={m.url} alt="admin media" style={{ width: "100%" }} />
            )}
            <button
              className="auth-primary"
              style={{ marginTop: 10 }}
              onClick={() => del(m.id)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
