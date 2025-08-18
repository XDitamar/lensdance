// src/pages/AdminPage.jsx
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../firebase";

const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL || "lensdance29@gmail.com";

export default function AdminPage() {
  const [media, setMedia] = useState([]);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const user = auth.currentUser;
  const isAdmin = !!user && user.email === ADMIN_EMAIL;

  // ---------- Data ----------
  const fetchMedia = async () => {
    try {
      setError("");
      const res = await fetch("/api/media");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMedia(data);
    } catch (e) {
      setError(e.message || "Failed to load media");
    }
  };

  useEffect(() => {
    fetchMedia();
  }, []);

  // ---------- Actions ----------
  const upload = async () => {
    if (!file) return;
    if (!user) {
      alert("Please log in first.");
      return;
    }
    if (!isAdmin) {
      alert("Not authorized");
      return;
    }

    try {
      setBusy(true);
      setError("");

      const token = await user.getIdToken();
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) throw new Error(await res.text());

      // Reset input so same filename can be selected again
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await fetchMedia();
    } catch (e) {
      console.error(e);
      setError(e.message || "Upload failed");
      alert("Upload failed: " + (e.message || "Unknown error"));
    } finally {
      setBusy(false);
    }
  };

  const del = async (id) => {
    if (!user || !isAdmin) return;
    if (!window.confirm("Delete this item?")) return;

    try {
      setBusy(true);
      setError("");

      const token = await user.getIdToken();
      const res = await fetch(`/api/media/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(await res.text());
      await fetchMedia();
    } catch (e) {
      console.error(e);
      setError(e.message || "Delete failed");
      alert("Delete failed: " + (e.message || "Unknown error"));
    } finally {
      setBusy(false);
    }
  };

  // ---------- Guards / UI ----------
  if (!user) {
    return (
      <main className="container" style={{ textAlign: "center" }}>
        <h2 className="section-title">Admin Panel</h2>
        <p>You’re not logged in.</p>
        <Link className="auth-primary" to="/login">Log in</Link>
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

      {/* Upload card */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e9e9e9",
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
          boxShadow: "0 4px 12px rgba(0,0,0,.06)",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          <button
            className="auth-primary"
            onClick={upload}
            disabled={!file || busy}
          >
            {busy ? "Uploading..." : "Upload"}
          </button>

          {file && (
            <span style={{ fontSize: ".9rem", color: "#555" }}>
              Selected: <strong>{file.name}</strong> ({Math.round(file.size / 1024)} KB)
            </span>
          )}
        </div>

        {error && (
          <div className="auth-error" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}
      </div>

      {/* Gallery */}
      <div className="gallery-grid">
        {media.map((m) => (
          <div key={m.id} className="gallery-item">
            {m.type?.startsWith("video") ? (
              <video controls src={m.url} style={{ width: "100%", display: "block" }} />
            ) : (
              <img src={m.url} alt="admin media" style={{ width: "100%", display: "block" }} />
            )}

            <button
              className="auth-primary"
              style={{ marginTop: 10 }}
              onClick={() => del(m.id)}
              disabled={busy}
            >
              {busy ? "Working..." : "Delete"}
            </button>
          </div>
        ))}
      </div>

      {media.length === 0 && (
        <p style={{ marginTop: 20, color: "#666" }}>No media yet — upload something above.</p>
      )}
    </main>
  );
}
