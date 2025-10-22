// src/pages/GalleryPage.jsx
import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";
import "../style.css";

/* ---------------------------------------------
 * iOS video priming
 * ---------------------------------------------- */
let __videosPrimed = false;
function isLikelyIOS() {
	if (typeof navigator === "undefined") return false;
	const ua = navigator.userAgent || "";
	const isiOSDevice =
		/iP(hone|od|ad)/.test(ua) ||
		(/Mac/.test(ua) && typeof window !== "undefined" && "ontouchend" in window);
	return isiOSDevice;
}
function primeIOSVideosOnce() {
	if (__videosPrimed || !isLikelyIOS()) return;
	__videosPrimed = true;
	const vids = document.querySelectorAll('video[data-prime="1"]');
	vids.forEach((v) => {
		try {
			v.muted = true;
			v.playsInline = true;
			const p = v.play();
			if (p && typeof p.then === "function") {
				p.then(() => v.pause()).catch(() => {});
			} else {
				v.pause();
			}
		} catch {}
	});
}
if (typeof window !== "undefined") {
	const handler = () => {
		primeIOSVideosOnce();
		window.removeEventListener("touchstart", handler, true);
		window.removeEventListener("pointerdown", handler, true);
		window.removeEventListener("click", handler, true);
	};
	window.addEventListener("touchstart", handler, true);
	window.addEventListener("pointerdown", handler, true);
	window.addEventListener("click", handler, true);
}

/* ---------- config ---------- */
const USE_FIREBASE = true;
const ITEMS_PER_PAGE = 6;

/* ---------------------------------------------
 * Media utils
 * ---------------------------------------------- */
const extFromName = (name = "") => (name.split(".").pop() || "").toLowerCase();
const isImageExt = (e = "") =>
	["png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "avif", "svg"].includes((e || "").toLowerCase());
const isVideoExt = (e = "") => ["mp4", "mov", "avi", "mkv", "webm"].includes((e || "").toLowerCase());

// Helper to construct the path to a smaller thumbnail
// ASSUMPTION: Thumbnails are stored in a subfolder named 'thumbs' inside 'MainGallery'.
const getThumbRefPath = (fullPath) => {
    if (fullPath.startsWith("MainGallery/") && !fullPath.startsWith("MainGallery/thumbs/")) {
        const parts = fullPath.split('/');
        parts.splice(1, 0, 'thumbs'); 
        return parts.join('/');
    }
    return fullPath;
};

// **STRICT PATTERN ENFORCEMENT** // This function ensures the pattern is exactly [wide, half, half] regardless of item aspect ratio.
const applyPattern = (items) => {
	let out = [];
	let i = 0;
	const len = items.length;
	while (i < len) {
		const item = items[i];
		// 1st position (0, 3, 6, ...) is always 'wide'
		if (i % 3 === 0) {
			out.push({ ...item, variant: "wide" });
			i++;
		} else {
			// 2nd and 3rd positions are always 'half'
			out.push({ ...item, variant: "half" });
			if (i + 1 < len) {
				const nextItem = items[i+1];
				out.push({ ...nextItem, variant: "half" }); 
			}
			i += 2;
		}
	}
	return out;
}

/* ---------------------------------------------
 * Orientation inference (Removed as it is no longer used for strict patterning)
 * ---------------------------------------------- */

/* ---------- Lazy tile (loads only when in view) ---------- */
const LazyMedia = React.memo(function LazyMedia({ url, alt, isVideo, variant, onClick, lqipUrl }) {
	const [inView, setInView] = useState(false);
	// **PERCEIVED SPEED**: Default loaded to true if no lqipUrl is provided, avoiding an extra render cycle.
	const [loaded, setLoaded] = useState(!lqipUrl); 
	const mediaRef = useRef(null);
	const videoRef = useRef(null);

	useEffect(() => {
		const obs = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setInView(true);
					obs.disconnect();
					if (videoRef.current && isLikelyIOS()) {
						try {
							videoRef.current.load();
						} catch {}
					}
				}
			},
			{ rootMargin: "200px" }
		);
		if (mediaRef.current) obs.observe(mediaRef.current);
		return () => obs.disconnect();
	}, []);
	
	const handleImageLoad = useCallback(() => {
		setLoaded(true);
	}, []);

	return (
		<div
			ref={mediaRef}
			className={`tile ${variant}`}
			onClick={onClick}
			role="button"
			tabIndex={0}
			onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick?.())}
			style={{ position: 'relative', overflow: 'hidden' }}
		>
			{inView ? (
				isVideo ? (
					<video
						ref={videoRef}
						className="tile-media"
						src={url} // THUMBNAIL/GRID URL for videos too
						preload={isLikelyIOS() ? "auto" : "metadata"}
						playsInline
						muted
						controls={false}
						data-prime="1"
					/>
				) : (
					<>
						{/* 1. Low-Quality Placeholder (LQIP) - Only show if not loaded and we have an LQIP source */}
						{!loaded && lqipUrl && (
							<img
								src={lqipUrl}
								alt={`Placeholder for ${alt}`}
								className="tile-media lqip"
								aria-hidden="true"
								style={{
									filter: 'blur(10px)',
									transition: 'opacity 0.5s',
									opacity: 1,
									position: 'absolute',
									top: 0,
									left: 0,
									width: '100%',
									height: '100%',
									objectFit: 'cover',
								}}
							/>
						)}
						{/* 2. High-Resolution Image (Thumbnail for grid) */}
						<img
							src={url} 
							alt={alt}
							className="tile-media"
							loading="lazy"
							decoding="async"
							fetchpriority="low"
							onLoad={handleImageLoad}
							style={{
								position: 'absolute',
								top: 0,
								left: 0,
								width: '100%',
								height: '100%',
								objectFit: 'cover',
								transition: 'opacity 0.5s',
								opacity: loaded ? 1 : 0, 
							}}
						/>
					</>
				)
			) : (
				<div className="placeholder" />
			)}
		</div>
	);
});


