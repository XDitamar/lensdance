// api/_lib/instagramToken.js
//
// Stores the Instagram long-lived access token in Firestore so it can be
// refreshed automatically (env vars are immutable at runtime on Vercel).
//
// Document: secrets/instagram  — NOT covered by any rule in firestore.rules,
// so the default `allow read, write: if false` blocks every client. Only the
// Admin SDK (which bypasses rules) can touch it.
//
// Files/folders under api/ starting with "_" are not deployed as functions.

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const COLLECTION = "secrets";
const DOC_ID = "instagram";

function db() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirestore();
}

const ref = () => db().collection(COLLECTION).doc(DOC_ID);

/**
 * Reads the stored token. Returns null if Firestore is unavailable or empty.
 * @returns {Promise<{accessToken: string, expiresAt: number, refreshedAt: number}|null>}
 */
export async function readStoredToken() {
  try {
    const snap = await ref().get();
    if (!snap.exists) return null;
    const d = snap.data();
    return d?.accessToken ? d : null;
  } catch (e) {
    console.warn("instagramToken: read failed:", e.message);
    return null;
  }
}

/** Persists a token plus its expiry (expiresIn is in seconds). */
export async function writeStoredToken(accessToken, expiresIn) {
  const now = Date.now();
  const payload = {
    accessToken,
    expiresAt: now + (Number(expiresIn) || 60 * 24 * 3600) * 1000,
    refreshedAt: now,
  };
  await ref().set(payload, { merge: true });
  return payload;
}

/**
 * The token to use right now: Firestore first (it's the one being refreshed),
 * falling back to INSTAGRAM_ACCESS_TOKEN from the environment. The env value is
 * seeded into Firestore on first use so the refresh job has something to work
 * with.
 */
export async function getActiveToken() {
  const stored = await readStoredToken();
  if (stored?.accessToken) return stored.accessToken;

  const seed = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!seed) return null;
  // 60 days is the Instagram long-lived default; the refresh job corrects it.
  try {
    await writeStoredToken(seed, 60 * 24 * 3600);
  } catch (e) {
    console.warn("instagramToken: seed failed:", e.message);
  }
  return seed;
}

/**
 * Exchanges the current long-lived token for a fresh 60-day one.
 * Instagram requires the token to be at least 24 hours old.
 */
export async function refreshToken(currentToken) {
  const url =
    "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token" +
    `&access_token=${encodeURIComponent(currentToken)}`;
  const r = await fetch(url);
  const json = await r.json().catch(() => ({}));
  if (!r.ok || !json.access_token) {
    throw new Error(json?.error?.message || `refresh failed (HTTP ${r.status})`);
  }
  return writeStoredToken(json.access_token, json.expires_in);
}
