import { useState, useEffect } from "react";

export const PRICES = {
  IL: {
    currency: "₪", locale: "he-IL",
    perEntry:     { title: "תמונות לפי כניסה",   label: "60 ₪ לאדם",      extra: "30 ₪ לסוס נוסף",     sub: "60 ₪ לאדם · 30 ₪ לסוס נוסף",              from: "מ־60 ₪" },
    perPhoto:     { title: "תמונות לפי בחירה",   label: "6 ₪ לתמונה",      extra: "גישה לכל הצילומים",   sub: "גישה לכל הצילומים · 6 ₪ לתמונה ערוכה",     from: "מ־6 ₪" },
    videoPackage: { title: "חבילת וידאו",         label: "150 ₪",           extra: "ריל לאינסטגרם",       sub: "ריל מותאם אישית לאינסטגרם",                from: "150 ₪" },
    shortVideo:   { title: "סרטון קצר",           label: "70 ₪",            extra: "עד 15 שניות",         sub: "סרטון של עד 15 שניות",                     from: "70 ₪" },
    custom:       { title: "חבילה מותאמת אישית", label: "לפי ייעוץ",       extra: "ייעוץ אישי",          sub: "ייעוץ אישי · אירועים ותחרויות",             from: "לפי ייעוץ" },
  },
  INTL: {
    currency: "$", locale: "en-US",
    perEntry:     { title: "Photos per entry",    label: "$100 per person", extra: "$50 per additional horse", sub: "$100 per person · $50 per additional horse",    from: "From $100" },
    perPhoto:     { title: "Photos by selection", label: "$15 per photo",   extra: "Access to all photos",     sub: "Access to all photos · $15 per edited photo",   from: "From $15" },
    videoPackage: { title: "Video package",       label: "$350",            extra: "Custom Instagram Reel",    sub: "Custom Instagram Reel",                         from: "$350" },
    shortVideo:   { title: "Short video",         label: "$150",            extra: "Up to 15 seconds",         sub: "Video of up to 15 seconds",                     from: "$150" },
    custom:       { title: "Custom package",      label: "By consultation", extra: "Personal consultation",    sub: "Personal consultation · Events & competitions", from: "By consultation" },
  },
};

const COUNTRY_KEY = "ld_country";
let countryPromise = null;

// Detects the visitor's country once per session (cached in sessionStorage,
// deduped across components). Falls back to IL if the lookup fails.
export function detectCountry() {
  const cached = sessionStorage.getItem(COUNTRY_KEY);
  if (cached) return Promise.resolve(cached);
  if (!countryPromise) {
    countryPromise = fetch("https://ipapi.co/json/")
      .then(r => r.json())
      .then(d => {
        const c = d.country_code || "IL";
        sessionStorage.setItem(COUNTRY_KEY, c);
        return c;
      })
      .catch(() => {
        countryPromise = null;
        return "IL";
      });
  }
  return countryPromise;
}

export function useGeoPrice() {
  const [country, setCountry] = useState(() => sessionStorage.getItem(COUNTRY_KEY));

  useEffect(() => {
    if (!country) detectCountry().then(setCountry);
  }, [country]);

  const isIsrael = country === null ? null : country === "IL";
  const prices = country === null ? null : (isIsrael ? PRICES.IL : PRICES.INTL);

  return { prices, country, isIsrael, loading: country === null };
}
