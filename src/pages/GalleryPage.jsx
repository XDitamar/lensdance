import React, { useEffect, useState } from "react";

export default function GalleryPage() {
  const [media, setMedia] = useState([]);

  useEffect(() => {
    fetch("/api/list?folder=public")
      .then((r) => r.json())
      .then(setMedia)
      .catch((e) => console.error("Public list failed:", e));
  }, []);

  return (
    <main className="gallery-wrap">
      <h1>Public Gallery</h1>
      <div className="gallery-grid">
        {media.map((m) => (
          <div key={m.url} className="gallery-item">
            {/\.(mp4|webm|mov|mkv)$/i.test(m.name) ? (
              <video controls src={m.url} />
            ) : (
              <img src={m.url} alt={m.name} />
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
