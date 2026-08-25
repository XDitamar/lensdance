// Shared constants across the application
//
// No user-facing text lives here any more — only the stable ids that are
// written to Firestore. The words come from src/locales/*.json so they follow
// the visitor's language. The ids themselves are a data contract with existing
// documents: renaming one orphans every record that already uses it.

/**
 * Riding disciplines offered when someone signs up or changes their category.
 * `users/{uid}.discipline` stores the id.
 */
export const DISCIPLINES = [
  { id: "jumping" },
  { id: "dressage" },
  { id: "reining" },
  { id: "cutting" },
];

/**
 * Ids that are no longer offered but may still be stored on older accounts.
 *
 * They are deliberately not deleted outright: `disciplineKey` still resolves
 * them, so an existing rider whose profile says "endurance" keeps reading as
 * Endurance on the admin pages instead of silently collapsing to "no category".
 * The words stay in src/locales/*.json for the same reason. Nobody can pick
 * these any more — that is what removing them from DISCIPLINES does.
 */
export const RETIRED_DISCIPLINES = ["crosscountry", "endurance", "driving", "other"];

/** i18n key for a discipline id — falls back to the "no category" label. */
export const disciplineKey = (id) =>
  DISCIPLINES.some((d) => d.id === id) || RETIRED_DISCIPLINES.includes(id)
    ? `disciplines.${id}`
    : "disciplines.none";

export const ADMIN_EMAIL = "lensdance29@gmail.com";

/**
 * Competition package ids, in display order. The labels (with prices) come
 * from useGeoPrice → "pricing.packages" so they stay in step with
 * src/config/pricing.js instead of being duplicated here.
 */
export const PACKAGE_IDS = ["photos", "video", "short"];

/** Publish-permission answers on a registration. */
export const PUBLISH_KEYS = {
  yes: "registrations.publish.yes",
  no: "registrations.publish.no",
  underage: "registrations.publish.underage",
};
