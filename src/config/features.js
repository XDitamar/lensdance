// src/config/features.js
//
// Things that are built but not switched on.
//
// A flag rather than commented-out blocks. Hiding a feature by commenting it
// out means editing four files in four ways, and switching it back on means
// finding all four again and hoping nothing was half-deleted in between —
// which is how a feature comes back subtly broken. One constant, one place,
// and every entry point reads it.

/**
 * The prize wheel: /prize, the settings row, the admin spin field, and the
 * spin credited when a deposit is marked paid.
 *
 * Off while the prizes themselves are still being decided. The page, the
 * server draw (api/spin.js) and the data helpers all stay in the codebase —
 * nothing here is deleted, only unreachable. Flip to true and it returns
 * exactly as it was.
 *
 * NOTE: the /prize route is commented out in src/App.js as well, so the URL
 * itself answers "not found" rather than rendering a page nobody is meant to
 * reach yet. That line has to be uncommented at the same time.
 */
export const PRIZE_WHEEL = false;
