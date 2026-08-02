// src/pages/MaintenancePage.jsx
//
// The "we're working on the site" screen. Which image shows is purely a matter
// of viewport width: the wide artwork for desktop, the tall one for phones.
//
// ⚠️ These are .webp ON PURPOSE, converted from the original comp.jpeg /
// mob.jpeg. `.gitattributes` routes every *.jpeg through Git LFS, and Vercel
// checks out the 130-byte LFS pointer instead of the actual file — so a .jpeg
// here would render as a broken image in production, on the very screen that
// is supposed to be up while everything else is down. Keep this format.
//
// See src/components/MaintenanceGate.jsx for WHEN this screen appears.

import React from "react";
import { useTranslation } from "react-i18next";
import desktopImage from "../images/maintenance-desktop.webp";
import mobileImage from "../images/maintenance-mobile.webp";
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
