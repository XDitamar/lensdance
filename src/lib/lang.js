// src/lib/lang.js
//
// ─────────────────────────────────────────────────────────────────────────────
// THE SITE'S LANGUAGE ALGORITHM — one place, read this before touching i18n
// ─────────────────────────────────────────────────────────────────────────────
//
// The site has two translation layers and they cover different things:
//
//   1. i18next (src/locales/en, he, ru, ar) — hand-written, perfect quality,
//      but it only covers the strings that have actually been migrated into it.
//   2. Google Translate — covers EVERY text node on the page, including the
//      Hebrew still hardcoded in the JSX, but it is machine quality.
//
// The rule that gets full coverage in every language:
//
//   target is a NATIVE_TARGET     → i18next renders that locale, Google
//   ("iw", "ru", "ar")              Translate OFF. The hand-written file is
//                                   better than anything Google would produce,
//                                   and layering Google on top of it would only
//                                   re-translate good text into worse text.
//
//   any other target              → i18next "en", Google Translate ON with
//                                   source "auto". i18next renders its own
//                                   strings in English, Google then translates
//                                   the whole page — the English from i18next
//                                   AND the leftover hardcoded Hebrew — into
//                                   the target language.
//
// Adding a language to NATIVE_TARGETS is a two-step change: write the locale
// file (all 458 keys, see src/i18n.js) and add the Google code here. Adding it
// here alone turns Google off for a language i18next cannot actually render,
// which leaves the visitor looking at English.
//
// Why source "auto" and not "en" or "iw": the DOM is a mix of both languages,
// so a fixed source makes Google mistranslate half the page. "auto" lets it
// detect per block. This is also why English is not a no-op: a visitor asking
// for English needs Google to turn the hardcoded Hebrew into English.
//
// Which target we pick, in priority order:
//   1. the visitor's own choice from the floating translate button (sticky)
//   2. the browser's language (navigator.languages)
//   3. English
//
// Note the vocabulary: "Google codes" have legacy quirks — Hebrew is "iw",
// Javanese "jw", Chinese "zh-CN" / "zh-TW". Everything in this file speaks
// Google codes; toI18nCode() converts at the i18next boundary.

import { findLanguage } from "./languages";

/** Set once the visitor picks a language by hand — auto-detection never wins after that. */
export const MANUAL_KEY = "ld_lang_manual";
/** The chosen target, in Google's code space. */
export const TARGET_KEY = "ld_lang_target";
/** Guards against reload loops within a session. */
export const AUTO_DONE_KEY = "ld_lang_auto_done";

export const HEBREW = "iw"; // Google's legacy code for Hebrew

/**
 * The targets i18next serves from a hand-written locale file. Google codes —
 * hence "iw" rather than "he". Must stay in step with NATIVE_LANGS in
 * src/i18n.js, which is the same list in i18next's code space.
 */
export const NATIVE_TARGETS = [HEBREW, "ru", "ar"];

/* ── Code normalisation ─────────────────────────────────────────────────── */

/**
 * A BCP-47 tag from the browser ("pt-BR", "zh-Hant", "he-IL") → the code
 * Google Translate wants, or null when Google has no such language.
 */
export function toGoogleCode(tag) {
  const raw = String(tag || "").trim().toLowerCase();
  if (!raw) return null;

  const [base, ...rest] = raw.split("-");
  const region = rest.join("-");

  if (base === "he" || base === "iw") return HEBREW;
  if (base === "jv" || base === "jw") return "jw";
  if (base === "zh") {
    // Traditional for Taiwan / Hong Kong / the "Hant" script tag.
    return /hant|tw|hk|mo/.test(region) ? "zh-TW" : "zh-CN";
  }
  if (base === "nb" || base === "nn") return "no"; // Norwegian variants
  if (base === "fil") return "tl"; // Filipino → Tagalog

  // Google keeps a couple of regional codes; try the full tag before the base.
  if (region && findLanguage(raw)) return raw;
  return findLanguage(base) ? base : null;
}

/** Google code → the code i18next / the <html lang> attribute want. */
export function toI18nCode(googleCode) {
  const g = String(googleCode || "en").toLowerCase();
  return g === "iw" ? "he" : g.split("-")[0];
}

