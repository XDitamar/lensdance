import React from "react";

export default function ContactPage() {
  return (
    <div className="container">
      <h2 className="section-title">Sign Up for the next competition</h2>
      <p>We'd love to hear from you! Fill out the form below ✨</p>

      <div className="google-form-embed" style={{ maxWidth: 700, margin: "0 auto" }}>
        <iframe
          src="https://docs.google.com/forms/d/1e5riv71cOnKm1Z51rPIjXpctAe1sQTAjrHM62Hz-Ahg/viewform?embedded=true"
          width="100%"
          height="800"
          frameBorder="0"
          marginHeight="0"
          marginWidth="0"
          title="Lens Dance Contact"
        >
          Loading…
        </iframe>
      </div>
    </div>
  );
}
