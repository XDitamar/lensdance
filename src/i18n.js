// src/i18n.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// שפות RTL שנצטרך להפוך להן כיוון
const RTL_LANGS = ["he", "ar", "fa", "ur"];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: ["en", "he", "ru", "fr", "ar"],
    // גילוי שפה: קודם מה-localStorage, אח"כ מ-querystring, ואז מהדפדפן
    detection: {
      order: ["localStorage", "querystring", "navigator"],
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false }, // בלי Suspense כדי לא להסתבך
    // אפשר להתחיל עם משאבים כאן, ובהמשך לפצל לקבצי JSON נפרדים
    resources: {
      en: {
        common: {
          siteName: "Lens Dance",
          home: "Home",
          gallery: "Gallery",
          privateGallery: "Private Gallery",
          contact: "Contact",
          admin: "Admin",
          login: "Log in",
          logout: "Logout",
          language: "Language",
          menu: "Menu",
        },
      },
      he: {
        common: {
          siteName: "Lens Dance",
          home: "בית",
          gallery: "גלריה",
          privateGallery: "גלריה פרטית",
          contact: "צור קשר",
          admin: "ניהול",
          login: "התחבר",
          logout: "התנתק",
          language: "שפה",
          menu: "תפריט",
        },
      },
    },
    ns: ["common"],
    defaultNS: "common",
  });

// סנכרון dir/lang על ה-<html>
function syncHtmlDir(lang = i18n.language) {
  const dir = RTL_LANGS.includes(lang) ? "rtl" : "ltr";
  document.documentElement.setAttribute("dir", dir);
  document.documentElement.setAttribute("lang", lang);
}
i18n.on("languageChanged", syncHtmlDir);
syncHtmlDir();

export default i18n;
