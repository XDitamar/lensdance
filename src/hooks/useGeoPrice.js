// src/hooks/useGeoPrice.js
//
// Geo pricing: the visitor's country decides the currency and the amounts,
// the active UI language decides the wording. The two are deliberately
// independent — switching the site to English does NOT change ₪ into $, and
// reading the site in Hebrew from Berlin still shows € prices.
//
//   amounts + currency  → src/config/pricing.js   (edit prices there)
//   wording             → src/locales/*.json      ("pricing" block)
//
// The admin can force a country from the floating flag button
// (src/components/AdminCountryButton.jsx) to test the site as if browsing
// from abroad; that override is stored in localStorage and beats IP detection.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CURRENCIES,
  PRICE_SETS,
  DEFAULT_SET,
  LOADING_SET,
  PHOTOS_STANDARD,
  PHOTOS_EXTENDED,
  PHOTOS_BW,
  PRIORITY_RATE,
  PRIORITY_SLOTS,
  DEPOSIT_RATE,
  formatMoney,
  priceSetFor,
  setNameFor,
} from "../config/pricing";

const COUNTRY_KEY = "ld_country"; // sessionStorage — the detected country
export const COUNTRY_OVERRIDE_KEY = "ld_country_override"; // localStorage — admin's choice
const COUNTRY_EVENT = "ld:country-changed";

let countryPromise = null;

/* ── Admin override ─────────────────────────────────────────────────────── */

export function getCountryOverride() {
  try {
    return localStorage.getItem(COUNTRY_OVERRIDE_KEY) || null;
  } catch {
    return null;
  }
}

/** Force (or, with null, stop forcing) the country. Updates every live hook. */
export function setCountryOverride(code) {
  try {
    if (code) localStorage.setItem(COUNTRY_OVERRIDE_KEY, String(code).toUpperCase());
    else localStorage.removeItem(COUNTRY_OVERRIDE_KEY);
  } catch {}
  window.dispatchEvent(new Event(COUNTRY_EVENT));
}

/* ── Detection ──────────────────────────────────────────────────────────── */

/**
 * The visitor's country, looked up once per session (cached in sessionStorage
 * and deduped across components). An admin override short-circuits it, and a
 * failed lookup falls back to IL.
 */
export function detectCountry() {
  const override = getCountryOverride();
  if (override) return Promise.resolve(override);

  const cached = sessionStorage.getItem(COUNTRY_KEY);
  if (cached) return Promise.resolve(cached);

  if (!countryPromise) {
    countryPromise = fetch("https://ipapi.co/json/")
      .then((r) => r.json())
      .then((d) => {
        const c = (d.country_code || "IL").toUpperCase();
        sessionStorage.setItem(COUNTRY_KEY, c);
        return c;
      })
      .catch(() => {
        countryPromise = null; // let the next caller retry
        return "IL";
      });
  }
  return countryPromise;
}

/* ── Wording + amounts → ready-to-render strings ────────────────────────── */

/**
 * Builds the price cards. Shape is one object per card with
 * { title, label, extra, sub, from } — the same shape the pages have always
 * consumed, except the strings now come from i18n instead of a hardcoded table.
 */
