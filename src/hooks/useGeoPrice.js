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
  });

  const person = m("entryPerson");
  const photo = m("perPhoto");

  return {
    setName,
    currency: CURRENCIES[set.currency]?.symbol || "$",
    currencyCode: set.currency,
    amounts: set.amounts,
    money: m,

    perEntry: card("perEntry", { price: person, extraPrice: m("extraHorse") }),
    perPhoto: card("perPhoto", { price: photo }),
    videoPackage: card("videoPackage", { price: m("videoPackage") }),
    shortVideo: card("shortVideo", { price: m("shortVideo") }),
    custom: card("custom", {}),

    // /pricing — the three studio services
    services: [
      {
        id: "event",
        title: t("pricing.services.event.title"),
        desc: t("pricing.services.event.desc"),
        price: t("pricing.from", { price: m("eventShoot") }),
        items: t("pricing.services.event.items", { returnObjects: true }),
      },
      {
        id: "portrait",
        title: t("pricing.services.portrait.title"),
        desc: t("pricing.services.portrait.desc"),
        price: t("pricing.from", { price: m("portraitShoot") }),
        items: t("pricing.services.portrait.items", { returnObjects: true }),
      },
      {
        id: "product",
        title: t("pricing.services.product.title"),
        desc: t("pricing.services.product.desc"),
        price: t("pricing.from", { price: m("productShoot") }),
        items: t("pricing.services.product.items", { returnObjects: true }),
      },
    ],

    // /register — competition packages. The ids are a data contract with the
    // admin registrations page; never rename them.
    packages: [
      { id: "photos", label: t("pricing.packages.photos", { price: person }) },
      { id: "video", label: t("pricing.packages.video", { price: m("videoPackage") }) },
      { id: "short", label: t("pricing.packages.short", { price: m("shortVideo") }) },
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
