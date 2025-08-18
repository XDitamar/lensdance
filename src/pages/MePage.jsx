import React, { useEffect, useState } from "react";
import { auth } from "../firebase";

export default function MePage() {
  const [media, setMedia] = useState([]);

  useEffect(() => {
    (async () => {
      const user = auth.currentUser;
      if (!user) return; // show login prompt elsewhere if you want
      const token = await user.getIdToken();
      const r = await fetch("/api/list?folder=me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      setMedia(data);
    })().catch(console.error);
  }, []);

  return (
    <main className="gallery-wrap">
      <h1>My Gallery</h1>
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
