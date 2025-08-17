import React, { useEffect, useState } from "react";
import { auth } from "../firebase";

export default function MePage() {
  const [media, setMedia] = useState([]);

  useEffect(() => {
    const fetchMedia = async () => {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch(`${process.env.REACT_APP_API_BASE}/media?user=${user.uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMedia(data);
    };
    fetchMedia();
  }, []);

  return (
    <main className="gallery-wrap">
      <h1>My Gallery</h1>
      <div className="gallery-grid">
        {media.map((m) => (
          <div key={m.id} className="gallery-item">
            {m.type.startsWith("video") ? (
              <video controls src={m.url}></video>
            ) : (
              <img src={m.url} alt="my media" />
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
