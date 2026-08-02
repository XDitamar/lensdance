// src/components/MaintenanceGate.jsx
//
// ─────────────────────────────────────────────────────────────────────────────
// MAINTENANCE MODE — how to turn it on and off
// ─────────────────────────────────────────────────────────────────────────────
//
// TO TURN IT ON:   set  REACT_APP_MAINTENANCE = 1   in the Vercel project's
//                  environment variables, then redeploy.
// TO TURN IT OFF:  set it to 0 (or delete it) and redeploy.
//
// It is deliberately an env var and not a code change, so the site can be put
// behind the screen — and taken back out — without touching a single file.
//
// THREE THINGS ALWAYS GET THROUGH, by design:
//
//   1. localhost. Development never sees this screen, so work can continue on
//      `npm start` while visitors see the maintenance image in production.
//      (`npm run build` locally counts as production, hence the host check
//      rather than a NODE_ENV check.)
//   2. The admin, once signed in. Alina can review the live site normally.
//   3. Anyone with ?preview=1 in the URL — a link that can be shared with
//      someone who needs to see the work in progress. It is remembered for the
//      rest of the session so navigation doesn't lose it.
//
// The API routes under /api are untouched: this is a client-side screen only,
// not a lock. Don't rely on it to protect anything — Firestore rules do that.

import React, { useEffect, useState } from "react";
import useIsAdmin from "../hooks/useIsAdmin";
import MaintenancePage from "../pages/MaintenancePage";

const PREVIEW_KEY = "ld_preview";

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
    /^10\./.test(h)
  );
}

function hasPreviewPass() {
  try {
    if (new URLSearchParams(window.location.search).get("preview") === "1") {
      sessionStorage.setItem(PREVIEW_KEY, "1");
      return true;
    }
    return sessionStorage.getItem(PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
}

export default function MaintenanceGate({ children }) {
  const isAdmin = useIsAdmin();
  // Read once on mount: the URL doesn't change under us, and this keeps the
  // first paint stable instead of flickering between the two screens.
  const [preview] = useState(hasPreviewPass);

  const blocked = MAINTENANCE_ENABLED && !isLocalhost() && !isAdmin && !preview;

  // Lock the page behind the image — no scrolling to the site underneath.
  useEffect(() => {
    if (!blocked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [blocked]);

  if (blocked) return <MaintenancePage />;
  return children;
}
