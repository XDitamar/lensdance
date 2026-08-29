// src/lib/safeStorage.js
//
// localStorage and sessionStorage are not always there, and touching them is
// not always safe.
//
// Safari in Private Browsing, Safari with cross-site tracking prevention on a
// site it does not trust, Firefox with "block all cookies", an embedded
// webview, an enterprise policy — in all of these, `localStorage.getItem` can
// throw a SecurityError or a QuotaExceededError rather than returning null.
// A throw inside a React component during render takes the whole tree down and
// the visitor gets a blank white page with no explanation, on a site that
// works perfectly on the next machine along.
//
// These helpers never throw. A blocked store simply behaves like an empty one:
// reads come back null, writes are dropped. Every one of these values is a
// convenience — a saved theme, a cached country, a remembered language — so
// losing them costs the visitor nothing next to losing the page.

const store = (kind) => {
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
};

export function readStored(key, { session = false } = {}) {
  try {
    return store(session ? "session" : "local")?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Returns true when the value was actually stored. */
export function writeStored(key, value, { session = false } = {}) {
  try {
    store(session ? "session" : "local")?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStored(key, { session = false } = {}) {
  try {
    store(session ? "session" : "local")?.removeItem(key);
  } catch {}
}

/** JSON convenience for the settings blobs, with a fallback when unreadable. */
export function readStoredJson(key, fallback = null, opts) {
  const raw = readStored(key, opts);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    // Corrupt value — a half-written blob, or something from an older version
    // of the app. Treat it as absent rather than crashing on every load.
    return fallback;
  }
}

export function writeStoredJson(key, value, opts) {
  try {
    return writeStored(key, JSON.stringify(value), opts);
  } catch {
    return false;
  }
}
