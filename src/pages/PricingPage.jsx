import React from 'react';
import { useTranslation } from 'react-i18next';
import { useGeoPrice } from '../hooks/useGeoPrice';

// Nothing to edit in this file:
//   amounts / currency → src/config/pricing.js  (PRICE_SETS + COUNTRY_SETS)
//   wording            → src/locales/*.json     ("pricing.services")
// The country picks the currency, the language picks the words, independently.

export default function PricingPage() {
  const { t } = useTranslation();
  const { prices } = useGeoPrice();

  return (
    <div className="container">
      <h1 className="section-title">{t('pricing.pageTitle')}</h1>
      <div className="pricing-grid">
        {prices.services.map((card) => (
          <div className="price-card" key={card.id}>
            <h3>{card.title}</h3>
            <p>{card.desc}</p>
            <div className="price-range-text">{card.price}</div>
            <ul>
              {(Array.isArray(card.items) ? card.items : []).map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
            <div className="book-btn-container">
              <a href="/contact" className="book">{t('pricing.book')}</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
