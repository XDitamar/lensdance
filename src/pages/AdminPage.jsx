import React, { useState, useEffect } from "react";
import { auth } from "../firebase";

const ADMIN_EMAIL = "lensdance29@gmail.com";

export default function AdminPage() {
  const [media, setMedia] = useState([]);
  const [file, setFile] = useState(null);

  const fetchMedia = () => {
    fetch(`${process.env.REACT_APP_API_BASE}/media`)
      .then((res) => res.json())
      .then(setMedia)
      .catch(console.error);
  };

  useEffect(() => {
    fetchMedia();
  }, []);

  const upload = async () => {
    if (!file) return;
    const user = auth.currentUser;
    if (!user || user.email !== ADMIN_EMAIL) {
      alert("Not authorized");
      return;
    }
    const token = await user.getIdToken();
    const form = new FormData();
    form.append("file", file);

    await fetch(`${process.env.REACT_APP_API_BASE}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    setFile(null);
    fetchMedia();
  };

  const del = async (id) => {
    const user = auth.currentUser;
    if (!user || user.email !== ADMIN_EMAIL) return;
    const token = await user.getIdToken();
    await fetch(`${process.env.REACT_APP_API_BASE}/media/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchMedia();
  };

  const user = auth.currentUser;
  if (!user || user.email !== ADMIN_EMAIL) {
    return <p>Not authorized</p>;
  }

  return (
    <main className="admin-wrap">
      <h1>Admin Panel</h1>
      <input type="file" onChange={(e) => setFile(e.target.files[0])} />
      <button onClick={upload}>Upload</button>

      <div className="gallery-grid">
        {media.map((m) => (
          <div key={m.id} className="gallery-item">
            {m.type.startsWith("video") ? (
              <video controls src={m.url}></video>
            ) : (
              <img src={m.url} alt="admin media" />
            )}
            <button className="del-btn" onClick={() => del(m.id)}>Delete</button>
          </div>
        ))}
      </div>
    </main>
  );
}
