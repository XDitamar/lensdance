// src/lib/competitions.js
//
// ─────────────────────────────────────────────────────────────────────────────
// COMPETITIONS — the events riders can sign up to be photographed at
// ─────────────────────────────────────────────────────────────────────────────
//
// Until now there was no such thing as a competition record. `settings/competition`
// held one title as free text, and the admin list rebuilt a "competition" by
// grouping sign-ups on whatever string had been typed at the time. That worked
// while there was exactly one upcoming event and no history worth keeping.
//
// A competition is now a document of its own:
//
//   competitions/{id}  { name, farm, country, startDate, endDate, createdAt }
//
// Public read, admin write — riders have to see what they can sign up to, and
// only Alina creates them.
//
// COUNTRY. Each competition names the country it is held in, and /register only
// offers a visitor the ones in their own country (with ALL as a catch-all).
// Detection uses the same ipapi lookup as the pricing, so somebody browsing
// from Berlin is offered the German dates rather than a show outside Tel Aviv
// they cannot reach. Detection is a guess, though — see visibleCompetitions()
// for what happens when it fails, which is deliberately generous.
//
// DELETING. Removing a competition removes the event, NOT the sign-ups people
// submitted for it. Registrations are immutable by security rule (see
// firestore.rules) and stay readable in the admin archive, grouped by the title
// they were submitted under. That is on purpose: a sign-up is a record of what
// somebody asked for and what they may have paid a deposit against.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

export const COMPETITIONS = "competitions";

/** Means "offer this to everybody, wherever they are browsing from". */
export const ANY_COUNTRY = "ALL";

/**
 * Countries offered when creating a competition. Israel first because it is
 * home; the rest are where the travel actually goes. Codes are ISO 3166-1
 * alpha-2, matching what the ipapi lookup returns, so they can be compared
 * directly against a visitor's detected country.
 */
export const COMPETITION_COUNTRIES = [
  { code: ANY_COUNTRY, name: "All countries" },
  { code: "IL", name: "Israel" },
  { code: "GB", name: "United Kingdom" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "PT", name: "Portugal" },
  { code: "IT", name: "Italy" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Switzerland" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "PL", name: "Poland" },
  { code: "CZ", name: "Czechia" },
  { code: "HU", name: "Hungary" },
  { code: "GR", name: "Greece" },
  { code: "CY", name: "Cyprus" },
  { code: "US", name: "United States" },
];

export const countryName = (code) =>
  COMPETITION_COUNTRIES.find((c) => c.code === code)?.name || code || "—";

/* ── Reading ────────────────────────────────────────────────────────────── */

/** Every competition, soonest first. */
export async function fetchCompetitions() {
  const snap = await getDocs(query(collection(db, COMPETITIONS), orderBy("startDate", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Dates are stored as plain "YYYY-MM-DD" strings, so they compare as strings. */
const today = () => new Date().toISOString().slice(0, 10);

/** Has the last day of this competition already passed? */
export const hasEnded = (comp) => {
  const end = comp?.endDate || comp?.startDate;
  return !!end && end < today();
};

/**
 * The competitions a visitor should be offered.
 *
 * Filters out anything that has already finished — you cannot sign up to be
 * photographed at a show that happened last month — and then narrows to the
 * visitor's own country.
 *
 * When the country is unknown (the lookup failed, an ad blocker ate it, a
 * first paint before it resolved) nothing is filtered out. Showing a rider a
 * date in the wrong country is a small annoyance; hiding the one event they
 * were trying to sign up to is a lost booking, so the failure mode leans
 * towards showing too much.
 */
export function visibleCompetitions(all, country) {
  const upcoming = (all || []).filter((c) => !hasEnded(c));
  if (!country) return upcoming;
  return upcoming.filter(
    (c) => !c.country || c.country === ANY_COUNTRY || c.country === country
  );
}

/** "12–14 Aug 2026", or a single date when the range is one day. */
export function formatRange(comp, locale = "en-GB") {
  const fmt = (s, opts) => {
    if (!s) return "";
    const d = new Date(s + "T00:00:00");
    return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString(locale, opts);
  };
  const { startDate, endDate } = comp || {};
  if (!startDate) return "";
  if (!endDate || endDate === startDate) {
    return fmt(startDate, { day: "numeric", month: "short", year: "numeric" });
  }
  const sameMonth = startDate.slice(0, 7) === endDate.slice(0, 7);
  return `${fmt(startDate, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" })}–${fmt(
    endDate,
    { day: "numeric", month: "short", year: "numeric" }
  )}`;
}

/** The label a sign-up is filed under. Kept in one place so the admin list and
 *  the rider's form always agree on the string. */
export const competitionLabel = (comp) =>
  [comp?.name, comp?.farm].filter(Boolean).join(" · ");

/* ── Writing (admin only — enforced in firestore.rules) ─────────────────── */

export async function createCompetition({ name, farm, country, startDate, endDate }) {
  return addDoc(collection(db, COMPETITIONS), {
    name: String(name || "").trim(),
    farm: String(farm || "").trim(),
    country: country || ANY_COUNTRY,
    startDate,
    // A one-day show is stored with both ends the same, so every read can
    // assume a range exists rather than special-casing a missing end.
    endDate: endDate || startDate,
    createdAt: serverTimestamp(),
  });
}

export async function deleteCompetition(id) {
  return deleteDoc(doc(db, COMPETITIONS, id));
}
