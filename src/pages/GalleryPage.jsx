// src/pages/GalleryPage.jsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { getMainGalleryItems } from "../lib/galleryCache";
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

/* ---------------------------------------------
 * Media utils
 * ---------------------------------------------- */
const isImageExt = (e = "") =>
	["png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "avif", "svg"].includes(
		(e || "").toLowerCase()
	);
const isVideoExt = (e = "") =>
	["mp4", "mov", "avi", "mkv", "webm"].includes((e || "").toLowerCase());

/* ---------------------------------------------
 * Page
 * ---------------------------------------------- */
export default function GalleryPage() {
	const [allItems, setAllItems] = useState([]);
	const [loadingList, setLoadingList] = useState(true);
	const [error, setError] = useState("");

	const [filter, setFilter] = useState("all");
	const [modalOpen, setModalOpen] = useState(false);
	const [selectedItem, setSelectedItem] = useState(null);
	const [loaded, setLoaded] = useState({}); // fade-in tracking, keyed by fullPath

	// preconnect for faster first bytes
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

	// Load every item once from the shared cache. Because the app root already
	// kicked this off on site entry, the list + images are usually ready here.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				setLoadingList(true);
				const items = await getMainGalleryItems();
				if (!cancelled) setAllItems(items || []);
			} catch (e) {
				console.error(e);
				if (!cancelled) setError("טעינת הגלריה נכשלה.");
			} finally {
				if (!cancelled) setLoadingList(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const filteredItems = useMemo(() => {
		return allItems.filter((r) => {
			const img = isImageExt(r.ext);
			const vid = isVideoExt(r.ext);
			if (filter === "images") return img;
			if (filter === "videos") return vid;
			return img || vid;
		});
	}, [allItems, filter]);

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

	if (loadingList)
		return <div className="gallery-container loading">טוען מדיה…</div>;
	if (error) return <div className="gallery-container error">{error}</div>;
	if (filteredItems.length === 0)
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
		<div style={{ background: "#F5F1EA", minHeight: "100vh", direction: "rtl" }}>

			{/* STATS BAR */}
			<div style={{
				display: "grid",
				gridTemplateColumns: "repeat(3, 1fr)",
				background: "#EDE8DF",
				borderBottom: "1px solid #DDD8CF",
			}}>
				{[
					["📸", allItems.filter((i) => !isVideoExt(i.ext)).length, "תמונות"],
					["🎬", allItems.filter((i) => isVideoExt(i.ext)).length, "סרטונים"],
					["✦", allItems.length, "סה״כ"],
				].map(([icon, val, label], i) => (
					<div key={i} style={{
						padding: "14px 16px",
						textAlign: "center",
						borderLeft: i > 0 ? "1px solid #DDD8CF" : "none",
					}}>
						<div style={{ fontFamily: "Georgia, serif", fontSize: 14, color: "#2C1E12", marginBottom: 3 }}>
							{icon} {val}
						</div>
						<span style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: ".1em", color: "#B2967D" }}>
							{label}
						</span>
					</div>
				))}
			</div>

			{/* FILTER BUTTONS */}
			<div style={{ padding: "16px 24px 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
				<button onClick={() => setFilter("all")} className={`filter-button ${filter === "all" ? "active" : ""}`}>הכל</button>
				<button onClick={() => setFilter("images")} className={`filter-button ${filter === "images" ? "active" : ""}`}>תמונות</button>
				<button onClick={() => setFilter("videos")} className={`filter-button ${filter === "videos" ? "active" : ""}`}>סרטונים</button>
			</div>

			{/* TILE GRID — original masonry look (wide hero every 5 tiles) */}
			<div style={{
				display: "grid",
				gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
				gap: 8,
				gridAutoFlow: "dense",
				maxWidth: 700,
				margin: "0 auto",
				padding: "16px 24px 40px",
			}}>
				{filteredItems.map((item, index) => {
					const isVideo = item.isVideo;
					const isWide = index % 5 === 0;
					const isLoaded = loaded[item.fullPath];
					return (
						<div
							key={item.fullPath}
							onClick={() => openModal(item)}
							style={{
								position: "relative",
								overflow: "hidden",
								borderRadius: 10,
								gridColumn: isWide ? "1 / -1" : "span 1",
								aspectRatio: isWide ? "18 / 9" : "3 / 4",
								background: "#1A1208",
								cursor: "pointer",
							}}
						>
							{isVideo ? (
								<>
									<video
										src={item.gridUrl}
										style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", opacity: 0.7 }}
										muted
										playsInline
										preload="metadata"
									/>
									<div style={{
										position: "absolute", inset: 0,
										display: "flex", alignItems: "center", justifyContent: "center",
										pointerEvents: "none",
									}}>
										<div style={{
											width: 44, height: 44, borderRadius: "50%",
											background: "rgba(255,255,255,.18)",
											border: "1.5px solid rgba(255,255,255,.6)",
											display: "flex", alignItems: "center", justifyContent: "center",
										}}>
											<div style={{
												width: 0, height: 0,
												borderTop: "7px solid transparent",
												borderBottom: "7px solid transparent",
												borderLeft: "12px solid rgba(255,255,255,.85)",
												marginRight: -3,
											}} />
										</div>
									</div>
								</>
							) : (
								<img
									src={isWide ? (item.gridUrl || item.thumbUrl) : (item.thumbUrl || item.gridUrl)}
									alt=""
									loading={index < 4 ? "eager" : "lazy"}
									fetchpriority={index < 2 ? "high" : undefined}
									decoding="async"
									onLoad={() => setLoaded((l) => ({ ...l, [item.fullPath]: true }))}
									style={{
										display: "block", width: "100%", height: "100%",
										objectFit: "cover",
										opacity: isLoaded ? 1 : 0,
										transition: "opacity .4s ease",
									}}
								/>
							)}
						</div>
					);
				})}
			</div>

			{/* WATERMARK */}
			<div style={{ textAlign: "center", padding: "0 0 28px" }}>
				<span style={{ fontFamily: "Arial, sans-serif", fontSize: 8, letterSpacing: ".12em", color: "#C0B0A0" }}>
					Lens Dance Photography · lens-dance.com
				</span>
			</div>

			{/* MODAL */}
			{modalOpen && selectedItem && (
				<div className="media-modal" onClick={closeModal} role="dialog" aria-modal="true">
					<div className="media-modal-content" onClick={(e) => e.stopPropagation()}>
						{selectedItem.isVideo ? (
							<video src={selectedItem.url} controls className="modal-media" preload="metadata" playsInline />
						) : (
							/* Resized 1600px WebP instead of the original camera file — loads in a
							   fraction of the time; the original stays available for download. */
							<img src={selectedItem.modalUrl || selectedItem.url} alt="תצוגה מוגדלת" className="modal-media" />
						)}
					</div>
				</div>
			)}
		</div>
	);
}
