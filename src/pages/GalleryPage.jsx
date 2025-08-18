import React, { useEffect, useState, useRef } from "react";

export default function GalleryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [raw, setRaw] = useState(null);
  const intervalRef = useRef(null);

  const fetchList = async () => {
    try {
      setErr("");
      setLoading(true);
      // cache-buster so CDN or any proxy won't give us stale JSON
      const res = await fetch(`/api/list?folder=public&_t=${Date.now()}`);
      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();

      // Basic sanity: ensure it's an array of {name, url}
      if (!Array.isArray(data)) {
        throw new Error("Unexpected response (not array). Check /api/list logs.");
      }

      setRaw(data);
      // Sort newest first by guessed filename/time if present; else stable sort by name
      const normalized = data
        .filter((x) => x && x.url)
        .sort((a, b) => (b.lastChanged || 0) - (a.lastChanged || 0));

      setItems(normalized);
      setLastRefresh(new Date());
    } catch (e) {
      console.error("Public list failed:", e);
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();

    // Auto-refresh every 30s so new uploads show up without reload
    intervalRef.current = setInterval(fetchList, 30 * 1000);
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="gallery-wrap" style={{ padding: "24px" }}>
      <h1 className="section-title" style={{ textAlign: "left" }}>Public Gallery</h1>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <button className="auth-primary" onClick={fetchList} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
        <button
          className="auth-primary"
          onClick={() => setShowDebug((v) => !v)}
          style={{ background: "#6a402a" }}
        >
          {showDebug ? "Hide debug" : "Show debug"}
        </button>
        <span style={{ color: "#666", fontSize: ".9rem" }}>
          {lastRefresh ? `Last refresh: ${lastRefresh.toLocaleTimeString()}` : "—"}
        </span>
        <span style={{ color: "#666", fontSize: ".9rem" }}>
          {items.length} file{items.length === 1 ? "" : "s"}
        </span>
      </div>

      {err && (
        <div className="auth-error" style={{ marginBottom: 16 }}>
          {err}
        </div>
      )}

      {/* Debug panel shows the raw JSON we got back */}
      {showDebug && (
        <pre
          style={{
            background: "#111",
            color: "#aef",
            padding: 12,
            borderRadius: 8,
            overflowX: "auto",
            marginBottom: 16,
            maxHeight: 300,
          }}
        >
{JSON.stringify(raw, null, 2)}
        </pre>
      )}

      {loading && items.length === 0 ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p>No files in <code>public/</code> yet.</p>
      ) : (
        <div className="gallery-grid">
          {items.map((m) => (
            <div key={m.url} className="gallery-item">
              {/\.(mp4|webm|mov|mkv)$/i.test(m.name) ? (
                <video
                  controls
                  src={`${m.url}?cb=${lastRefresh ? lastRefresh.getTime() : ""}`}
                  style={{ width: "100%", display: "block" }}
                />
              ) : (
                <img
                  src={`${m.url}?cb=${lastRefresh ? lastRefresh.getTime() : ""}`}
                  alt={m.name || "media"}
                  style={{ width: "100%", display: "block" }}
                  onError={(e) => {
                    // helpful hint if CDN path/casing is wrong
                    e.currentTarget.title = "Failed to load image. Check Bunny CDN URL and file path/case.";
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
