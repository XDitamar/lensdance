// src/i18n.js
//
// English is the site's source language: every UI string lives in
// src/locales/en.json and is authored in English. Hebrew is a real translation
// (src/locales/he.json), NOT a Google Translate pass — the two are the only
// hand-maintained locales.
//
// i18next is only half the story. Whatever it does not cover — and any language
// other than these two — is handled by Google Translate on top. The rule for
// which of the two locales the DOM renders in, and when Google kicks in, lives
// in src/lib/lang.js; do not duplicate that logic here.

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import he from "./locales/he.json";
import { i18nLangFor, resolveTarget } from "./lib/lang";

export const NATIVE_LANGS = ["en", "he"];
const RTL_LANGS = ["he"];
export const LANG_KEY = "ld_lang";

/**
 * The language to boot with. Derived from the resolved target (past choice →
 * active translation → browser language) so a Hebrew-speaking visitor gets the
 * hand-written Hebrew, and everyone else gets English for Google to work from.
 * Resolved at import time to avoid a flash of the wrong language.
 */
function initialLang() {
  try {
    return i18nLangFor(resolveTarget());
  } catch {
    return "en";
  }
}

i18n.use(initReactI18next).init({
  lng: initialLang(),
  fallbackLng: "en",
  supportedLngs: NATIVE_LANGS,
  resources: {
    en: { common: en },
    he: { common: he },
  },
  ns: ["common"],
  defaultNS: "common",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

/* Keep <html lang/dir> in step with the active language. */
function syncHtmlDir(lang = i18n.language) {
  const base = String(lang || "en").split("-")[0];
  document.documentElement.setAttribute("lang", base);
  document.documentElement.setAttribute("dir", RTL_LANGS.includes(base) ? "rtl" : "ltr");
}
i18n.on("languageChanged", (lng) => {
  try { localStorage.setItem(LANG_KEY, lng); } catch {}
  syncHtmlDir(lng);
});
syncHtmlDir();

export const isRtlLang = (lang = i18n.language) =>
  RTL_LANGS.includes(String(lang || "en").split("-")[0]);

export default i18n;
