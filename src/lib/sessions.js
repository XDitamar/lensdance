// src/lib/sessions.js
//
// The four personal sessions, and the one place that says how they map to
// URLs, to pricing cards and to what a booking form has to ask for.
//
// WHY THIS FILE EXISTS.
// The same four sessions are referenced from four directions — the pricing
// cards, the booking routes in App.js, the booking form, and the admin list.
// Without a single catalogue, adding a fifth session means finding all four
// places and hoping none was missed. Add a row here instead.
//
// THE IDS ARE A DATA CONTRACT. `sessionBookings/{id}.sessionId` stores them,
// and they are also the pricing-card keys in src/hooks/useGeoPrice.js. Renaming
// one orphans every booking already saved under the old name and blanks the
// price on the card. The slugs are public URLs, so changing those breaks links
// people have already been sent.

/** Firestore collection holding personal-session bookings. */
export const SESSION_BOOKINGS = "sessionBookings";

/**
 * One row per session.
 *
 *   id      pricing card key + the value stored on the booking
 *   slug    the public URL: /book/<slug>
 *   extras  which optional add-ons this session actually offers, so the form
 *           only asks what applies. Only the one-hour session prices a second
 *           animal; the black-and-white sitting is the photographer and one
 *           horse, so it asks for neither.
 */
export const SESSIONS = [
  { id: "sessionHour",     slug: "hour",              extras: { horses: true,  animal: true  } },
  { id: "sessionTwoHour",  slug: "two-hours",         extras: { horses: true,  animal: false } },
  { id: "sessionBW",       slug: "black-and-white",   extras: { horses: false, animal: false } },
  { id: "sessionTraining", slug: "training",          extras: { horses: false, animal: false } },
];

/** URL slug → the session row, or undefined for an unknown slug. */
export const sessionBySlug = (slug) => SESSIONS.find((x) => x.slug === slug);

/** Session id → the session row. */
export const sessionById = (id) => SESSIONS.find((x) => x.id === id);

/** Session id → the booking page for it. */
export const bookingPath = (id) => {
  const s = sessionById(id);
  return s ? `/book/${s.slug}` : "/pricing";
};
