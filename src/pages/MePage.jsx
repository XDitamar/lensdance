// src/pages/MePage.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { auth, storage } from "../firebase";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import '../style.css'; 

export default function MePage() {
    const [mediaItems, setMediaItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [filter, setFilter] = useState('all');
    const user = auth.currentUser;

    // --- Fetch Media from User's Folder ---
    const fetchMedia = async () => {
        if (!user) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError("");
            
            // Sanitize the email to get the correct folder name
            const sanitizedEmail = user.email.replace(/[.#$[\]]/g, '_');
            const userFolderRef = ref(storage, sanitizedEmail);
            
            const res = await listAll(userFolderRef);

            const mediaPromises = res.items.map(async (itemRef) => {
                // Ignore the placeholder file
                if (itemRef.name === '.placeholder') {
                    return null; 
                }
                const url = await getDownloadURL(itemRef);
                return {
                    id: itemRef.fullPath,
                    url,
                    name: itemRef.name,
                    type: itemRef.name.split('.').pop()
                };
            });

            const mediaData = await Promise.all(mediaPromises);
            // Filter out any null values from the placeholder
            setMediaItems(mediaData.filter(item => item !== null));
            setLoading(false);
        } catch (e) {
            console.error(e);
            setError("Failed to load your private gallery.");
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMedia();
    }, [user]);

    const filteredMediaItems = mediaItems.filter(item => {
        const fileExtension = item.type.toLowerCase();
        if (filter === 'images') {
            return ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExtension);
        }
        if (filter === 'videos') {
            return ['mp4', 'mov', 'avi', 'mkv'].includes(fileExtension);
        }
        return true;
    });

    // --- UI Guards ---
    if (loading) {
        return <div className="container" style={{ textAlign: "center" }}><p>Loading your gallery...</p></div>;
    }

    if (!user) {
        return (
            <main className="container" style={{ textAlign: "center" }}>
                <h2 className="section-title">My Gallery</h2>
                <p>You're not logged in.</p>
                <Link className="auth-primary" to="/login">Log in to view your pics</Link>
            </main>
        );
    }

    if (error) {
        return (
            <main className="container" style={{ textAlign: "center" }}>
                <h2 className="section-title">My Gallery</h2>
                <p>{error}</p>
            </main>
        );
    }

    return (
        <main className="container">
            <h2 className="section-title">My Gallery</h2>
            
            {/* Filter buttons */}
            <div className="gallery-buttons">
                <button onClick={() => setFilter('all')} className="filter-button">All</button>
                <button onClick={() => setFilter('images')} className="filter-button">Images</button>
                <button onClick={() => setFilter('videos')} className="filter-button">Videos</button>
            </div>
            
            {/* Gallery Grid */}
            <div className="gallery-grid">
                {filteredMediaItems.length > 0 ? (
                    filteredMediaItems.map((m) => (
                        <div key={m.id} className="gallery-item">
                            {m.type.match(/(mp4|mov|avi|mkv)$/i) ? (
                                <video controls src={m.url} className="gallery-item-media" />
                            ) : (
                                <img src={m.url} alt="user media" className="gallery-item-media" />
                            )}
                            <a href={m.url} download={m.name} className="download-button" style={{ marginTop: '10px' }}>Download</a>
                        </div>
                    ))
                ) : (
                    <p style={{ marginTop: 20, color: "#666" }}>
                        No {filter === 'all' ? '' : filter} found in your gallery.
                    </p>
                )}
            </div>
        </main>
    );
}