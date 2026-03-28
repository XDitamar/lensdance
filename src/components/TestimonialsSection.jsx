import React from 'react';

const TestimonialsSection = () => {
  const testimonials = [
    {
      quote: "התמונות של הסוסה שלי יצאו מדהימות! הצלמת הצליחה לתפוס את הרוח החופשית שלה בצורה מושלמת. כל תמונה מספרת סיפור.",
      author: "שרה כהן",
      role: "רוכבת דרסאז'",
      stars: 5
    },
    {
      quote: "שירות מקצועי ותוצאות מעל הציפיות. הצילומים בתחרות יצאו חדים ומרהיבים, בדיוק מה שחיפשתי לאלבום הזיכרונות שלי.",
      author: "דני לוי",
      role: "רוכב קפיצות",
      stars: 5
    },
    {
      quote: "אחרי שנים של חיפוש אחר צלם שמבין סוסים, סוף סוף מצאתי! התמונות משקפות את הקשר המיוחד בינינו.",
      author: "מיכל אברהם",
      role: "בעלת חוות סוסים",
      stars: 5
    }
  ];

  const renderStars = (count) => {
    return '★'.repeat(count);
  };

  return (
    <div className="testimonials-section">
      <div className="container">
        <h2 className="section-title">מה הלקוחות שלנו אומרים</h2>
        <p>גלו מה רוכבים ובעלי סוסים אומרים על החוויה שלהם איתנו</p>
        
        <div className="testimonials-grid">
          {testimonials.map((testimonial, index) => (
            <div key={index} className="testimonial-card">
              <div className="testimonial-stars">
                {renderStars(testimonial.stars)}
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