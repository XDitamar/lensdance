import React from "react";
import { Link } from "react-router-dom";
import vid from "../vid/vid.mp4";

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <div className="hero-video-container">
        <video autoPlay loop muted playsInline className="hero-video">
          <source src={vid} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        <div className="video-overlay" />
        <div className="hero-content">
          <h1>Capture the Spirit of Equines</h1>
          <p>
            At Lens Dance, I don't just take pictures; I craft timeless art that
            reflects the unique beauty, power, and gentle spirit of every horse.
            Let's create stunning visual stories together.
          </p>
          <Link to="/gallery" className="cta-button">
            View My Portfolio
          </Link>
        </div>
      </div>

      {/* Featured */}
      <div className="container">
        <h2 className="section-title">A Glimpse Into My Work</h2>
        <p>
          Dive into a selection of my recent favorites and discover the moments
          I've had the privilege to freeze in time. Each image tells a unique story.
        </p>
        <div className="featured-images-grid">
          <div className="featured-image-item">
            <img src="/pics/pic1.png" alt="Show jumping — featured 1" />
          </div>
          <div className="featured-image-item">
            <img src="/pics/pic2.png" alt="Show jumping — featured 2" />
          </div>
          <div className="featured-image-item">
            <img src="/pics/pic3.png" alt="Show jumping — featured 3" />
          </div>
        </div>
      </div>

      {/* Disciplines */}
      <div className="container">
        <h2 className="section-title">My Photographic Disciplines</h2>
        <p>
          Specializing in capturing the unique essence of horses across various equestrian disciplines.
        </p>
        <div className="services-grid">
          <div className="service-card">
            <h3>Western Riding</h3>
            <p>From reining to barrel racing, I capture grit, grace, and authentic spirit.</p>
          </div>
          <div className="service-card">
            <h3>Dressage</h3>
            <p>Elegance, harmony, and intricate movements—artistry in motion.</p>
          </div>
          <div className="service-card">
            <h3>Show Jumping</h3>
            <p>Freeze the exhilarating power and agility over obstacles.</p>
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div
        className="container"
        style={{
          backgroundColor: "#f0ede5",
          borderRadius: "10px",
          padding: "50px 20px",
        }}
      >
        <h2 className="section-title">Pricing & Packages</h2>
        <p>These are starting ranges; a custom quote is provided after consultation.</p>

        <div className="pricing-grid">
          <div className="price-card">
            <h3>Photos per Round/Class</h3>
            <ul>
              <li>60 NIS per person (includes 10 NIS deposit)</li>
              <li>30 NIS for additional horse in the same round</li>
              <li>High-resolution digital photos</li>
              <li>Secure online delivery</li>
            </ul>
            <p className="price-range-text">Starting from: 60 NIS</p>
          </div>

          <div className="price-card">
            <h3>Photos by Selection</h3>
            <ul>
              <li>Drive access to all basic-edited photos (with logo)</li>
              <li>6 NIS per final edited photo</li>
              <li>First 2 photos included in deposit</li>
              <li>Only pay for the photos you love!</li>
            </ul>
            <p className="price-range-text">Starting from: 6 NIS per photo</p>
          </div>

          <div className="price-card">
            <h3>Video Package</h3>
            <ul>
              <li>Drive access to all raw video clips</li>
              <li>Custom-edited Instagram Reel</li>
              <li>150 NIS total (includes 40 NIS deposit)</li>
            </ul>
            <p className="price-range-text">Total Price: 150 NIS</p>
          </div>

          <div className="price-card">
            <h3>Custom Package</h3>
            <ul>
              <li>Personalized consultation</li>
              <li>You choose the number of final images</li>
              <li>Ideal for events or special projects</li>
              <li>Flexible price after consultation</li>
            </ul>
            <p className="price-range-text">Price: Determined after consultation</p>
          </div>
        </div> {/* end pricing-grid */}

        {/* Book button outside grid */}
        <div className="book-btn-container">
          <Link to="/contact" className="book">Book it now</Link>
        </div>

        <p style={{ marginTop: 30, fontStyle: "italic", color: "#666" }}>
          <br />
          Payment accepted via Bit, cash, or PayBox. Deposit refunds are available for issues on our end.
        </p>
      </div>
    </>
  );
}
