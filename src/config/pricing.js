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
//   entryPerson    standard photo package — PHOTOS_STANDARD edited photos
//   extendedEntry  extended photo package — PHOTOS_EXTENDED and up
//   extraHorse     surcharge for each additional horse on the same entry
//   videoPackage   the full edit: 45s+, slow motion, plus a clean second cut
//   shortVideo     up to 25 seconds — the round, atmosphere over detail
//   obstacleVideo  up to 15 seconds — one fence or combination
//   sessionHour     personal session, one hour, horse + rider
//   sessionTwoHour  personal session, two hours, three outfits
//   sessionBW       black-and-white portrait sitting — PHOTOS_BW finished
//                   images. Fewest deliverables of any session but the most
//                   editing time per image, which is why the per-photo rate
//                   looks high next to the others.
//   sessionTraining a private training session, photos + short clips
//   extraHorseSession   each additional horse on a personal session
//   extraAnimal     another animal on the shoot — a dog, say
//   eventShoot      /pricing — event photography, starting price
//   productShoot    /pricing — kept for now, not shown anywhere

// ─────────────────────────────────────────────────────────────────────────────
// HOW THESE NUMBERS WERE SET (reviewed August 2026)
//
// Each overseas set is benchmarked against what local equestrian photographers
// publish, and deliberately sits AT OR BELOW that line. The benchmarks:
//
//   US   $15–40 per horse/rider just for show coverage; $17–25 per digital
//        image; $225 per division incl. 10 images; $150 day rate incl. 50
//        images; $375–450 for a studio/portrait session.
//   UK   £30 per rider for a yard session, £180 minimum half day;
//        £275 for two hours of event coverage, £110 each further hour.
//   EU   €38 + VAT per competition image (established press rate);
//        €200–250 average for a shoot; €75 for a basic package.
//
// STRATEGY: volume, not margin per rider. These sit well under every local
// benchmark on purpose — the aim is that most riders at a competition order
// rather than a handful paying a premium. Undercutting the market is the whole
// pitch for a visiting photographer nobody there has heard of yet.
//
// TRAVEL. A competition abroad costs roughly ₪1,600–2,000 all in — return
// flights out of Tel Aviv run ₪496 in February to ₪841 in August, plus two
// nights and ground transport. That is about €400.
//
//   7 riders  × €60  = €420   → the trip is paid for
//   15 riders × €60  = €900   → ~€500 clear
//
// Seven orders is a modest weekend, which is the point: the price is low
// enough that hitting that number is the normal case rather than a good one.
// If a competition realistically yields fewer than about seven orders, the
// economics come from raising the count, not the price.
//
// ISRAEL is left where Alina had it. No Israeli equestrian photographer
// publishes a rate — they quote by phone — so there is nothing honest to
// benchmark against, and raising a home market on guesswork risks the client
// base she already has. Worth revisiting with her directly.
// ─────────────────────────────────────────────────────────────────────────────

