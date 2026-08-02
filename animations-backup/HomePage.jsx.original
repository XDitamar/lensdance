import React from "react";
import { Link } from "react-router-dom";
import vid from "../vid.mp4";
import InstagramFeed from "../components/InstagramFeed";
import { useGeoPrice, PRICES } from "../hooks/useGeoPrice";
import "./homepage.css";

export default function HomePage() {
  const { prices, isIsrael } = useGeoPrice();
  const p = prices || PRICES.IL; // show Hebrew defaults until the country is known
  const heb = isIsrael !== false;

  return (
    <div className="homepage-root">

      {/* ── HERO ── */}
      <div className="hero-video-container">
        <img src="/pics/pic1.webp" alt="צילומי סוסים ורכיבה מקצועיים" className="hero-fallback-image" fetchpriority="high" decoding="async" />
        <video autoPlay loop muted playsInline className="hero-video">
          <source src={vid} type="video/mp4" />
        </video>
        <div className="video-overlay" />
        <div className="hero-content">
          <h1 className="hero-title">Lens Dance</h1>
          <div className="hero-subtitle-wrapper">
            <div className="hero-subtitle-line"></div>
            <span className="hero-subtitle-text">Photography · Equestrian · Israel & International</span>
            <div className="hero-subtitle-line"></div>
          </div>
        </div>
        <div className="hero-cta-container">
          <Link to="/gallery" className="cta-button">לגלריה שלי →</Link>
        </div>
      </div>

      {/* ── PORTFOLIO DIVIDER ── */}
      <div className="ornamental-divider">
        <span></span>
        <div className="ornamental-diamond"></div>
        <span className="ornamental-label">Portfolio</span>
        <div className="ornamental-diamond"></div>
        <span></span>
      </div>

      {/* ── PORTFOLIO ── */}
      <div className="section-container">
        <div className="featured-images-grid">
          <div className="featured-image-item">
            <img src="/pics/pic1.webp" alt="קפיצות ראווה" className="featured-img-main" loading="lazy" decoding="async" />
          </div>
          <div className="featured-column">
            <div className="featured-image-item">
              <img src="/pics/pic2.webp" alt="רכיבה" className="featured-img-sub" loading="lazy" decoding="async" />
            </div>
            <div className="featured-image-item">
              <img src="/pics/pic3.webp" alt="פורטרט" className="featured-img-sub" loading="lazy" decoding="async" />
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <Link to="/gallery" style={{
            fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: "0.2em",
            textTransform: "uppercase", color: "var(--brown-600)",
            borderBottom: "1px solid var(--brown-500)", paddingBottom: 2, textDecoration: "none"
          }}>
            לכל הגלריה →
          </Link>
        </div>
      </div>

      {/* ── PULL QUOTE ── */}
      <div className="pull-quote-section">
        <div className="ornamental-divider" style={{ marginBottom: 20 }}>
          <span></span><div className="ornamental-diamond"></div><div className="ornamental-diamond"></div>
        </div>
        <p className="pull-quote-text">
          "כל סוס הוא עולם בפני עצמו — אני כאן כדי לתפוס אותו ברגע האמת"
        </p>
        <div className="pull-quote-author">— [שמך], Lens Dance Photography</div>
        <div className="ornamental-divider" style={{ marginTop: 20 }}>
          <span></span><div className="ornamental-diamond"></div><div className="ornamental-diamond"></div>
        </div>
      </div>

      {/* ── INSTAGRAM ── */}
      <InstagramFeed />

      {/* ── PRICING DIVIDER ── */}
      <div className="ornamental-divider">
        <span></span>
        <div className="ornamental-diamond"></div>
        <span className="ornamental-label">מחירים · Pricing</span>
        <div className="ornamental-diamond"></div>
        <span></span>
      </div>

      {/* ── PRICING ── */}
      <div className="pricing-container">
        <div className="section-header">
          <h2 className="section-title">{heb ? "מחירים וחבילות" : "Pricing & Packages"}</h2>
          <p className="pricing-subtitle">
            {heb
              ? "אלו טווחי פתיחה — הצעת מחיר מותאמת תינתן לאחר ייעוץ אישי"
              : "These are starting ranges — a custom quote is given after a personal consultation"}
          </p>
        </div>
        <div className="pricing-grid">
          {[p.perEntry, p.perPhoto, p.videoPackage, p.custom].map((card, i) => (
            <div className="price-card" key={i}>
              <div className="price-card-header">
                <h3>{card.title}</h3>
                <ul className="price-card-features">
                  <li>{card.sub}</li>
                </ul>
              </div>
              <div className="price-range-text">{card.from}</div>
            </div>
          ))}
        </div>
        <div className="book-btn-container">
          <Link to="/contact" className="book-btn">{heb ? "הזמן עכשיו" : "Book Now"}</Link>
        </div>
        <p className="pricing-footer-text">
          {heb
            ? 'תשלום בביט, מזומן או PayBox · לגולשים מחו"ל: PayPal / העברה בנקאית'
            : "Payment via PayPal or bank transfer"}
        </p>
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
          <a
            href="https://www.instagram.com/lens.dance29/"
            target="_blank"
            rel="noreferrer"
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
            Instagram
          </a>
          <a
            href="https://wa.me/972XXXXXXXXX"
            target="_blank"
            rel="noreferrer"
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
            WhatsApp
          </a>
        </div>
      </footer>

    </div>
  );
}
