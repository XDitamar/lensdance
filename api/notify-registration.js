// api/notify-registration.js
//
// ─────────────────────────────────────────────────────────────────────────────
// TELLS ALINA, ON HER PHONE, THAT SOMEBODY JUST SIGNED UP
// ─────────────────────────────────────────────────────────────────────────────
//
// A rider fills in /register, the sign-up lands in Firestore — and until she
// happens to open /admin/registrations, nobody has told her. This closes that
// gap: one short Telegram message the moment a registration is written.
//
// Telegram rather than SMS or WhatsApp because it is free, unlimited, arrives
// as a normal push notification, and needs no business verification. The whole
// setup is a bot token and a chat id in the Vercel environment.
//
// ── SETUP (once) ───────────────────────────────────────────────────────────
// 1. In Telegram, message @BotFather → /newbot → follow the prompts. It gives
//    a token that looks like 123456789:AAF...  →  TELEGRAM_BOT_TOKEN
// 2. Alina opens a chat with the new bot and sends it any message (a bot may
//    not message a person who has never written to it — Telegram's rule, not
//    ours).
// 3. Open https://api.telegram.org/bot<TOKEN>/getUpdates and copy the numeric
//    "chat":{"id": …} from her message  →  TELEGRAM_CHAT_ID
// 4. Put both in Vercel → Settings → Environment Variables, and redeploy.
//
// Neither variable set? The function answers 200 with skipped:"not-configured"
// and sends nothing. That is deliberate: a missing notification must never be
// able to look like a failed registration.
//
// ── WHY THE CALLER IS VERIFIED ─────────────────────────────────────────────
// This endpoint is public, so without a check anyone could POST to it and push
// arbitrary text to Alina's phone. The browser sends the signed-in user's
// Firebase ID token and it is verified here before anything is sent. The
// message body is still treated as untrusted: only known fields are read, each
// is stripped of line breaks and truncated, so a rider cannot type a name that
// forges extra lines in her notification.

const admin = require("firebase-admin");

/** Where the "open the list" link points when SITE_URL is not set. */
const DEFAULT_SITE = "https://www.lens-dance.com";

function initAdmin() {
  if (admin.apps.length) return admin.app();

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const credential = raw
    ? admin.credential.cert(JSON.parse(raw))
    : admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      });

  return admin.initializeApp({ credential });
}

/**
 * One line of somebody else's text, made safe to drop into a message.
 * Newlines out (they would forge extra lines), length capped, empty → null.
 */
function clean(value, max = 80) {
  if (typeof value !== "string") return null;
  const flat = value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!flat) return null;
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  /* One chat id, or several separated by commas. Several is the normal case
     while this is being set up: Alina needs the alert, and whoever is watching
     the site wants to see that it fired without asking her every time. A group
     chat id works here too — it is just a negative number. */
  const chatIds = (process.env.TELEGRAM_CHAT_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Not configured is not an error — see the header.
  if (!token || chatIds.length === 0) {
    res.status(200).json({ ok: true, sent: false, skipped: "not-configured" });
    return;
  }

  const idToken = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!idToken) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  try {
    initAdmin();
    await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  const body = req.body || {};
  const rider = clean(body.rider) || "רוכב/ת ללא שם";
  const competition = clean(body.competition) || "תחרות ללא שם";
  const site = (process.env.SITE_URL || DEFAULT_SITE).replace(/\/+$/, "");

  // Short on purpose: the details are one tap away, and a notification that
  // has to be scrolled is a notification she stops reading.
  const text =
    `🐴 הרשמה חדשה\n${rider} — ${competition}\n\n${site}/admin/registrations`;

  /* Each recipient is attempted on its own, and one failing does not stop the
     others: a chat id that has gone stale (the bot was blocked, someone left
     the group) must not be able to swallow the alert for everybody else. */
  const results = await Promise.all(
    chatIds.map(async (chat_id) => {
      try {
        const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id, text, disable_web_page_preview: true }),
        });
        const data = await tg.json().catch(() => ({}));
        if (!tg.ok || data.ok === false) {
          console.error("Telegram sendMessage failed:", chat_id, tg.status, data);
          return { chat_id, sent: false, error: data.description || `HTTP ${tg.status}` };
        }
        return { chat_id, sent: true };
      } catch (err) {
        console.error("Telegram sendMessage threw:", chat_id, err);
        return { chat_id, sent: false, error: err.message };
      }
    })
  );

  /* Always 200, even when nothing went out. The browser calls this after the
     registration is already saved and ignores the answer; a 500 sitting in the
     network tab would read as though the sign-up itself had broken. */
  res.status(200).json({
    ok: results.some((r) => r.sent),
    sent: results.filter((r) => r.sent).length,
    results,
  });
};
