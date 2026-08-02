import React from 'react';
import { useTranslation } from 'react-i18next';

const TestimonialsSection = () => {
  const { t } = useTranslation();
  // returnObjects gives us the array straight out of the locale file, so
  // adding or removing a testimonial is a JSON edit, not a code change.
  const testimonials = t('testimonials.items', { returnObjects: true }) || [];

  const renderStars = (count) => {
    return '★'.repeat(count);
  };

  return (
    <div className="testimonials-section">
      <div className="container">
        <h2 className="section-title">{t('testimonials.title')}</h2>
        <p>{t('testimonials.subtitle')}</p>
        
        <div className="testimonials-grid">
          {testimonials.map((testimonial, index) => (
            <div key={index} className="testimonial-card">
              <div className="testimonial-stars">
                {renderStars(testimonial.stars || 5)}
              </div>
              <div className="testimonial-quote">
                {testimonial.quote}
              </div>
              <div className="testimonial-author">
                {testimonial.author}
              </div>
              <div className="testimonial-role">
                {testimonial.role}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TestimonialsSection;