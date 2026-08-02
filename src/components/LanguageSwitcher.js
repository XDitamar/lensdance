// src/components/LanguageSwitcher.js
//
// ⚠️ UNUSED — nothing imports this. The language picker people actually see is
// FloatingTranslateButton. Kept as a plain <select> alternative; it now goes
// through src/lib/lang.js like everything else, so the two can't drift apart.
// If you delete FloatingTranslateButton, this is the fallback; otherwise this
// file can go.

import React from "react";
import { applyTarget, reloadForTranslation, resolveTarget, toI18nCode } from "../lib/lang";

// App locale → Google locale (Hebrew is 'iw' for Google)
const TO_GOOGLE = { en: "en", he: "iw", ru: "ru", ar: "ar" };

export default function LanguageSwitcher() {
  // Keep the select in sync with the language actually in effect.
  const current = toI18nCode(resolveTarget());

  const onChange = (e) => {
    const googleCode = TO_GOOGLE[e.target.value] || "en";
    // manual: true — an explicit pick must survive browser-language detection.
    applyTarget(googleCode, { manual: true });
    reloadForTranslation();
  };

  return (
    <select
      aria-label="Language"
      value={current}
      onChange={onChange}
      className="auth-input" // reuse a small input style
      style={{ width: 140 }}
    >
      <option value="en">English</option>
      <option value="he">עברית</option>
      <option value="ru">Русский</option>
      <option value="ar">العربية</option>
    </select>
  );
}
