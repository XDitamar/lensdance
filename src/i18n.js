// src/i18n.js
//
// English is the site's source language: every UI string lives in
// src/locales/en.json and is authored in English. Hebrew, Russian and Arabic
// are real translations, hand-written against that file rather than run through
// Google Translate — the four are the hand-maintained locales.
//
// All four files share one structure: the same 458 keys, the same arrays with
// the same number of entries, the same {{placeholders}}. Adding a string means
// adding it to all four; there is a parity check worth re-running after edits
// (compare the flattened key sets of the four JSON files).
//
// The two legal texts — contact.agreement and competition.terms — deliberately
// keep the Hebrew body in every locale, prefixed with a note in that language
// saying the Hebrew version is the binding one. Translating a contract is a
// lawyer's job, not a translation exercise.
//
// i18next is only half the story. Whatever it does not cover — and any language
// other than these four — is handled by Google Translate on top. The rule for
// which locale the DOM renders in, and when Google kicks in, lives in
// src/lib/lang.js; do not duplicate that logic here.

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import he from "./locales/he.json";
import ru from "./locales/ru.json";
import ar from "./locales/ar.json";
import { i18nLangFor, resolveTarget } from "./lib/lang";

export const NATIVE_LANGS = ["en", "he", "ru", "ar"];
const RTL_LANGS = ["he", "ar"];
export const LANG_KEY = "ld_lang";

/**
 * The language to boot with. Derived from the resolved target (past choice →
 * active translation → browser language) so a Hebrew, Russian or Arabic
 * speaker gets the hand-written locale, and everyone else gets English for
 * Google to work from. Resolved at import time to avoid a flash of the wrong
 * language.
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
    ru: { common: ru },
    ar: { common: ar },
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
