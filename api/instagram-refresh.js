// api/instagram-refresh.js
//
// Keeps the Instagram long-lived access token alive. Instagram tokens expire
// after 60 days but can be exchanged for a new 60-day token at any point after
// they are 24 hours old — so a cron that runs every day means the token never
// expires and nobody ever has to touch it again.
//
// Triggered by the Vercel cron defined in vercel.json. Can also be run by hand:
//   GET /api/instagram-refresh?force=1   (with the admin header or CRON_SECRET)

import { readStoredToken, getActiveToken, refreshToken } from "./_lib/instagramToken.js";

// Refresh once the token is inside this window of its expiry (30 days), or if
// we simply haven't refreshed in a week. Both keep us far from the 60-day wall.
const REFRESH_WHEN_EXPIRY_WITHIN_MS = 30 * 24 * 3600 * 1000;
const REFRESH_WHEN_OLDER_THAN_MS = 7 * 24 * 3600 * 1000;
// Instagram rejects a refresh on a token younger than 24 hours.
const MIN_TOKEN_AGE_MS = 25 * 3600 * 1000;

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers?.authorization || "";
  if (secret && auth === `Bearer ${secret}`) return true;
  // Vercel cron invocations carry this header.
  if (req.headers?.["x-vercel-cron"]) return true;
  const adminEmail = process.env.ADMIN_EMAIL || "lensdance29@gmail.com";
  if (req.headers?.["x-admin-email"] === adminEmail) return true;
  // If no CRON_SECRET is configured we don't block — the endpoint only ever
  // rotates a token, it never discloses one.
  return !secret;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!authorized(req)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  try {
    const token = await getActiveToken();
    if (!token) {
      return res.status(400).json({
        ok: false,
        error: "No Instagram token configured. Set INSTAGRAM_ACCESS_TOKEN once.",
      });
    }

    const stored = await readStoredToken();
    const now = Date.now();
    const age = stored?.refreshedAt ? now - stored.refreshedAt : Infinity;
    const timeLeft = stored?.expiresAt ? stored.expiresAt - now : 0;
    const force = req.query?.force === "1";

    const tooYoung = age < MIN_TOKEN_AGE_MS;
    const due =
      timeLeft < REFRESH_WHEN_EXPIRY_WITHIN_MS || age > REFRESH_WHEN_OLDER_THAN_MS;

    if (!force && (tooYoung || !due)) {
      return res.status(200).json({
        ok: true,
        refreshed: false,
        reason: tooYoung ? "token younger than 24h" : "not due yet",
        expiresAt: stored?.expiresAt || null,
        daysLeft: stored?.expiresAt ? Math.round(timeLeft / 86400000) : null,
      });
    }

    const next = await refreshToken(token);
    console.log("Instagram token refreshed, expires", new Date(next.expiresAt).toISOString());
    return res.status(200).json({
      ok: true,
      refreshed: true,
      expiresAt: next.expiresAt,
      daysLeft: Math.round((next.expiresAt - now) / 86400000),
    });
  } catch (e) {
    console.error("instagram-refresh failed:", e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
