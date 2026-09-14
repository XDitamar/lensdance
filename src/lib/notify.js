// src/lib/notify.js
//
// Tells Alina's phone that a sign-up just landed.
//
// Everything here is best-effort and silent. A notification is a convenience
// for the photographer; the registration itself is already safely in Firestore
// by the time this runs, so nothing in this file may surface an error to the
// rider or block the confirmation screen. Every failure path ends in a
// console.warn and nothing else.
//
// The server side, including the one-time Telegram setup, is documented in
// api/notify-registration.js.

import { auth } from "../firebase";

/**
 * @param {{ rider?: string, competition?: string }} details
 *        Only these two fields are read — the message is deliberately short.
 */
export async function notifyNewRegistration(details) {
  try {
    const user = auth.currentUser;
    // The endpoint only accepts a signed-in caller. Registrations require an
    // account anyway, so this should never be hit — but it costs nothing to
    // avoid a guaranteed 401.
    if (!user) return;

    const idToken = await user.getIdToken();

    await fetch("/api/notify-registration", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        rider: details?.rider || "",
        competition: details?.competition || "",
      }),
      // The rider is about to see the confirmation screen; this must not hold
      // the page open if Telegram or the function is slow.
      keepalive: true,
    });
  } catch (err) {
    // Includes `npm start` on localhost, where /api does not exist at all.
    console.warn("Registration notification not sent:", err?.message || err);
  }
}
