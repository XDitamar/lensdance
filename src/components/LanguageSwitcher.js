import React from "react";

// Map app locale → Google locale (Hebrew is 'iw' for Google)
const TO_GOOGLE = { en: "en", he: "iw", ru: "ru", ar: "ar" };

// Write cookie for all paths + subdomains
function setGoogTransCookie(target) {
  const v = `/en/${target}`; // source=en, target=<lang>
  document.cookie = `googtrans=${v}; expires=Fri, 31 Dec 9999 23:59:59 GMT; path=/`;
  document.cookie = `googtrans=${v}; domain=${window.location.hostname}; expires=Fri, 31 Dec 9999 23:59:59 GMT; path=/`;
}

export default function LanguageSwitcher() {
  // read current cookie to keep the select in sync
  const current = (() => {
    const m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
    const raw = m ? decodeURIComponent(m[1]) : "/en/en";
    const tgt = (raw.split("/")[2] || "en").toLowerCase();
    // normalize 'iw' back to 'he'
    return tgt === "iw" ? "he" : tgt;
  })();

  const onChange = (e) => {
    const appCode = e.target.value;          // 'en' | 'he' | 'ru' | 'ar'
    const googleCode = TO_GOOGLE[appCode];   // 'en' | 'iw' | 'ru' | 'ar'
    setGoogTransCookie(googleCode);

    // Optional: remember a flag like your old code
    if (appCode !== "en") sessionStorage.setItem("translated", "true");
    else sessionStorage.removeItem("translated");

    // Easiest + most reliable way to apply across SPA
    window.location.reload();
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
