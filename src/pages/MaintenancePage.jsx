// src/pages/MaintenancePage.jsx
//
// The "we're working on the site" screen. Which image shows is purely a matter
// of viewport width: comp.jpeg was drawn for desktop, mob.jpeg for phones.
// Both live in src/images so the bundler fingerprints them — that avoids a
// stale cached copy showing after the artwork is replaced.
//
// See src/components/MaintenanceGate.jsx for WHEN this screen appears.

import React from "react";
import { useTranslation } from "react-i18next";
import desktopImage from "../images/comp.jpeg";
import mobileImage from "../images/mob.jpeg";
import "./MaintenancePage.css";

const MaintenancePage = () => {
  const { t } = useTranslation();

  return (
    <div className="maintenance-container">
      <picture>
        <source media="(max-width: 768px)" srcSet={mobileImage} />
        <img
          src={desktopImage}
          alt={t("maintenance.alt")}
          className="maintenance-image"
        />
      </picture>
    </div>
  );
};

export default MaintenancePage;
