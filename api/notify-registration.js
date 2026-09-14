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
//
// The token is checked against Google's identity toolkit with the project's
// WEB api key — the same key that already ships inside the browser bundle
// (src/firebase.js), so it is not a secret and nothing new is exposed.
//
// Deliberately NOT firebase-admin. The service-account variables on Vercel
// have been unreliable (api/media.js dies on them), and an alert that stops
// working because an unrelated credential expired is worse than useless: it
// fails silently, and silence is exactly what it is supposed to prevent. This
// route needs one question answered — "is this a real signed-in user?" — and
// that question has a public endpoint.

/** Where the "open the list" link points when SITE_URL is not set. */
const DEFAULT_SITE = "https://www.lens-dance.com";

/** Public web api key (already in the client bundle); overridable per env. */
const WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY || "AIzaSyCTL0IcIZ4cXhevCucMDJdTn5SKUArbdw8";

/**
 * True when `idToken` is a live Firebase session for this project.
 * Throws only if the check itself could not be carried out, so a network
 * problem on Google's side is never mistaken for a forged token.
 */
async function isRealUser(idToken) {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );
  if (r.status === 400 || r.status === 401 || r.status === 403) return false;
  if (!r.ok) throw new Error(`identitytoolkit HTTP ${r.status}`);
  const data = await r.json();
  return Array.isArray(data.users) && data.users.length > 0;
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

/**
 * Escapes the three characters Telegram's HTML mode treats as markup.
 * Applied to every piece of rider-typed text: without it a name containing
 * "<b>" would style her notification, and an unbalanced "<" would make
 * Telegram reject the whole message — an alert lost to a typo.
 */
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
    res.status(401).json({ ok: false, error: "missing-token" });
    return;
  }

  /* Three outcomes, told apart on purpose. Collapsing them into one 401 is
     what made the first version of this impossible to debug: a server that
     could not verify anything looked exactly like a rider with a stale
     token. */
  try {
    if (!(await isRealUser(idToken))) {
      res.status(401).json({ ok: false, error: "invalid-token" });
      return;
    }
  } catch (err) {
    console.error("Token check could not be performed:", err);
    res.status(500).json({ ok: false, error: "verification-unavailable", detail: err.message });
    return;
  }

  const body = req.body || {};
  const rider = clean(body.rider) || "רוכב/ת ללא שם";
  const competition = clean(body.competition) || "תחרות ללא שם";
  const horse = clean(body.horse);
  const classEntry = clean(body.classEntry);
  const day = clean(body.day);
  const contact = clean(body.contact, 40);
  // Labels, not ids: the browser already knows what the rider was shown, and
  // duplicating the pricing catalogue here would be one more thing to keep in
  // step with src/config/pricing.js.
  const packages = Array.isArray(body.packages)
    ? body.packages.map((p) => clean(p, 40)).filter(Boolean).slice(0, 8)
    : [];
  const site = (process.env.SITE_URL || DEFAULT_SITE).replace(/\/+$/, "");

  /* TWO LAYERS, ONE MESSAGE.
     Who and which competition are always visible — that is what Alina needs
     to recognise at a glance on a lock screen. Everything else goes inside an
     expandable blockquote, which Telegram itself collapses behind a "show
     more" and opens in place when tapped. No second message, no extra tap to
     another app, and the notification preview stays one short line.
     On a Telegram client too old for expandable quotes this degrades to an
     ordinary quote — everything is still there, just already open. */
  const detail = [
    horse && `🐎 ${esc(horse)}`,
    classEntry && `🏁 ${esc(classEntry)}`,
    day && `📅 ${esc(day)}`,
    packages.length > 0 && `📦 ${esc(packages.join(" · "))}`,
    contact && `📱 ${esc(contact)}`,
  ].filter(Boolean);

  const text = [
    "🐴 <b>הרשמה חדשה</b>",
    `${esc(rider)} — ${esc(competition)}`,
    detail.length > 0 ? `<blockquote expandable>${detail.join("\n")}</blockquote>` : "",
    `<a href="${site}/admin/registrations">פתיחת רשימת ההרשמות</a>`,
  ].filter(Boolean).join("\n");

  /* Each recipient is attempted on its own, and one failing does not stop the
     others: a chat id that has gone stale (the bot was blocked, someone left
     the group) must not be able to swallow the alert for everybody else. */
  const results = await Promise.all(
    chatIds.map(async (chat_id) => {
      try {
        const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
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
