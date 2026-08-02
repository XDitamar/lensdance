// Shared constants across the application
//
// No user-facing text lives here any more — only the stable ids that are
// written to Firestore. The words come from src/locales/*.json so they follow
// the visitor's language. The ids themselves are a data contract with existing
// documents: renaming one orphans every record that already uses it.

/** Riding disciplines. `users/{uid}.discipline` stores the id. */
export const DISCIPLINES = [
  { id: "jumping" },
  { id: "dressage" },
  { id: "crosscountry" },
  { id: "endurance" },
  { id: "driving" },
  { id: "other" },
];

/** i18n key for a discipline id — falls back to the "no category" label. */
export const disciplineKey = (id) =>
  DISCIPLINES.some((d) => d.id === id) ? `disciplines.${id}` : "disciplines.none";

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
