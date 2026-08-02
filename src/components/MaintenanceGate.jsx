// src/components/MaintenanceGate.jsx
//
// ─────────────────────────────────────────────────────────────────────────────
// MAINTENANCE MODE — how to turn it on and off
// ─────────────────────────────────────────────────────────────────────────────
//
// TO TURN IT ON:   REACT_APP_MAINTENANCE=1  in .env (already committed), or in
//                  the Vercel project's environment variables. Then deploy.
// TO TURN IT OFF:  set it to 0 and deploy.
//
// While it is on, the deployed site is CLOSED. Every route renders the
// maintenance screen instead — the home page, /gallery, /me, /admin, a shared
// deep link, a bookmark, all of them. There is no password, no preview link and
// no admin bypass: signing in as the admin on lens-dance.com shows the same
// screen as everyone else. That is deliberate, so nothing can be reached by
// accident while the site is unfinished.
//
// THE ONE EXCEPTION IS LOCAL DEVELOPMENT.
// localhost / 127.0.0.1 / a LAN address never sees this screen, so `npm start`
// keeps working normally and phone testing over Wi-Fi still works. The check is
// on the hostname rather than NODE_ENV on purpose: `npm run build` served
// locally is a production build, and it should still be usable while testing.
//
// SCOPE — this is a screen, not a lock. The serverless routes under /api stay
// reachable, and Firestore is still governed by firestore.rules. Don't treat
// this as a security boundary; it exists to keep visitors from using a site
// that isn't ready.

import React, { useEffect } from "react";
import MaintenancePage from "../pages/MaintenancePage";

/** True only when the env var is explicitly on. Anything else = off. */
const MAINTENANCE_ENABLED = ["1", "true", "on", "yes"].includes(
  String(process.env.REACT_APP_MAINTENANCE || "").toLowerCase()
);

/** Local development, where the screen must never appear. */
function isLocalhost() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "[::1]" ||
    h === "0.0.0.0" ||
    h.endsWith(".local") ||
    /^192\.168\./.test(h) || // phone testing over the local network
    /^10\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

export default function MaintenanceGate({ children }) {
  const blocked = MAINTENANCE_ENABLED && !isLocalhost();

  // Nothing behind the screen should be reachable — not even by scrolling.
  useEffect(() => {
    if (!blocked) return;
    const previousBody = document.body.style.overflow;
    const previousHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBody;
      document.documentElement.style.overflow = previousHtml;
    };
  }, [blocked]);

  if (blocked) return <MaintenancePage />;
  return children;
}