export const PRICE_SETS = {
  IL: {
    currency: "ILS",
    amounts: {
      entryPerson: 60,
      // Lowered from 120 (August 2026). Still well clear of the 60 ₪ standard
      // package, so the step up still pays for the extra coverage — the course
      // walk, the close-ups, the podium and the vet check.
      // As with sessionBW, not mirrored in the overseas sets: those are pitched
      // against their own local markets rather than converted from shekels.
      extendedEntry: 100,
      extraHorse: 30,
      videoPackage: 150,
      shortVideo: 80,
      obstacleVideo: 70,
      eventShoot: 1500,
      sessionHour: 800,
      sessionTwoHour: 1450,
      // Raised from 600 (August 2026). Five finished portraits at 170 ₪ each —
      // the highest per-photo rate of any session, which is the point: it has
      // the fewest deliverables and by far the most retouching time per image.
      // Deliberately NOT mirrored in the overseas sets below; those are pitched
      // against their own local markets, not converted from shekels.
      sessionBW: 850,
      sessionTraining: 1200,
      extraHorseSession: 120,
      extraAnimal: 70,
      productShoot: 600,
    },
  },

  // United States and the rest of the world.
  // The per-entry bundle is under a third of the $225-per-division benchmark,
  // and that benchmark only includes 10 images — the same count we give.
  INTL: {
    currency: "USD",
    amounts: {
      entryPerson: 65,
      extendedEntry: 130,
      extraHorse: 30,
      videoPackage: 220,
      shortVideo: 90,
      obstacleVideo: 75,
      eventShoot: 300,      // vs $375–450 for a local studio session
      sessionHour: 190,
      sessionTwoHour: 350,
      sessionBW: 145,
      sessionTraining: 290,
      extraHorseSession: 30,
      extraAnimal: 20,
      productShoot: 130,
    },
  },

  // Continental Europe. €60 for ten edited photos works out under €6 each
  // against a €38 German press rate per image — she is a visiting
  // photographer, not an established local name, and the price says so.
  EU: {
    currency: "EUR",
    amounts: {
      entryPerson: 60,
      extendedEntry: 120,
      extraHorse: 28,
      videoPackage: 200,
      shortVideo: 85,
      obstacleVideo: 70,
      eventShoot: 280,      // vs the €200–250 average for local shoots, which
      sessionHour: 175,     // carry no travel
      sessionTwoHour: 320,
      sessionBW: 130,
      sessionTraining: 265,
      extraHorseSession: 28,
      extraAnimal: 18,
      productShoot: 120,
    },
  },

  // United Kingdom. eventShoot lands well under the £275/two-hour going rate.
  UK: {
    currency: "GBP",
    amounts: {
      entryPerson: 55,
      extendedEntry: 110,
      extraHorse: 25,
      videoPackage: 180,
      shortVideo: 75,
      obstacleVideo: 65,
      eventShoot: 200,
      sessionHour: 150,
      sessionTwoHour: 270,
      sessionBW: 115,
      sessionTraining: 225,
      extraHorseSession: 25,
      extraAnimal: 15,
      productShoot: 105,
    },
  },
};

/* ── Package contents and add-ons ───────────────────────────────────────── */

/**
 * Minimum edited photos in the standard package — the round, the warm-up
 * arena, and the podium if the rider gets there.
 *
 * This replaced the old "6₪ per selected photo" option, which was dropped
 * because it wasn't worth the editing time. It is a MINIMUM, not a cap, and it
 * is also what Alina commits to per rider: raising it raises her workload at
 * an unchanged price.
 */
export const PHOTOS_STANDARD = 8;

/**
 * The extended package: everything around the round as well — the course walk,
 * close-ups, the podium and the vet check when there is one. "and up" is
 * deliberate: it is a floor, not a quota, because how many keepers a round
 * yields isn't something either side can promise in advance.
 */
export const PHOTOS_EXTENDED = 15;

/** Finished portraits in the black-and-white sitting. */
export const PHOTOS_BW = 5;

/**
 * "Priority" add-on: edited and delivered within 48 hours instead of the
 * standard 10 business days, charged as a share of the package price.
 *
 * 0.5 = +50%. It is deliberately not a flat fee — the surcharge should scale
 * with how much work is being pulled forward.
 */
export const PRIORITY_RATE = 0.5;

/**
 * How many riders can take Priority at any one competition.
 *
 * The cap does two jobs: it stops a weekend turning into an all-night edit,
 * and scarcity makes the add-on worth having. /admin/registrations counts the
 * priority requests per competition so Alina can see when it is full.
 */
export const PRIORITY_SLOTS = 5;

/**
 * Share of the price taken up front to hold the booking. The rest is due on
 * delivery. Referenced by the pricing cards, the sign-up form and the terms,
 * so there is exactly one number to change.
 */
export const DEPOSIT_RATE = 0.4;

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
