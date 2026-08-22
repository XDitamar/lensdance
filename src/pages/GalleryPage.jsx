// src/pages/GalleryPage.jsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getMainGalleryItems } from "../lib/galleryCache";
import { isRtlLang } from "../i18n";
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
	const { t, i18n } = useTranslation();
	const [allItems, setAllItems] = useState([]);
	const [loadingList, setLoadingList] = useState(true);
	const [error, setError] = useState("");

	const [filter, setFilter] = useState("all");
	const [modalOpen, setModalOpen] = useState(false);
	const [selectedItem, setSelectedItem] = useState(null);
	const [loaded, setLoaded] = useState({}); // fade-in tracking, keyed by fullPath

	// עימוד — עד 9 תמונות בכל עמוד
	const PER_PAGE = 9;
	const [page, setPage] = useState(1);

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
				if (!cancelled) setError(t("gallery.loadFailed"));
			} finally {
				if (!cancelled) setLoadingList(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [t]);

	const filteredItems = useMemo(() => {
		return allItems.filter((r) => {
			const img = isImageExt(r.ext);
			const vid = isVideoExt(r.ext);
			if (filter === "images") return img;
			if (filter === "videos") return vid;
			return img || vid;
		});
	}, [allItems, filter]);

	// עימוד: מחלקים ל-9 תמונות בעמוד
	const totalPages = Math.max(1, Math.ceil(filteredItems.length / PER_PAGE));
	const safePage = Math.min(page, totalPages);
	const pageItems = useMemo(() => {
		const start = (safePage - 1) * PER_PAGE;
		return filteredItems.slice(start, start + PER_PAGE);
	}, [filteredItems, safePage]);

	// כשמחליפים סינון — חוזרים לעמוד הראשון
	useEffect(() => {
		setPage(1);
	}, [filter]);

	// טעינה מהירה: מחממים מראש את תמונות העמוד הבא בזמן idle
	useEffect(() => {
		if (typeof window === "undefined") return;
		const start = safePage * PER_PAGE;
		const next = filteredItems.slice(start, start + PER_PAGE);
		const warm = () => {
			next.forEach((it) => {
				if (it.isVideo || !it.thumbUrl) return;
				const img = new Image();
				img.decoding = "async";
				if ("fetchPriority" in img) img.fetchPriority = "low";
				img.src = it.thumbUrl;
			});
		};
		if ("requestIdleCallback" in window) {
			const id = window.requestIdleCallback(warm, { timeout: 3000 });
			return () => window.cancelIdleCallback?.(id);
		}
		const t = setTimeout(warm, 800);
		return () => clearTimeout(t);
	}, [filteredItems, safePage]);

	// מעבר עמוד — גלילה חלקה לראש הגריד
	const goToPage = useCallback((p) => {
		setPage(p);
		if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
	}, []);

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
		return <div className="gallery-container loading">{t("gallery.loadingMedia")}</div>;
	if (error) return <div className="gallery-container error">{error}</div>;
	if (filteredItems.length === 0)
		return (
			<div className="gallery-container no-media">
				{filter === "images"
					? t("gallery.noPhotos")
					: filter === "videos"
					? t("gallery.noVideos")
					: t("gallery.noItems")}
			</div>
		);

	return (
		<div style={{ background: "#F5F1EA", minHeight: "100vh", direction: isRtlLang(i18n.language) ? "rtl" : "ltr" }}>

			{/* STATS BAR */}
			<div style={{
				display: "grid",
				gridTemplateColumns: "repeat(3, 1fr)",
				background: "#EDE8DF",
				borderBottom: "1px solid #DDD8CF",
			}}>
				{[
					["📸", allItems.filter((i) => !isVideoExt(i.ext)).length, t("gallery.photos")],
					["🎬", allItems.filter((i) => isVideoExt(i.ext)).length, t("gallery.videos")],
					["✦", allItems.length, t("gallery.total")],
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
				<button onClick={() => setFilter("all")} className={`filter-button ${filter === "all" ? "active" : ""}`}>{t("gallery.all")}</button>
				<button onClick={() => setFilter("images")} className={`filter-button ${filter === "images" ? "active" : ""}`}>{t("gallery.photos")}</button>
				<button onClick={() => setFilter("videos")} className={`filter-button ${filter === "videos" ? "active" : ""}`}>{t("gallery.videos")}</button>
			</div>

			{/* MASONRY GRID
			    Every item is shown WHOLE — no cropping, no stretching. Each tile keeps
			    the media's own aspect ratio (the /api/image thumbnails are resized by
			    width only, so they are the full frame, just smaller) and the columns
			    absorb the different heights. That is what lets portrait video sit next
			    to landscape stills without either being cut or letterboxed.
			    Column count is set in style.css so it can follow the viewport. */}
			<div style={{ padding: "16px 22px 40px", background: "#FAFAF8" }}>
				<div className="gallery-masonry">
					{pageItems.map((item, index) => {
						const isVideo = item.isVideo;
						const isLoaded = loaded[item.fullPath];
						return (
							<div
								key={item.fullPath}
								className={`gallery-tile${isLoaded ? " is-loaded" : ""}`}
								onClick={() => openModal(item)}
								role="button"
								tabIndex={0}
								onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openModal(item)}
							>
								{isVideo ? (
									<>
										<video
											src={item.gridUrl || item.url}
											className="gallery-tile-media"
											muted
											playsInline
											preload="metadata"
											/* A vertical clip simply makes a tall tile — nothing is cut. */
											onLoadedMetadata={() => setLoaded((l) => ({ ...l, [item.fullPath]: true }))}
										/>
										<span className="gallery-tile-play" aria-hidden="true" />
									</>
								) : (
									<img
										src={item.thumbUrl || item.gridUrl || item.url}
										alt={item.name || t("gallery.itemAlt")}
										className="gallery-tile-media"
										loading="eager"
										fetchpriority={index < 4 ? "high" : undefined}
										decoding="async"
										onLoad={(e) => {
											/* Pin the tile to the real ratio the moment it is known, so
											   the column stops reflowing as later images arrive. */
											const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
											if (w && h) e.currentTarget.parentElement.style.aspectRatio = `${w} / ${h}`;
											setLoaded((l) => ({ ...l, [item.fullPath]: true }));
										}}
									/>
								)}
							</div>
						);
					})}
				</div>

				{/* PAGINATION — עד 9 תמונות בכל עמוד */}
				{totalPages > 1 && (
					<div style={{
						display: "flex", justifyContent: "center", alignItems: "center",
						gap: 6, flexWrap: "wrap", marginTop: 26,
					}}>
						<button
							onClick={() => goToPage(Math.max(1, safePage - 1))}
							disabled={safePage === 1}
							className="filter-button"
							style={{ opacity: safePage === 1 ? 0.4 : 1, cursor: safePage === 1 ? "default" : "pointer" }}
						>
							‹ {t("gallery.prev")}
						</button>

						{Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
							<button
								key={p}
								onClick={() => goToPage(p)}
								className={`filter-button ${p === safePage ? "active" : ""}`}
								style={{ minWidth: 38 }}
							>
								{p}
							</button>
						))}

						<button
							onClick={() => goToPage(Math.min(totalPages, safePage + 1))}
							disabled={safePage === totalPages}
							className="filter-button"
							style={{ opacity: safePage === totalPages ? 0.4 : 1, cursor: safePage === totalPages ? "default" : "pointer" }}
						>
							{t("gallery.next")} ›
						</button>
					</div>
				)}
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
							<img src={selectedItem.modalUrl || selectedItem.url} alt={t("gallery.lightbox")} className="modal-media" />
						)}
					</div>
				</div>
			)}
		</div>
	);
}
