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
	["png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "avif", "svg"].includes(
		(e || "").toLowerCase()
	);
const isVideoExt = (e = "") =>
	["mp4", "mov", "avi", "mkv", "webm"].includes((e || "").toLowerCase());

// תבנית קבועה: [wide, half, half]
const applyPattern = (items) => {
	let out = [];
	let i = 0;
	const len = items.length;
	while (i < len) {
		const item = items[i];
		if (i % 3 === 0) {
			out.push({ ...item, variant: "wide" });
			i++;
		} else {
			out.push({ ...item, variant: "half" });
			if (i + 1 < len) {
				const nextItem = items[i + 1];
				out.push({ ...nextItem, variant: "half" });
			}
			i += 2;
		}
	}
	return out;
};

/* ---------- Lazy tile (loads only when in view) ---------- */
const LazyMedia = React.memo(function LazyMedia({
	url,
	alt,
	isVideo,
	variant,
	onClick,
	lqipUrl,
}) {
	const [inView, setInView] = useState(false);
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
			onKeyDown={(e) =>
				(e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick?.())
			}
			style={{ position: "relative", overflow: "hidden" }}
		>
			{inView ? (
				isVideo ? (
					<video
						ref={videoRef}
						className="tile-media"
						src={url}
						preload={isLikelyIOS() ? "auto" : "metadata"}
						playsInline
						muted
						controls={false}
						data-prime="1"
					/>
				) : (
					<>
						{!loaded && lqipUrl && (
							<img
								src={lqipUrl}
								alt={`Placeholder for ${alt}`}
								className="tile-media lqip"
								aria-hidden="true"
								style={{
									filter: "blur(10px)",
									transition: "opacity 0.5s",
									opacity: 1,
									position: "absolute",
									top: 0,
									left: 0,
									width: "100%",
									height: "100%",
									objectFit: "cover",
								}}
							/>
						)}
						<img
							src={url}
							alt={alt}
							className="tile-media"
							loading="lazy"
							decoding="async"
							fetchpriority="low"
							onLoad={handleImageLoad}
							style={{
								position: "absolute",
								top: 0,
								left: 0,
								width: "100%",
								height: "100%",
								objectFit: "cover",
								transition: "opacity 0.5s",
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
	// unified: { name, fullPath, ext, source, url (full), gridUrl (resized via /api/image), isVideo, variant, lqipUrl }
	const [allRefs, setAllRefs] = useState([]);
	const [loadingList, setLoadingList] = useState(true);
	const [error, setError] = useState("");

	// UI
	const [filter, setFilter] = useState("all");
	const [modalOpen, setModalOpen] = useState(false);
	const [selectedItem, setSelectedItem] = useState(null);

	// pagination
	const [currentPage, setCurrentPage] = useState(1);
	const urlCache = useRef(new Map());

	// preconnect
	useEffect(() => {
		if (typeof document === "undefined" || typeof window === "undefined") return;

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

	// 1) List refs once (Firebase ONLY)
	useEffect(() => {
		const run = async () => {
			try {
				setLoadingList(true);
				let firebaseRefs = [];

				if (USE_FIREBASE) {
					try {
						const folderRef = ref(storage, "MainGallery");
						const res = await listAll(folderRef);

						firebaseRefs = await Promise.all(
							res.items.map(async (r) => {
								const name = r.name;
								const fullPath = r.fullPath;

								// אם במקרה יש לך תתי-תיקיות thumbs ישנים – נדלג
								if (fullPath.includes("/thumbs/")) return null;

								const ext = extFromName(name);
								const isVid = isVideoExt(ext);

								// URL מלא מ-Firebase (4K / המקור)
								const cachedFull = urlCache.current.get(fullPath);
								const fullResUrl =
									cachedFull || (await getDownloadURL(r).catch(() => null));
								if (!fullResUrl) return null;
								urlCache.current.set(fullPath, fullResUrl);

								// ברירת מחדל – לגריד נשתמש בגרסה מוקטנת דרך /api/image
								let gridDisplayUrl = fullResUrl;
								let lqipUrl = undefined;

								if (!isVid) {
									// כאן הכסם: בגריד נטען דרך API של Vercel שמקטין את התמונה
									// /api/image?url=<downloadURL>&w=1280&q=70
									const resizedUrl = `/api/image?url=${encodeURIComponent(
										fullResUrl
									)}&w=1280&q=70`;

									gridDisplayUrl = resizedUrl;
									lqipUrl = resizedUrl;
								} else {
									// וידאו – נשאיר את ה-URL המלא לגריד
									lqipUrl = undefined;
								}

								const variant = "wide"; // יתוקן אחר כך ב-applyPattern

								return {
									name,
									fullPath,
									ext,
									source: "firebase",
									url: fullResUrl, // FULL (למודל)
									gridUrl: gridDisplayUrl, // קטן / מהיר לגריד
									isVideo: isVid,
									variant,
									lqipUrl,
								};
							})
						);

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

	// 2) Filter
	const filteredRefs = useMemo(() => {
		return allRefs.filter((r) => {
			const img = isImageExt(r.ext);
			const vid = isVideoExt(r.ext);
			if (filter === "images") return img;
			if (filter === "videos") return vid;
			return img || vid;
		});
	}, [allRefs, filter]);

	// reset page על שינוי פילטר
	useEffect(() => setCurrentPage(1), [filter, filteredRefs.length]);

	// 3) Pagination
	const totalPages = Math.ceil(filteredRefs.length / ITEMS_PER_PAGE) || 1;
	const pageRefs = useMemo(() => {
		const start = (currentPage - 1) * ITEMS_PER_PAGE;
		return filteredRefs.slice(start, start + ITEMS_PER_PAGE);
	}, [filteredRefs, currentPage]);

	// 4) pageItems
	const [pageItems, setPageItems] = useState([]);
	const [loadingPage, setLoadingPage] = useState(true);

	useEffect(() => {
		setLoadingPage(true);
		const items = pageRefs.map((r) => ({
			...r,
			isVideo: isVideoExt(r.ext),
		}));
		setPageItems(items);
		setLoadingPage(false);
	}, [pageRefs]);

	// 5) Prefetch next page originals (full)
	useEffect(() => {
		if (currentPage >= totalPages) return;
		const start = currentPage * ITEMS_PER_PAGE;
		const nextRefs = filteredRefs.slice(start, start + ITEMS_PER_PAGE);

		const idle = (cb) =>
			window.requestIdleCallback
				? window.requestIdleCallback(cb, { timeout: 1200 })
				: setTimeout(cb, 300);

		const token = idle(async () => {
			for (const r of nextRefs) {
				if (urlCache.current.has(r.fullPath)) continue;
				try {
					const u = await getDownloadURL(ref(storage, r.fullPath));
					urlCache.current.set(r.fullPath, u);
					if (isImageExt(r.ext)) {
						const img = new Image();
						img.decoding = "async";
						img.loading = "eager";
						img.referrerPolicy = "no-referrer";
						img.src = u;
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

	// 6) Warm all images (אופציונלי)
	useEffect(() => {
		if (!filteredRefs.length) return;
		if (typeof navigator === "undefined") return;

		const c =
			navigator.connection ||
			navigator.mozConnection ||
			navigator.webkitConnection;
		if (c?.saveData || /2g/.test(c?.effectiveType || "")) return;

		let aborted = false;
		const CHUNK = 24;

		const idle = (cb) =>
			window.requestIdleCallback
				? window.requestIdleCallback(cb, { timeout: 1500 })
				: setTimeout(cb, 300);

		const warmChunk = async (refsChunk) => {
			const urls = refsChunk
				.map((r) => r.gridUrl || r.url)
				.filter(Boolean);

			if (!urls.length) return;

			if (navigator.serviceWorker?.controller) {
				navigator.serviceWorker.controller.postMessage({
					type: "WARM_CACHE",
					urls,
				});
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

	// 7) Pattern for current page
	const patternedPageItems = useMemo(
		() => applyPattern(pageItems),
		[pageItems]
	);

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
	if (loadingList)
		return <div className="gallery-container loading">טוען מדיה…</div>;
	if (error) return <div className="gallery-container error">{error}</div>;
	if (filteredRefs.length === 0)
		return (
			<div className="gallery-container no-media">
				{filter === "images"
					? "לא נמצאו תמונות."
					: filter === "videos"
					? "לא נמצאו סרטונים."
					: "לא נמצאו פריטים."}
			</div>
		);

	return (
		<div className="gallery-container">
			<h1 className="gallery-title">הגלריה הראשית</h1>

			<div className="gallery-buttons">
				<button
					onClick={() => setFilter("all")}
					className={`filter-button ${filter === "all" ? "active" : ""}`}
				>
					הכל
				</button>
				<button
					onClick={() => setFilter("images")}
					className={`filter-button ${filter === "images" ? "active" : ""}`}
				>
					תמונות
				</button>
				<button
					onClick={() => setFilter("videos")}
					className={`filter-button ${filter === "videos" ? "active" : ""}`}
				>
					סרטונים
				</button>
			</div>

			{/* Grid: current page only */}
			<div className="gallery-grid collage">
				{loadingPage
					? Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
							<div
								key={i}
								className={`tile ${i % 3 === 0 ? "wide" : "half"}`}
							>
								<div className="placeholder" />
							</div>
						))
					: patternedPageItems.map((m) => (
							<LazyMedia
								key={m.fullPath}
								url={m.gridUrl} // ⬅️ כאן כבר /api/image -> תמונה מוקטנת
								alt={m.name}
								isVideo={m.isVideo}
								variant={m.variant}
								lqipUrl={m.lqipUrl}
								onClick={() => openModal(m)}
							/>
						))}
			</div>

			{/* Pagination */}
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

			{/* Modal – FULL RES (4K) */}
			{modalOpen && selectedItem && (
				<div
					className="media-modal"
					onClick={closeModal}
					role="dialog"
					aria-modal="true"
				>
					<div
						className="media-modal-content"
						onClick={(e) => e.stopPropagation()}
					>
						{selectedItem.isVideo ? (
							<video
								src={selectedItem.url}
								controls
								className="modal-media"
								preload="auto"
							/>
						) : (
							<img
								src={selectedItem.url}
								alt="תצוגה מוגדלת"
								className="modal-media"
							/>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