/* ── Where the target comes from ────────────────────────────────────────── */

export function isManualChoice() {
  try {
    return !!localStorage.getItem(MANUAL_KEY);
  } catch {
    return false;
  }
}

export function savedTarget() {
  try {
    return localStorage.getItem(TARGET_KEY) || null;
  } catch {
    return null;
  }
}

/** The best Google code for this browser, e.g. "ru" / "iw" / "fr". */
export function browserTarget() {
  const nav = typeof navigator === "undefined" ? {} : navigator;
  const list = nav.languages && nav.languages.length ? [...nav.languages] : [nav.language];
  for (const tag of list) {
    const code = toGoogleCode(tag);
    if (code) return code;
  }
  return "en";
}

/**
 * The target the site should be showing right now: an explicit past choice
 * first, then the cookie already in effect, then the browser's language.
 */
export function resolveTarget() {
  const saved = savedTarget();
  if (saved && isManualChoice()) return saved;
  const fromCookie = cookieTarget();
  if (fromCookie) return fromCookie;
  return browserTarget();
}

/** Whether this target is served natively by i18next instead of Google. */
export const isNativeTarget = (target) =>
  NATIVE_TARGETS.includes(String(target || "").toLowerCase());

/**
 * Google code → the i18next language to render the DOM in. Native targets map
 * to their own locale ("iw" → "he"); everything else renders in English and
 * lets Google translate the result.
 */
export const i18nLangFor = (target) =>
  isNativeTarget(target) ? toI18nCode(target) : "en";

/* ── The googtrans cookie ───────────────────────────────────────────────── */
//
// Google reads a single cookie, `googtrans=/<source>/<target>`. We always
// write source "auto" (see the header comment) and we write exactly one value:
// writing several variants at once leaves it undefined which one Google picks.

const FOREVER = "Fri, 31 Dec 9999 23:59:59 GMT";
const EPOCH = "Thu, 01 Jan 1970 00:00:00 GMT";

function cookieDomains() {
  const host = window.location.hostname;
  // undefined = "current host only", which is the one that works on localhost.
  return [undefined, host, host.startsWith(".") ? host : "." + host];
}

/** The target currently in the cookie, or null if there is no translation on. */
export function cookieTarget() {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
  if (!m) return null;
  const target = decodeURIComponent(m[1]).split("/")[2];
  return target || null;
}

export function clearGoogTrans() {
  // The value is irrelevant when deleting — an expiry in the past is what
  // removes the cookie. We try every domain form because we don't know which
  // one it was written under (localhost vs the deployed host).
  for (const domain of cookieDomains()) {
    const d = domain ? `; domain=${domain}` : "";
    document.cookie = `googtrans=${d}; expires=${EPOCH}; max-age=0; path=/`;
  }
}

export function setGoogTrans(target) {
  clearGoogTrans();
  for (const domain of cookieDomains()) {
    const d = domain ? `; domain=${domain}` : "";
    document.cookie = `googtrans=/auto/${target}${d}; expires=${FOREVER}; path=/`;
  }
}

/**
 * Persist and apply a target language. `manual` marks it as the visitor's own
 * choice, which auto-detection must never override afterwards.
 * Returns true when the page needs a reload for Google to pick the change up.
 */
export function applyTarget(target, { manual = false } = {}) {
  const next = target || "en";
  try {
    localStorage.setItem(TARGET_KEY, next);
    if (manual) localStorage.setItem(MANUAL_KEY, "1");
  } catch {}

  const current = cookieTarget();

  if (isNativeTarget(next)) {
    if (!current) return false; // already native Hebrew, nothing to undo
    clearGoogTrans();
    try {
      sessionStorage.removeItem("translated");
    } catch {}
    return true;
  }

  if (current === next) return false; // already translated into this language
  setGoogTrans(next);
  try {
    sessionStorage.setItem("translated", "true");
  } catch {}
  return true;
}

/** Reload without re-submitting anything, so Google re-renders the page. */
export function reloadForTranslation() {
  window.location.assign(window.location.pathname + window.location.search);
}
