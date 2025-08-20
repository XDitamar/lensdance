// src/pages/AdminPage.jsx
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { auth, storage } from "../firebase"; // Import storage
import { ref, listAll, getDownloadURL, uploadBytes, deleteObject } from "firebase/storage";
import '../style.css'; // Assuming you have this file for styling

const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL || "lensdance29@gmail.com";

export default function AdminPage() {
    const [userFolders, setUserFolders] = useState([]);
    const [currentFolder, setCurrentFolder] = useState(null);
    const [mediaItems, setMediaItems] = useState([]);
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const inputRef = useRef(null);

    const user = auth.currentUser;
    const isAdmin = !!user && user.email === ADMIN_EMAIL;

    // --- Fetch User Folders from Storage ---
    const fetchUserFolders = async () => {
        try {
            setError("");
            const listRef = ref(storage, '/');
            const res = await listAll(listRef);
            
            const folders = res.prefixes.map(folderRef => folderRef.name);
            setUserFolders(folders);
        } catch (e) {
            console.error(e);
            setError("Failed to load user folders.");
        }
    };

    // --- Fetch Media from a Specific Folder ---
    const fetchMediaInFolder = async (folderName) => {
        try {
            setBusy(true);
            setError("");
            const folderRef = ref(storage, folderName);
            const res = await listAll(folderRef);
            
            const mediaPromises = res.items.map(async (itemRef) => {
                const url = await getDownloadURL(itemRef);
                return {
                    id: itemRef.fullPath,
                    url,
                    type: itemRef.name.split('.').pop()
                };
            });

            const mediaData = await Promise.all(mediaPromises);
            setMediaItems(mediaData);
            setBusy(false);
        } catch (e) {
            console.error(e);
            setError("Failed to load media for this folder.");
            setBusy(false);
        }
    };

    useEffect(() => {
        if (isAdmin) {
            fetchUserFolders();
        }
    }, [isAdmin]);

    // --- Actions ---
    const upload = async () => {
        if (!file || !currentFolder) return;

        try {
            setBusy(true);
            setError("");
            
            const fileRef = ref(storage, `${currentFolder}/${file.name}`);
            await uploadBytes(fileRef, file);

            setFile(null);
            if (inputRef.current) inputRef.current.value = "";
            await fetchMediaInFolder(currentFolder);
        } catch (e) {
            console.error(e);
            setError("Upload failed.");
            alert("Upload failed: " + e.message);
        } finally {
            setBusy(false);
        }
    };

    const del = async (fullPath) => {
        if (!window.confirm("Delete this item?")) return;

        try {
            setBusy(true);
            setError("");
            
            const fileRef = ref(storage, fullPath);
            await deleteObject(fileRef);

            await fetchMediaInFolder(currentFolder);
        } catch (e) {
            console.error(e);
            setError("Delete failed.");
            alert("Delete failed: " + e.message);
        } finally {
            setBusy(false);
        }
    };

    // --- UI ---
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

            {/* Folder Selection */}
            {!currentFolder ? (
                <div>
                    <h3 style={{ marginBottom: '15px' }}>Select a User Gallery:</h3>
                    <div className="gallery-grid">
                        {userFolders.map(folder => (
                            <button
                                key={folder}
                                className="filter-button"
                                onClick={() => {
                                    setCurrentFolder(folder);
                                    fetchMediaInFolder(folder);
                                }}
                            >
                                {folder}
                            </button>
                        ))}
                    </div>
                    {userFolders.length === 0 && !busy && !error && <p>No user galleries found.</p>}
                    {error && <div className="auth-error">{error}</div>}
                </div>
            ) : (
                <div>
                    <h3 style={{ marginBottom: '10px' }}>
                        Viewing: <span style={{ color: 'var(--brown-600)' }}>{currentFolder}</span>
                    </h3>
                    <button className="filter-button" onClick={() => {
                        setCurrentFolder(null);
                        setMediaItems([]);
                        fetchUserFolders();
                    }}>
                        Back to Folders
                    </button>

                    {/* Upload card */}
                    <div
                        style={{
                            background: "#fff",
                            border: "1px solid #e9e9e9",
                            borderRadius: 12,
                            padding: 16,
                            marginBottom: 20,
                            marginTop: 20,
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
                        {mediaItems.map((m) => (
                            <div key={m.id} className="gallery-item">
                                {m.type.match(/(mp4|mov|avi|mkv)$/i) ? (
                                    <video controls src={m.url} className="gallery-item-media" />
                                ) : (
                                    <img src={m.url} alt="admin media" className="gallery-item-media" />
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
                    {mediaItems.length === 0 && (
                        <p style={{ marginTop: 20, color: "#666" }}>No media in this gallery.</p>
                    )}
                </div>
            )}
        </main>
    );
}