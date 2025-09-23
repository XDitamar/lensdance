import React from "react";
import { Link } from "react-router-dom";
import vid from "../vid.mp4";

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <div className="hero-video-container">
        <video autoPlay loop muted playsInline className="hero-video">
          <source src={vid} type="video/mp4" />
          הדפדפן שלך לא תומך בתגית הווידאו.
        </video>
        <div className="video-overlay" />
        <div className="hero-content">
          <h1>לכוד את רוח הסוסים</h1>
          <p>
            ב־Lens Dance אני לא רק מצלמת; אני יוצרת אמנות נצחית שמבטאת את היופי,
            העוצמה והרוך הייחודי של כל סוס. בוא ניצור יחד סיפורים ויזואליים מרהיבים.
          </p>
          <Link to="/gallery" className="cta-button">
            מעבר לגלריה
          </Link>
        </div>
      </div>

      {/* Featured */}
      <div className="container">
        <h2 className="section-title">portafolio</h2>
        <p>
          צלול אל מבחר מהאהובים האחרונים שלי וגלו את הרגעים שזכיתי להקפיא בזמן.
          כל תמונה מספרת סיפור ייחודי.
        </p>
        <div className="featured-images-grid">
          <div className="featured-image-item">
            <img src="/pics/pic1.png" alt="קפיצות ראווה — תמונה מוצגת 1" />
          </div>
          <div className="featured-image-item">
            <img src="/pics/pic2.png" alt="קפיצות ראווה — תמונה מוצגת 2" />
          </div>
          <div className="featured-image-item">
            <img src="/pics/pic3.png" alt="קפיצות ראווה — תמונה מוצגת 3" />
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
        <h2 className="section-title">מחירים וחבילות</h2>
        <p>אלו טווחי פתיחה; הצעת מחיר מותאמת תינתן לאחר ייעוץ אישי.</p>

        <div className="pricing-grid">
          <div className="price-card">
            <h3>תמונות לפי כניסה</h3>
            <ul>
              <li>60 ₪ לאדם (כולל מקדמה של 10 ₪)</li>
              <li>30 ₪ עבור סוס נוסף באותו מקצה</li>
              <li>תמונות דיגיטליות באיכות גבוהה</li>
              <li>מסירה מאובטחת אונליין</li>
            </ul>
            <p className="price-range-text">החל מ־60 ₪</p>
          </div>

          <div className="price-card">
            <h3>תמונות לפי בחירה</h3>
            <ul>
              <li>גישה לכל התמונות עם עריכה בסיסית (כולל לוגו)</li>
              <li>6 ₪ לכל תמונה סופית ערוכה</li>
              <li>2 התמונות הראשונות כלולות במקדמה</li>
              <li>משלמים רק על התמונות שאהבתם!</li>
            </ul>
            <p className="price-range-text">החל מ־6 ₪ לתמונה</p>
          </div>

          <div className="price-card">
            <h3>חבילת וידאו</h3>
            <ul>
              <li>גישה לכל קליפי הווידאו הגולמיים</li>
              <li>ריל מותאם אישית לאינסטגרם</li>
              <li>150 ₪ סה״כ (כולל מקדמה של 40 ₪)</li>
            </ul>
            <p className="price-range-text">מחיר כולל: 150 ₪</p>
          </div>

          <div className="price-card">
            <h3>חבילה מותאמת אישית</h3>
            <ul>
              <li>ייעוץ אישי</li>
              <li>אתם בוחרים את מספר התמונות הסופיות</li>
              <li>מושלם לאירועים או פרויקטים מיוחדים</li>
              <li>מחיר גמיש לאחר ייעוץ</li>
            </ul>
            <p className="price-range-text">המחיר ייקבע לאחר ייעוץ</p>
          </div>
        </div> {/* end pricing-grid */}

        {/* Book button outside grid */}
        <div className="book-btn-container">
          <Link to="/contact" className="book">הזמן עכשיו</Link>
        </div>

        <p style={{ marginTop: 30, fontStyle: "italic", color: "#666" }}>
          <br />
          תשלום מתקבל בביט, מזומן או PayBox. החזר מקדמה אפשרי במקרה של בעיות מצידנו.
        </p>
      </div>
    </>
  );
}
