import React from 'react';
import { useGeoPrice } from '../hooks/useGeoPrice';

// Prices per region — edit the amounts here.
const CONTENT = {
  he: {
    pageTitle: "מחירים",
    book: "הזמן עכשיו",
    cards: [
      {
        title: "צילומי אירועים",
        desc: "צילום מקצועי לאירועים מיוחדים",
        price: "החל מ-₪1,500",
        items: ["צילום במשך 4 שעות", "עריכה מקצועית", "גלריה דיגיטלית", "50 תמונות ערוכות"],
      },
      {
        title: "צילומי פורטרט",
        desc: "צילומים אישיים ומשפחתיים",
        price: "החל מ-₪800",
        items: ["צילום במשך שעתיים", "עריכה מקצועית", "גלריה דיגיטלית", "25 תמונות ערוכות"],
      },
      {
        title: "צילומי מוצר",
        desc: "צילום מקצועי למוצרים ועסקים",
        price: "החל מ-₪600",
        items: ["צילום עד 10 מוצרים", "עריכה מקצועית", "רקע לבן נקי", "קבצים ברזולוציה גבוהה"],
      },
    ],
  },
  en: {
    pageTitle: "Pricing",
    book: "Book Now",
    cards: [
      {
        title: "Event Photography",
        desc: "Professional photography for special events",
        price: "From $450",
        items: ["4 hours of shooting", "Professional editing", "Digital gallery", "50 edited photos"],
      },
      {
        title: "Portrait Photography",
        desc: "Personal and family sessions",
        price: "From $250",
        items: ["2 hours of shooting", "Professional editing", "Digital gallery", "25 edited photos"],
      },
      {
        title: "Product Photography",
        desc: "Professional photography for products and businesses",
        price: "From $180",
        items: ["Up to 10 products", "Professional editing", "Clean white background", "High-resolution files"],
      },
    ],
  },
};

export default function PricingPage() {
  const { isIsrael } = useGeoPrice();
  const t = isIsrael === false ? CONTENT.en : CONTENT.he;

  return (
    <div className="container">
      <h1 className="section-title">{t.pageTitle}</h1>
      <div className="pricing-grid">
        {t.cards.map((card, i) => (
          <div className="price-card" key={i}>
            <h3>{card.title}</h3>
            <p>{card.desc}</p>
            <div className="price-range-text">{card.price}</div>
            <ul>
              {card.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
            <div className="book-btn-container">
              <a href="/contact" className="book">{t.book}</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
