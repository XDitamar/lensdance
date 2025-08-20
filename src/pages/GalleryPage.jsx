// src/pages/GalleryPage.jsx
import React, { useEffect, useState } from 'react';
import { ref, listAll, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import '../style.css';

const GalleryPage = () => {
    const [mediaUrls, setMediaUrls] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all');

    const [modalOpen, setModalOpen] = useState(false);
    const [selectedMediaUrl, setSelectedMediaUrl] = useState('');

    useEffect(() => {
        const fetchMedia = async () => {
            try {
                const folderRef = ref(storage, 'MainGallery');
                const result = await listAll(folderRef);

                const urlPromises = result.items.map(imageRef => getDownloadURL(imageRef));
                const urls = await Promise.allSettled(urlPromises);

                const fulfilledUrls = urls
                    .filter(item => item.status === 'fulfilled')
                    .map(item => item.value);

                setMediaUrls(fulfilledUrls);
                setLoading(false);
            } catch (err) {
                console.error("Error fetching media:", err);
                setError("Failed to load media.");
                setLoading(false);
            }
        };

        fetchMedia();
    }, []);

    const filteredMediaUrls = mediaUrls.filter(url => {
        const fileExtension = url.split('?')[0].split('.').pop().toLowerCase();
        if (filter === 'images') {
            return ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExtension);
        }
        if (filter === 'videos') {
            return ['mp4', 'mov', 'avi', 'mkv'].includes(fileExtension);
        }
        return true;
    });

    const openModal = (url) => {
        setSelectedMediaUrl(url);
        setModalOpen(true);
    };

    const closeModal = () => {
        setSelectedMediaUrl('');
        setModalOpen(false);
    };

    if (loading) {
        return <div className="gallery-container loading">Loading media...</div>;
    }

    if (error) {
        return <div className="gallery-container error">{error}</div>;
    }

    if (filteredMediaUrls.length === 0) {
        return <div className="gallery-container no-media">No {filter === 'all' ? '' : filter} found.</div>;
    }

    return (
        <div className="gallery-container">
            <h1 className="gallery-title">Main Gallery</h1>
            <div className="gallery-buttons">
                <button onClick={() => setFilter('all')} className="filter-button">All</button>
                <button onClick={() => setFilter('images')} className="filter-button">Images</button>
                <button onClick={() => setFilter('videos')} className="filter-button">Videos</button>
            </div>
            <div className="gallery-grid">
                {filteredMediaUrls.map((url, index) => {
                    const fileExtension = url.split('?')[0].split('.').pop().toLowerCase();
                    const isVideo = ['mp4', 'mov', 'avi', 'mkv'].includes(fileExtension);
                    
                    return (
                        <div key={index} className="gallery-item" onClick={() => openModal(url)}>
                            {isVideo ? (
                                <video src={url} className="gallery-item-media" />
                            ) : (
                                <img src={url} alt={`Gallery item ${index + 1}`} className="gallery-item-media" />
                            )}
                        </div>
                    );
                })}
            </div>

            {modalOpen && (
                <div className="media-modal">
                    <div className="media-modal-content">
                        <button className="modal-close-button" onClick={closeModal}>&times;</button>
                        {selectedMediaUrl.split('?')[0].split('.').pop().toLowerCase().match(/(mp4|mov|avi|mkv)$/i) ? (
                            <video src={selectedMediaUrl} controls className="modal-media" />
                        ) : (
                            <img src={selectedMediaUrl} alt="Enlarged Media" className="modal-media" />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default GalleryPage;