function buildPrices(t, setName) {
  const set = PRICE_SETS[setName] || PRICE_SETS[DEFAULT_SET];
  const m = (key) => formatMoney(set.amounts[key], set.currency);

  const card = (key, vars) => ({
    title: t(`pricing.${key}.title`),
    label: t(`pricing.${key}.label`, vars),
    extra: t(`pricing.${key}.extra`, vars),
    sub: t(`pricing.${key}.sub`, vars),
    from: t(`pricing.${key}.from`, vars),
    // The bullet list under the card. `returnObjects` gives back the array
    // from the locale file with {{count}} / {{extraPrice}} already filled in.
    includes: t(`pricing.${key}.includes`, { ...vars, returnObjects: true }),
  });

  const person = m("entryPerson");

  return {
    setName,
    currency: CURRENCIES[set.currency]?.symbol || "$",
    currencyCode: set.currency,
    amounts: set.amounts,
    money: m,

    /* AT A COMPETITION — Alina's own definitions. The standard package covers
       the round and the warm-up; the extended one follows the whole day. */
    perEntry: card("perEntry", {
      price: person,
      extraPrice: m("extraHorse"),
      count: PHOTOS_STANDARD,
    }),
    extendedEntry: card("extendedEntry", {
      price: m("extendedEntry"),
      extraPrice: m("extraHorse"),
      count: PHOTOS_EXTENDED,
    }),
    videoPackage: card("videoPackage", { price: m("videoPackage") }),
    shortVideo: card("shortVideo", { price: m("shortVideo") }),
    obstacleVideo: card("obstacleVideo", { price: m("obstacleVideo") }),
    custom: card("custom", {}),

    /* A PERSONAL SESSION — booked time rather than coverage of a round the
       rider was already going to ride. That is why these are priced per
       session, carry deeper retouching, and quote the two add-ons (another
       horse, another animal) that only make sense when the shoot is yours. */
    sessionHour: card("sessionHour", {
      price: m("sessionHour"),
      extraHorse: m("extraHorseSession"),
      extraAnimal: m("extraAnimal"),
    }),
    sessionTwoHour: card("sessionTwoHour", {
      price: m("sessionTwoHour"),
      extraHorse: m("extraHorseSession"),
    }),
    sessionBW: card("sessionBW", { price: m("sessionBW"), count: PHOTOS_BW }),
    sessionTraining: card("sessionTraining", { price: m("sessionTraining") }),
    sessionsNote: t("pricing.sessionsNote"),

    /* Priority is an add-on rather than a package: a share of the entry price
       for a 48-hour turnaround, capped so a weekend can't become unworkable. */
    priority: {
      title: t("pricing.priority.title"),
      label: t("pricing.priority.label", {
        price: formatMoney(Math.round(set.amounts.entryPerson * PRIORITY_RATE), set.currency),
      }),
      sub: t("pricing.priority.sub"),
      slots: t("pricing.priority.slots", { count: PRIORITY_SLOTS }),
      addon: t("pricing.priority.addon"),
      amount: Math.round(set.amounts.entryPerson * PRIORITY_RATE),
    },

    /* One deposit line, reused by the cards, the sign-up form and the terms. */
    deposit: t("pricing.deposit", { percent: Math.round(DEPOSIT_RATE * 100) }),
    depositPercent: Math.round(DEPOSIT_RATE * 100),
    includesTitle: t("pricing.includesTitle"),

    /* The two things a visitor is choosing between before any price matters:
       "you come to my show" or "we book a day". The pricing pages render this
       as a pair of tabs — see PricingPage.jsx / HomePage.jsx.
       TO REVERT: delete this array and go back to rendering the four
       competition cards directly. */
    groups: [
      {
        id: "competition",
        label: t("pricing.groups.competition"),
        hint: t("pricing.groupHint.competition"),
        cardKeys: [
          "perEntry",
          "extendedEntry",
          "videoPackage",
          "shortVideo",
          "obstacleVideo",
          "custom",
        ],
      },
      {
        id: "personal",
        label: t("pricing.groups.personal"),
        hint: t("pricing.groupHint.personal"),
        cardKeys: [
          "sessionHour",
          "sessionTwoHour",
          "sessionBW",
          "sessionTraining",
          "custom",
        ],
      },
    ],

    // /register — competition packages. The ids are a data contract with the
    // admin registrations page; never rename them.
    packages: [
      { id: "photos", label: t("pricing.packages.photos", { price: person }) },
      { id: "video", label: t("pricing.packages.video", { price: m("videoPackage") }) },
      { id: "extended", label: t("pricing.packages.extended", { price: m("extendedEntry") }) },
      { id: "short", label: t("pricing.packages.short", { price: m("shortVideo") }) },
      { id: "obstacle", label: t("pricing.packages.obstacle", { price: m("obstacleVideo") }) },
      {
        // How many places are left is deliberately NOT in this label: the
        // sign-up form shows a live count next to the field (see
        // src/lib/priority.js), and a hardcoded "only 5 places" beside it
        // would contradict the real number as soon as one was taken.
        id: "priority",
        label: t("pricing.packages.priority", {
          price: formatMoney(Math.round(set.amounts.entryPerson * PRIORITY_RATE), set.currency),
        }),
      },
    ],
  };
}

/* ── The hook ───────────────────────────────────────────────────────────── */

export function useGeoPrice() {
  const { t, i18n } = useTranslation();
  const [country, setCountry] = useState(
    () => getCountryOverride() || sessionStorage.getItem(COUNTRY_KEY)
  );

  useEffect(() => {
    let alive = true;

    const read = () => {
      const next = getCountryOverride() || sessionStorage.getItem(COUNTRY_KEY);
      if (alive && next) setCountry(next);
    };

    if (!country) detectCountry().then((c) => alive && setCountry(c));
    window.addEventListener(COUNTRY_EVENT, read);
    return () => {
      alive = false;
      window.removeEventListener(COUNTRY_EVENT, read);
    };
  }, [country]);

  const loading = !country;
  // While the lookup is in flight, render Israeli prices rather than an empty
  // card — most visitors are Israeli, so this is right far more often than not.
  const setName = loading ? LOADING_SET : setNameFor(country);
  const prices = buildPrices(t, setName);

  return {
    prices,
    country: country || null,
    priceSet: setName,
    currency: prices.currency,
    /** Kept for the pages that still branch on it. Null until detection ends. */
    isIsrael: loading ? null : country === "IL",
    loading,
    // Handy escape hatch for one-off amounts not covered by `prices`.
    money: prices.money,
    language: i18n.language,
  };
}

/** Non-hook access to the raw numbers, for code outside React. */
export { priceSetFor, formatMoney };
