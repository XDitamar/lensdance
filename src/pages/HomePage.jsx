import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
// Hero video import removed with the <video> tag below — an unused import is a
// warning, and CI builds treat warnings as errors. Restore this line if you put
// the video back:  import vid from "../vid.mp4";
// Instagram feed disabled at the client's request — see INSTAGRAM_SETUP.md
// import InstagramFeed from "../components/InstagramFeed";
import { useTranslation } from "react-i18next";
import { useGeoPrice } from "../hooks/useGeoPrice";
import { getWhatsAppInternational } from "../config/contact";
import QuoteRequestModal from "../components/QuoteRequestModal";
import "./homepage.css";

/* Footer social links. The WhatsApp number comes from src/config/contact.js so
   there is one place to change it — this used to be a hardcoded
   wa.me/972XXXXXXXXX placeholder that went nowhere. */
const SOCIAL_LINKS = [
  { label: "Instagram", href: "https://www.instagram.com/lens.dance29/" },
  { label: "TikTok", href: "https://www.tiktok.com/@lensdance_photography" },
  { label: "WhatsApp", href: `https://wa.me/${getWhatsAppInternational()}` },
];

export default function HomePage() {
  const { t } = useTranslation();
  // Currency + amounts come from the visitor's country, the wording from the
  // active language — the two are independent on purpose. See useGeoPrice.
  const { prices: p } = useGeoPrice();
  const [quoteOpen, setQuoteOpen] = useState(false);
  // Which kind of work the visitor is looking at. "competition" first because
  // it is the bulk of the business; a personal shoot is the deliberate choice.
  const [group, setGroup] = useState("competition");

  /* ANIM-1: scroll reveal — מוסיף .is-revealed לאלמנטים עם .reveal כשנכנסים למסך */
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      els.forEach((el) => el.classList.add("is-revealed"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("is-revealed");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // Re-runs when the pricing tab changes: switching group mounts brand new
    // .reveal cards, and an observer created on the first render knows nothing
    // about them — they would sit at opacity 0 forever.
  }, [group]);

  return (
    <div className="homepage-root">

      {/* ── HERO ──
          A still photograph rather than the old looping video. Two reasons:
          src/vid.mp4 is a Git LFS pointer, so on Vercel it is a 132-byte text
          file and the hero rendered as an empty grey block; and the still is
          86KB against a multi-megabyte clip, so the first paint is immediate.

          TO GO BACK TO THE VIDEO: restore the two lines commented out below,
          swap the image `src` to "/pics/pic1.webp", and make sure vid.mp4 is
          committed as a real file rather than an LFS pointer. */}
      <div className="hero-video-container">
        <img src="/pics/hero.webp" alt={t("home.heroAlt")} className="hero-fallback-image" fetchpriority="high" decoding="async" />
        {/* <video autoPlay loop muted playsInline className="hero-video">
              <source src={vid} type="video/mp4" />
            </video> */}
        <div className="video-overlay" />
        <div className="hero-content">
          <h1 className="hero-title">Lens Dance</h1>
          <div className="hero-subtitle-wrapper">
            <div className="hero-subtitle-line"></div>
            {/* The tail is hidden on phones — see homepage.css. At full length
                the line reaches the "to my gallery" button in the opposite
                corner and the two collide on a narrow screen. */}
            <span className="hero-subtitle-text">
              Photography · Equestrian
              <span className="hero-subtitle-tail"> · Israel &amp; International</span>
            </span>
            <div className="hero-subtitle-line"></div>
          </div>
        </div>
        <div className="hero-cta-container">
          <Link to="/gallery" className="cta-button">{t("home.heroCta")}</Link>
        </div>
      </div>

      {/* ── PORTFOLIO DIVIDER ── */}
      {/* ANIM-5: divider draw-in (class "reveal") */}
      <div className="ornamental-divider reveal">
        <span></span>
        <div className="ornamental-diamond"></div>
        <span className="ornamental-label">Portfolio</span>
        <div className="ornamental-diamond"></div>
        <span></span>
      </div>

      {/* ── PORTFOLIO ── */}
      <div className="section-container">
        {/* The grid is `3fr 2fr 2fr` (see homepage.css) — a wide lead image and
            two stacked columns. Until now only two of the three tracks were
            filled, leaving an empty column on the right. The black-and-white
            portrait takes the lead slot and Show jumping moves into the third
            track.

            The width/height on each <img> are the files' real pixel dimensions.
            They are not sizing the picture — CSS does that — they tell the
            browser the aspect ratio up front, so on mobile (where tiles take
            the shape of the photo rather than a fixed height) the page reserves
            the right space instead of reflowing as each file lands. */}
        <div className="featured-images-grid">
          {/* ANIM-1 (reveal) + ANIM-3 (featured-caption) */}
          <div className="featured-image-item reveal">
            <img src="/pics/kip2.webp" width="1400" height="788" alt={t("home.captionEquine")} className="featured-img-main" loading="lazy" decoding="async" />
            <span className="featured-caption">{t("home.captionEquine")}</span>
          </div>
          <div className="featured-column">
            <div className="featured-image-item reveal" style={{ transitionDelay: "0.15s" }}>
              <img src="/pics/pic2.webp" width="1400" height="933" alt={t("home.captionRiding")} className="featured-img-sub" loading="lazy" decoding="async" />
              <span className="featured-caption">{t("home.captionRiding")}</span>
            </div>
            <div className="featured-image-item reveal" style={{ transitionDelay: "0.3s" }}>
              <img src="/pics/pic3.webp" width="1400" height="933" alt={t("home.captionPortrait")} className="featured-img-sub" loading="lazy" decoding="async" />
              <span className="featured-caption">{t("home.captionPortrait")}</span>
            </div>
          </div>
          <div className="featured-column">
            <div className="featured-image-item reveal" style={{ transitionDelay: "0.45s" }}>
              <img src="/pics/pic1.webp" width="1400" height="1459" alt={t("home.captionJumping")} className="featured-img-tall" loading="lazy" decoding="async" />
              <span className="featured-caption">{t("home.captionJumping")}</span>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <Link to="/gallery" style={{
            fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: "0.2em",
            textTransform: "uppercase", color: "var(--brown-600)",
            borderBottom: "1px solid var(--brown-500)", paddingBottom: 2, textDecoration: "none"
          }}>
            {t("home.galleryCta")}
          </Link>
        </div>
      </div>

      {/* ── PULL QUOTE ── */}
      {/* ANIM-1: reveal on the whole section */}
      <div className="pull-quote-section reveal">
        <div className="ornamental-divider" style={{ marginBottom: 20 }}>
          <span></span><div className="ornamental-diamond"></div><div className="ornamental-diamond"></div>
        </div>
        <p className="pull-quote-text">
          {t("home.quote")}
        </p>
        <div className="pull-quote-author">{t("home.quoteAuthor")}</div>
        <div className="ornamental-divider" style={{ marginTop: 20 }}>
          <span></span><div className="ornamental-diamond"></div><div className="ornamental-diamond"></div>
        </div>
      </div>

      {/* ── INSTAGRAM ── */}
      {/* Disabled at the client's request (July 2026). The feature is fully
          built and ready: re-enable by uncommenting the import above and the
          line below, then set INSTAGRAM_ACCESS_TOKEN in Vercel — see
          INSTAGRAM_SETUP.md. */}
      {/* <InstagramFeed /> */}

      {/* ── PRICING DIVIDER ── */}
      {/* ANIM-5: divider draw-in (class "reveal") */}
      <div className="ornamental-divider reveal">
        <span></span>
        <div className="ornamental-diamond"></div>
        {/* Was `{t("pricing.pageTitle")} · Pricing`, which read "Pricing ·
            Pricing" once the page was in English. The label is decorative, so
            one translated word is enough. */}
        <span className="ornamental-label">{t("pricing.pageTitle")}</span>
        <div className="ornamental-diamond"></div>
        <span></span>
      </div>

      {/* ── PRICING ── */}
      <div className="pricing-container">
        <div className="section-header">
          <h2 className="section-title">{t("pricing.sectionTitle")}</h2>
          <p className="pricing-subtitle">{t("pricing.subtitle")}</p>

          {/* Competition work and a booked session are different jobs at
              different prices, so the visitor picks before reading numbers.
              TO REVERT: drop this block and render p.perEntry / p.videoPackage
              / p.shortVideo / p.custom directly in the grid below. */}
          <div className="pricing-tabs" role="tablist">
            {p.groups.map((g) => (
              <button
                key={g.id}
                role="tab"
                aria-selected={group === g.id}
                className={`pricing-tab${group === g.id ? " is-active" : ""}`}
                onClick={() => setGroup(g.id)}
              >
                {g.label}
              </button>
            ))}
          </div>
          <p className="pricing-tab-hint">
            {p.groups.find((g) => g.id === group)?.hint}
          </p>
        </div>
        <div className="pricing-grid">
          {/* Cards come from the selected group. The "one photo at a time"
              option was retired — the editing time never paid for itself. */}
          {(p.groups.find((g) => g.id === group)?.cardKeys || []).map((key, i) => {
            const card = p[key];
            // The custom package has no number to show, so instead of a dead
            // "by consultation" label it gets a button that opens the enquiry
            // form. It is always the last card in this list.
            const isCustom = key === "custom";
            return (
              /* ANIM-1: staggered reveal for price cards */
              <div className="price-card reveal" style={{ transitionDelay: `${i * 0.12}s` }} key={key}>
                <div className="price-card-header">
                  <h3>{card.title}</h3>
                  <ul className="price-card-features">
                    <li>{card.sub}</li>
                  </ul>
                  {/* What the package actually buys. Riders were being asked to
                      guess before; the list comes from the locale files so it
                      stays in step with the price beside it. */}
                  {Array.isArray(card.includes) && card.includes.length > 0 && (
                    <>
                      <div className="price-includes-title">{p.includesTitle}</div>
                      <ul className="price-includes">
                        {card.includes.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                {isCustom ? (
                  <button
                    type="button"
                    className="price-quote-btn"
                    onClick={() => setQuoteOpen(true)}
                  >
                    {t("quote.cta")}
                  </button>
                ) : (
                  <div className="price-range-text">{card.from}</div>
                )}
                <div className="price-deposit">{p.deposit}</div>
              </div>
            );
          })}
        </div>
        {/* Add-on rather than a package of its own — it attaches to whichever
            one the rider picks, and the cap is stated because it is real. */}
        {group === "competition" && (
        <div className="priority-addon reveal">
          <div className="priority-addon-main">
            <span className="priority-addon-title">{p.priority.title}</span>
            <span className="priority-addon-price">{p.priority.label}</span>
          </div>
          <p className="priority-addon-sub">{p.priority.sub}</p>
          <span className="priority-addon-slots">{p.priority.slots}</span>
        </div>
        )}

        <div className="book-btn-container">
          {/* /register is the actual sign-up form. /contact is the embedded
              Google form behind a terms popup, which is not where someone who
              just picked a package expects to land. */}
          <Link to="/register" className="book-btn">{t("pricing.book")}</Link>
        </div>
        <p className="pricing-footer-text">{t("pricing.footerNote")}</p>
        {/* Sits under the prices on purpose — see PricingPage.jsx. It is the
            second link on the page, not a nav item. */}
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <Link to="/faq" className="pricing-faq-link">{t("pricing.faqLink")}</Link>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer style={{
        background: "#2C1E12",
        padding: "18px 36px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        {/* Left — copyright */}
        <span style={{
          fontFamily: "Arial, sans-serif",
          fontSize: 9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.28)",
        }}>
          © 2025 Lens Dance
        </span>

        {/* Right — social links */}
        <div style={{ display: "flex", gap: 20 }}>
          {SOCIAL_LINKS.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              /* notranslate: these are brand names — Google Translate would
                 otherwise render "Instagram" into the visitor's language. */
              className="notranslate"
              style={{
                fontFamily: "Arial, sans-serif",
                fontSize: 9,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.45)",
                textDecoration: "none",
                transition: "color 0.2s",
              }}
            >
              {label}
            </a>
          ))}
        </div>
      </footer>

      <QuoteRequestModal open={quoteOpen} onClose={() => setQuoteOpen(false)} />

    </div>
  );
}