/* ---------- Page ---------- */
export default function GalleryPage() {
	// unified shape: { name, fullPath, ext, source: "firebase", url: FullResUrl, gridUrl: ThumbUrl/FullRes, isVideo, variant: "wide"|"half", lqipUrl }
	const [allRefs, setAllRefs] = useState([]);
	const [loadingList, setLoadingList] = useState(true);
	const [error, setError] = useState("");

	// UI state
	const [filter, setFilter] = useState("all"); 
	const [modalOpen, setModalOpen] = useState(false);
	const [selectedItem, setSelectedItem] = useState(null); 

	// pagination
	const [currentPage, setCurrentPage] = useState(1);
	const urlCache = useRef(new Map());

	// preconnect to Storage & origin
	useEffect(() => {
		const link1 = document.createElement("link");
		link1.rel = "preconnect";
		link1.href = "https://firebasestorage.googleapis.com";
		link1.crossOrigin = "anonymous";
		document.head.appendChild(link1);

		const link2 = document.createElement("link");
		link2.rel = "preconnect";
		link2.href = window.location.origin;
		link2.crossOrigin = "anonymous";
		document.head.appendChild(link2);

		return () => {
			document.head.removeChild(link1);
			document.head.removeChild(link2);
		};
	}, []);

	// 1) List refs once (Firebase ONLY) - Uses THUMBNAIL URL for grid performance
	useEffect(() => {
		const run = async () => {
			try {
				setLoadingList(true);
				let firebaseRefs = [];

				if (USE_FIREBASE) {
					try {
						const folderRef = ref(storage, "MainGallery");
						const res = await listAll(folderRef);
						
						firebaseRefs = await Promise.all(res.items.map(async (r) => {
							const name = r.name;
							const fullPath = r.fullPath;
							if (fullPath.includes('/thumbs')) return null; // Skip thumb files
                            
							const ext = extFromName(name);
							const isVid = isVideoExt(ext);
							
							// 1. Get FULL URL (needed for modal)
							// Get the download URL once and cache it.
							const fullResUrl = urlCache.current.get(fullPath) || await getDownloadURL(r).catch(() => null);
							if (!fullResUrl) return null;
							urlCache.current.set(fullPath, fullResUrl); 
							
							let gridDisplayUrl = fullResUrl; 
							let lqipUrl = undefined;
                            
							// 2. Get THUMBNAIL URL for grid/lqip (if image)
							if (!isVid) {
								const thumbPath = getThumbRefPath(fullPath);
								const thumbRef = ref(storage, thumbPath); 
								
								// Try to fetch the thumbnail URL
								const thumbUrl = urlCache.current.get(thumbPath) || await getDownloadURL(thumbRef).catch(() => null);
								
								if (thumbUrl) {
									urlCache.current.set(thumbPath, thumbUrl); 
									gridDisplayUrl = thumbUrl;
									lqipUrl = thumbUrl; // Use the small thumbnail as the LQIP
								} else {
                                    // If no thumbnail, use the full image for LQIP/Grid (slower fallback)
                                    lqipUrl = fullResUrl;
                                }
							} else {
                                // For videos, use the full URL for the grid view, but don't set lqipUrl
                                lqipUrl = undefined; 
                            }
                            
							// **PATTERN OPTIMIZATION**: No longer inferring variant from size. 
                            // This item's aspect ratio will be ignored in favor of the strict pattern.
							const variant = "wide"; // Placeholder variant, will be overwritten by applyPattern

							return { 
								name, 
								fullPath, 
								ext, 
								source: "firebase", 
								url: fullResUrl, 
								gridUrl: gridDisplayUrl, 
								isVideo: isVid, 
								variant: variant, 
								lqipUrl 
							};
						}));
						firebaseRefs = firebaseRefs.filter(Boolean);
					} catch (fe) {
						console.error("Firebase listing failed:", fe);
						setError("טעינת גלריית Firebase נכשלה.");
					}
				}

				setAllRefs(firebaseRefs);
			} catch (e) {
				console.error(e);
				setError("אירעה שגיאה בטעינת המדיה.");
			} finally {
				setLoadingList(false);
			}
		};
		run();
	}, []); 

	// 2) Filter at ref-level
	const filteredRefs = useMemo(() => {
		return allRefs.filter((r) => {
			const img = isImageExt(r.ext);
			const vid = isVideoExt(r.ext);
			if (filter === "images") return img;
			if (filter === "videos") return vid;
			return img || vid;
		});
	}, [allRefs, filter]);

	// reset to page 1 when filter/length changes
	useEffect(() => setCurrentPage(1), [filter, filteredRefs.length]);

	// 3) Page refs only
	const totalPages = Math.ceil(filteredRefs.length / ITEMS_PER_PAGE) || 1;
	const pageRefs = useMemo(() => {
		const start = (currentPage - 1) * ITEMS_PER_PAGE;
		return filteredRefs.slice(start, start + ITEMS_PER_PAGE);
	}, [filteredRefs, currentPage]);

	// 4) Map pageRefs to pageItems (NOW SYNCHRONOUS/INSTANTANEOUS)
	const [pageItems, setPageItems] = useState([]); 
	const [loadingPage, setLoadingPage] = useState(true);

	useEffect(() => {
		// This runs synchronously because all URL fetching and analysis was done in step [1].
		setLoadingPage(true);
		const items = pageRefs.map(r => ({
			...r,
			isVideo: isVideoExt(r.ext),
		}));

		setPageItems(items);
		setLoadingPage(false);

	}, [pageRefs]);

	// 5) Prefetch NEXT page originals (FULL RES)
	useEffect(() => {
		if (currentPage >= totalPages) return;
		const start = currentPage * ITEMS_PER_PAGE;
		const nextRefs = filteredRefs.slice(start, start + ITEMS_PER_PAGE);

		const idle = (cb) =>
			(window.requestIdleCallback
				? window.requestIdleCallback(cb, { timeout: 1200 })
				: setTimeout(cb, 300));

		const token = idle(async () => {
			for (const r of nextRefs) {
				// Only prefetch the FULL URL if we don't already have it cached
				if (urlCache.current.has(r.fullPath)) continue; 

				try {
					const u = await getDownloadURL(ref(storage, r.fullPath));
					urlCache.current.set(r.fullPath, u);
					if (isImageExt(r.ext)) {
						const img = new Image();
						img.decoding = "async";
						img.loading = "eager";
						img.referrerPolicy = "no-referrer";
						img.src = u; // Prefetch full image for modal
					}
				} catch {
					// ignore
				}
			}
		});

		return () => {
			if (window.cancelIdleCallback && typeof token === "number") {
				window.cancelIdleCallback(token);
			} else {
				clearTimeout(token);
			}
		};
	}, [currentPage, totalPages, filteredRefs]);

	// 6) Background warm ALL images
	// (Keeping this for long-session performance, unchanged from previous version)
    useEffect(() => {
		if (!filteredRefs.length) return;

		const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
		if (c?.saveData || /2g/.test(c?.effectiveType || "")) return;

		let aborted = false;
		const CHUNK = 24;

		const idle = (cb) =>
			(window.requestIdleCallback
				? window.requestIdleCallback(cb, { timeout: 1500 })
				: setTimeout(cb, 300));

		const warmChunk = async (refsChunk) => {
			const urls = (
				await Promise.all(
					refsChunk.map(async (r) => {
						if (!isImageExt(r.ext)) return null;

						const path = r.gridUrl ? getThumbRefPath(r.fullPath) : r.fullPath;
						const urlToWarm = r.gridUrl || r.url;
						
						if (urlCache.current.has(path) || urlCache.current.has(r.fullPath)) return urlToWarm;
						
						try {
							const u = await getDownloadURL(ref(storage, path));
							urlCache.current.set(path, u);
							return u;
						} catch {
							return null;
						}
					})
				)
			).filter(Boolean);

			if (!urls.length) return;

			if (navigator.serviceWorker?.controller) {
				navigator.serviceWorker.controller.postMessage({ type: "WARM_CACHE", urls });
			}

			for (const u of urls) {
				if (aborted) break;
				const img = new Image();
				img.decoding = "async";
				img.loading = "eager";
				img.referrerPolicy = "no-referrer";
				img.src = u;
				await new Promise((r) => setTimeout(r, 40));
			}
		};

		const chunks = [];
		for (let i = 0; i < filteredRefs.length; i += CHUNK) {
			chunks.push(filteredRefs.slice(i, i + CHUNK));
		}

		let i = 0;
		const pump = () => {
			if (aborted || i >= chunks.length) return;
			warmChunk(chunks[i++]).finally(() => idle(pump));
		};

		const token = idle(pump);
		return () => {
			aborted = true;
			if (window.cancelIdleCallback && typeof token === "number") {
				window.cancelIdleCallback(token);
			} else {
				clearTimeout(token);
			}
		};
	}, [filteredRefs]);


	// 7) Pattern for current page (Applies the STRICT pattern)
	const patternedPageItems = useMemo(() => applyPattern(pageItems), [pageItems]);

	const openModal = useCallback((item) => {
		setSelectedItem(item);
		setModalOpen(true);
	}, []);
	const closeModal = useCallback(() => {
		setSelectedItem(null);
		setModalOpen(false);
	}, []);

	useEffect(() => {
		if (!modalOpen) return;
		const onKey = (e) => e.key === "Escape" && closeModal();
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [modalOpen, closeModal]);

	// UI states
	if (loadingList) return <div className="gallery-container loading">טוען מדיה…</div>;
	if (error) return <div className="gallery-container error">{error}</div>;
	if (filteredRefs.length === 0)
		return (
			<div className="gallery-container no-media">
				{filter === "images" ? "לא נמצאו תמונות." : filter === "videos" ? "לא נמצאו סרטונים." : "לא נמצאו פריטים."}
			</div>
		);

	return (
		<div className="gallery-container">
			<h1 className="gallery-title">הגלריה הראשית</h1>

			<div className="gallery-buttons">
				<button onClick={() => setFilter("all")} className={`filter-button ${filter === "all" ? "active" : ""}`}>
					הכל
				</button>
				<button onClick={() => setFilter("images")} className={`filter-button ${filter === "images" ? "active" : ""}`}>
					תמונות
				</button>
				<button onClick={() => setFilter("videos")} className={`filter-button ${filter === "videos" ? "active" : ""}`}>
					סרטונים
				</button>
			</div>

			{/* Grid: current page only */}
			<div className="gallery-grid collage">
				{loadingPage
					? Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
							<div key={i} className={`tile ${i % 3 === 0 ? "wide" : "half"}`}>
								<div className="placeholder" />
							</div>
						))
					: patternedPageItems.map((m) => (
							<LazyMedia
								key={m.fullPath}
								url={m.gridUrl} // <-- Uses the smallest available image/video for the grid
								alt={m.name}
								isVideo={m.isVideo}
								variant={m.variant} // <-- Strictly "wide" or "half"
								lqipUrl={m.lqipUrl} 
								onClick={() => openModal(m)}
							/>
						))}
			</div>

			{/* Pagination (centered) */}
			{totalPages > 1 && (
				<div className="pagination-row">
					<div className="pagination" style={{ direction: "ltr" }}>
						{Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
							<button
								key={num}
								className={`page-btn ${currentPage === num ? "active" : ""}`}
								onClick={() => setCurrentPage(num)}
								aria-current={currentPage === num ? "page" : undefined}
								style={{
									background: currentPage === num ? "#6A402A" : "#eee",
									color: currentPage === num ? "#fff" : "#111",
									border: "none",
									padding: "6px 12px",
									borderRadius: 8,
									cursor: "pointer",
									minWidth: 36,
									fontWeight: currentPage === num ? 700 : 500,
								}}
							>
								{num}
							</button>
						))}
					</div>
				</div>
			)}

			{/* Modal - uses the FULL URL */}
			{modalOpen && selectedItem && (
				<div className="media-modal" onClick={closeModal} role="dialog" aria-modal="true">
					<div className="media-modal-content" onClick={(e) => e.stopPropagation()}>
						{selectedItem.isVideo ? (
							<video src={selectedItem.url} controls className="modal-media" preload="auto" /> 
						) : (
							<img src={selectedItem.url} alt="תצוגה מוגדלת" className="modal-media" /> 
						)}
					</div>
				</div>
			)}
		</div>
	);
}