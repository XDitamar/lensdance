import React, { useState } from "react";
import { useGeoPrice } from "../hooks/useGeoPrice";

const COMPETITIONS = [
  { id: "spring2024", name: "אליפות האביב 2024", nameEn: "Spring Championship 2024", date: "2024-04-15" },
  { id: "summer2024", name: "תחרות הקיץ הגדולה", nameEn: "Grand Summer Competition", date: "2024-07-20" },
  { id: "autumn2024", name: "גביע הסתיו", nameEn: "Autumn Cup", date: "2024-10-10" },
  { id: "winter2024", name: "אליפות החורף", nameEn: "Winter Championship", date: "2024-12-05" },
];

export default function CompetitionRegistration() {
  const { prices, isIsrael, loading } = useGeoPrice();
  const [formData, setFormData] = useState({
    competition: "",
    riderName: "",
    horseName: "",
    email: "",
    phone: "",
    package: "perEntry",
    additionalHorses: 0,
    notes: ""
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    // Here you would typically send the data to your backend
    console.log("Registration submitted:", formData);
    setSubmitted(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  if (loading) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div style={{ textAlign: "center", padding: "40px" }}>
            <div>טוען...</div>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="auth-title">
              {isIsrael ? "הרשמה התקבלה!" : "Registration Received!"}
            </h1>
            <p className="auth-subtitle">
              {isIsrael 
                ? "תודה על ההרשמה. נחזור אליך בהקדם עם פרטי התשלום והתיאום."
                : "Thank you for registering. We'll get back to you soon with payment details and coordination."
              }
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">
            {isIsrael ? "הרשמה לתחרות" : "Competition Registration"}
          </h1>
          <p className="auth-subtitle">
            {isIsrael 
              ? "הזמן צילום מקצועי לתחרות הבאה שלך"
              : "Book professional photography for your next competition"
            }
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-label">
            <span>{isIsrael ? "תחרות" : "Competition"}</span>
            <select 
              name="competition" 
              value={formData.competition}
              onChange={handleChange}
              className="auth-input"
              required
            >
              <option value="">
                {isIsrael ? "בחר תחרות" : "Select Competition"}
              </option>
              {COMPETITIONS.map(comp => (
                <option key={comp.id} value={comp.id}>
                  {isIsrael ? comp.name : comp.nameEn} - {comp.date}
                </option>
              ))}
            </select>
          </label>

          <label className="auth-label">
            <span>{isIsrael ? "שם הרוכב/ת" : "Rider Name"}</span>
            <input
              type="text"
              name="riderName"
              value={formData.riderName}
              onChange={handleChange}
              className="auth-input"
              required
            />
          </label>

          <label className="auth-label">
            <span>{isIsrael ? "שם הסוס" : "Horse Name"}</span>
            <input
              type="text"
              name="horseName"
              value={formData.horseName}
              onChange={handleChange}
              className="auth-input"
              required
            />
          </label>

          <label className="auth-label">
            <span>{isIsrael ? "אימייל" : "Email"}</span>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="auth-input"
              required
            />
          </label>

          <label className="auth-label">
            <span>{isIsrael ? "טלפון" : "Phone"}</span>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="auth-input"
              required
            />
          </label>

          <label className="auth-label">
            <span>{isIsrael ? "חבילת צילום" : "Photography Package"}</span>
            <select 
              name="package" 
              value={formData.package}
              onChange={handleChange}
              className="auth-input"
              required
            >
              <option value="perEntry">
                {prices?.perEntry.label} - {prices?.perEntry.extra}
              </option>
              <option value="perPhoto">
                {prices?.perPhoto.label} - {prices?.perPhoto.extra}
              </option>
              <option value="videoPackage">
                {prices?.videoPackage.label} - {prices?.videoPackage.extra}
              </option>
              <option value="custom">
                {prices?.custom.label} - {prices?.custom.extra}
              </option>
            </select>
          </label>

          {formData.package === "perEntry" && (
            <label className="auth-label">
              <span>
                {isIsrael ? "סוסים נוספים" : "Additional Horses"}
              </span>
              <input
                type="number"
                name="additionalHorses"
                value={formData.additionalHorses}
                onChange={handleChange}
                className="auth-input"
                min="0"
                max="10"
              />
            </label>
          )}

          <label className="auth-label">
            <span>{isIsrael ? "הערות נוספות" : "Additional Notes"}</span>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="auth-input"
              rows="3"
              placeholder={isIsrael 
                ? "זמני רכיבה, בקשות מיוחדות, וכו'"
                : "Riding times, special requests, etc."
              }
            />
          </label>

          <button type="submit" className="auth-primary">
            {isIsrael ? "שלח הרשמה" : "Submit Registration"}
          </button>
        </form>

        <div style={{ marginTop: "20px", padding: "15px", background: "#f9f9f9", borderRadius: "8px", fontSize: "0.9em", color: "#666" }}>
          <p style={{ margin: "0 0 8px", fontWeight: "600" }}>
            {isIsrael ? "מידע חשוב:" : "Important Information:"}
          </p>
          <ul style={{ margin: 0, paddingLeft: isIsrael ? "0" : "20px", paddingRight: isIsrael ? "20px" : "0" }}>
            <li>
              {isIsrael 
                ? "המחירים הם טווחי פתיחה - הצעת מחיר מדויקת תישלח לאחר הרשמה"
                : "Prices are starting ranges - exact quote will be sent after registration"
              }
            </li>
            <li>
              {isIsrael 
                ? "התשלום יתבצע ביום התחרות או מראש לפי תיאום"
                : "Payment on competition day or in advance by arrangement"
              }
            </li>
            <li>
              {isIsrael 
                ? "התמונות יועלו לגלריה פרטית תוך 48 שעות"
                : "Photos will be uploaded to private gallery within 48 hours"
              }
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}