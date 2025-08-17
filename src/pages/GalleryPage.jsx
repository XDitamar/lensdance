import React, { useEffect, useState } from "react";

export default function GalleryPage() {
  const [media, setMedia] = useState([]);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_BASE}/media`)
      .then((res) => res.json())
      .then(setMedia)
      .catch(console.error);
  }, []);

  return (
    <main className="gallery-wrap">
      <h1>Public Gallery</h1>
      <div className="gallery-grid">
        {media.map((m) => (
          <div key={m.id} className="gallery-item">
            {m.type.startsWith("video") ? (
              <video controls src={m.url}></video>
            ) : (
              <img src={m.url} alt="gallery" />
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
