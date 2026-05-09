// src/pages/MaintenancePage.jsx
import React from "react";
import "./MaintenancePage.css"; // מייבאים את קובץ העיצוב

const MaintenancePage = () => {
  return (
    <div className="maintenance-container">
      <img
        src="/mob.jpeg"
        alt="האתר בתחזוקה"
        className="maintenance-image"
      />
    </div>
  );
};

export default MaintenancePage;