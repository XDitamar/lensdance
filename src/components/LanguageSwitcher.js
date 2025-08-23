// src/components/LanguageSwitcher.jsx
import React from "react";
import { useTranslation } from "react-i18next";

const LANGS = [
  { code: "en", label: "English" },
  { code: "he", label: "עברית" },
  { code: "ru", label: "Русский" },
  { code: "fr", label: "Français" },
  { code: "ar", label: "العربية" },
];

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <label className="lang-switcher">
      <span className="sr-only">{t("language")}</span>
      <select
        value={i18n.resolvedLanguage}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        aria-label={t("language")}
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
