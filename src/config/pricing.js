// src/config/pricing.js
//
// ─────────────────────────────────────────────────────────────────────────────
// PER-COUNTRY PRICING
// ─────────────────────────────────────────────────────────────────────────────
//
// Three tables, edited by hand:
//
//   CURRENCIES   — how a number turns into a string ("60 ₪" vs "$100").
//   PRICE_SETS   — the actual amounts. One entry = one currency + a full
//                  list of prices. Sets are shared by many countries.
//   COUNTRY_SETS — ISO-3166 alpha-2 country code → price set name.
//
// TO GIVE A COUNTRY ITS OWN PRICES:
//   1. add a new set to PRICE_SETS (copy an existing one, change the numbers)
//   2. point the country at it in COUNTRY_SETS, e.g.  DE: "DE",
//   Anything not listed in COUNTRY_SETS falls back to DEFAULT_SET.
//
// IMPORTANT — only NUMBERS live in this file, never user-facing wording.
// The wording comes from the translation files (src/locales/*.json, the
// "pricing" block). That keeps language and currency independent, which is
// what we want: a Hebrew speaker browsing from Germany reads Hebrew text with
// € prices. See src/hooks/useGeoPrice.js, which glues the two together.

/* ── Currencies ─────────────────────────────────────────────────────────── */

export const CURRENCIES = {
  // `suffix: true` puts the symbol after the number, the Hebrew convention.
  ILS: { symbol: "₪", locale: "he-IL", suffix: true },
  USD: { symbol: "$", locale: "en-US", suffix: false },
  EUR: { symbol: "€", locale: "de-DE", suffix: false },
  GBP: { symbol: "£", locale: "en-GB", suffix: false },
};

/** 60 → "60 ₪" / 100 → "$100". Never returns fractions — prices are round. */
export function formatMoney(amount, currencyKey) {
  const c = CURRENCIES[currencyKey] || CURRENCIES.USD;
  if (amount == null || Number.isNaN(Number(amount))) return "";
  let n;
  try {
    n = new Intl.NumberFormat(c.locale, { maximumFractionDigits: 0 }).format(amount);
  } catch {
    n = String(amount);
  }
  return c.suffix ? `${n} ${c.symbol}` : `${c.symbol}${n}`;
}

/* ── Price sets ─────────────────────────────────────────────────────────── */
//
// Every set MUST define every key below, otherwise that price renders empty.
// The keys are referenced by name in src/hooks/useGeoPrice.js.
//
//   entryPerson    photos per competition entry, per rider
//   extraHorse     surcharge for each additional horse on the same entry
//   perPhoto       single edited photo, when buying by selection
//   videoPackage   the full Instagram-Reel package
//   shortVideo     clip of up to 15 seconds
//   eventShoot     /pricing — event photography, starting price
//   portraitShoot  /pricing — portrait session, starting price
//   productShoot   /pricing — product photography, starting price

export const PRICE_SETS = {
  IL: {
    currency: "ILS",
    amounts: {
      entryPerson: 60,
      extraHorse: 30,
      perPhoto: 6,
      videoPackage: 150,
      shortVideo: 70,
      eventShoot: 1500,
      portraitShoot: 800,
      productShoot: 600,
    },
  },

  // Rest of the world / anywhere without a dedicated set.
  INTL: {
    currency: "USD",
    amounts: {
      entryPerson: 100,
      extraHorse: 50,
      perPhoto: 15,
      videoPackage: 350,
      shortVideo: 150,
      eventShoot: 450,
      portraitShoot: 250,
      productShoot: 180,
    },
  },

  // Continental Europe. Amounts are the INTL prices re-cut in euros — adjust
  // them freely, they are NOT auto-converted from USD.
  EU: {
    currency: "EUR",
    amounts: {
      entryPerson: 90,
      extraHorse: 45,
      perPhoto: 14,
      videoPackage: 320,
      shortVideo: 140,
      eventShoot: 420,
      portraitShoot: 230,
      productShoot: 170,
    },
  },

  // United Kingdom.
  UK: {
    currency: "GBP",
    amounts: {
      entryPerson: 80,
      extraHorse: 40,
      perPhoto: 12,
      videoPackage: 280,
      shortVideo: 120,
      eventShoot: 360,
      portraitShoot: 200,
      productShoot: 150,
    },
  },
};

/** Used for any country missing from COUNTRY_SETS. */
export const DEFAULT_SET = "INTL";

/**
 * Shown while the visitor's country is still being looked up. Israel is the
 * bulk of the traffic, so defaulting there avoids a currency flicker for most
 * people on first paint.
 */
export const LOADING_SET = "IL";

/* ── Country → price set ────────────────────────────────────────────────── */
//
// Add a line here to move a country onto a different set. Countries not listed
// use DEFAULT_SET.

export const COUNTRY_SETS = {
  IL: "IL",

  GB: "UK",
  IE: "EU",

  // Eurozone
  AT: "EU", BE: "EU", CY: "EU", EE: "EU", FI: "EU", FR: "EU", DE: "EU",
  GR: "EU", IT: "EU", LV: "EU", LT: "EU", LU: "EU", MT: "EU", NL: "EU",
  PT: "EU", SK: "EU", SI: "EU", ES: "EU", HR: "EU",

  // Rest of Europe — priced in euros too, since € is the currency visitors
  // there compare against even when it isn't their own.
  BG: "EU", CZ: "EU", DK: "EU", HU: "EU", PL: "EU", RO: "EU", SE: "EU",
  NO: "EU", CH: "EU", IS: "EU", RS: "EU", UA: "EU", TR: "EU",

  // Explicitly on the dollar set (same as the fallback, listed for clarity)
  US: "INTL", CA: "INTL", AU: "INTL", NZ: "INTL",
};

/** Country code → price set name. Case-insensitive, safe with null. */
export function setNameFor(countryCode) {
  const cc = String(countryCode || "").toUpperCase();
  return COUNTRY_SETS[cc] || DEFAULT_SET;
}

/** Country code → the price set object itself. */
export function priceSetFor(countryCode) {
  return PRICE_SETS[setNameFor(countryCode)] || PRICE_SETS[DEFAULT_SET];
}

/**
 * The countries offered in the admin's "view the site as…" switcher.
 * One per distinct price set plus a couple of useful extras.
 */
export const TEST_COUNTRIES = [
  { code: "IL", label: "ישראל · Israel" },
  { code: "US", label: "ארה״ב · United States" },
  { code: "GB", label: "בריטניה · United Kingdom" },
  { code: "DE", label: "גרמניה · Germany" },
  { code: "FR", label: "צרפת · France" },
  { code: "RU", label: "רוסיה · Russia" },
  { code: "AU", label: "אוסטרליה · Australia" },
];
