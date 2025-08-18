import React, { useEffect, useState } from "react";

export default function GalleryPage() {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/list?folder=public") // change to 'me' if you want user's private gallery
      .then((r) => r.json())
      .then((data) => {
        setMedia(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Gallery fetch error:", err);
        setLoading(false);
      });
  }, []);

  if (loading) return <p>Loading gallery…</p>;

  return (
    <main className="gallery-wrap">
      <h1>Public Gallery</h1>
      <div className="gallery-grid">
        {media.map((m) => (
          <div key={m.url} className="gallery-item">
            {/\.(mp4|webm|mov|mkv)$/i.test(m.name) ? (
              <video controls src={m.url}></video>
            ) : (
              <img src={m.url} alt={m.name} />
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
