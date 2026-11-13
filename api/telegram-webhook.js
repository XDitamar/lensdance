// api/telegram-webhook.js
//
// ─────────────────────────────────────────────────────────────────────────────
// ALINA TALKS TO THE BOT: /sum
// ─────────────────────────────────────────────────────────────────────────────
//
//   /sum        a file per competition that has not finished yet
//   /sum all    a file per competition that has any sign-ups, past ones too
//
// Each file is an .xlsx for ONE competition, with a sheet per day: every rider
// that day with all their details, in riding order (entry number, then class).
// Built by _lib/roster.js, the same file api/send-roster.js sends the day
// before. The files go back to whoever asked, not to every chat.
//
// ── HOW TELEGRAM REACHES THIS ──────────────────────────────────────────────
// Telegram POSTs every message sent to the bot to a "webhook" URL. One-time
// setup, from your own computer (the bot token never leaves Vercel):
//
//   1. Vercel → Settings → Environment Variables: add TELEGRAM_WEBHOOK_SECRET,
//      a random string of 20+ letters, digits, "_" or "-" (Telegram's rule).
//      Redeploy.
//   2. Register the webhook and the "/" menu by calling this file's own setup:
//        curl -H "Authorization: Bearer <CRON_SECRET>" \
//          "https://www.lens-dance.com/api/telegram-webhook?setup=1"
//      It answers with Telegram's replies (no secrets in them).
//   3. Alina sends /sum to the bot.
//
// Registering a webhook switches off getUpdates for the bot (Telegram allows
// only one of the two). That is fine; the chat id was needed once.
//
// ── WHO MAY ASK ────────────────────────────────────────────────────────────
// Two locks, both required:
//   * Telegram sends the secret above in a header on every real update; a
//     request without it is refused, so nobody can fake a message by POSTing
//     here. With no secret configured the endpoint refuses everything.
//   * The chat must be one of TELEGRAM_CHAT_ID (the chats that already get the
//     sign-up alerts). The sign-ups hold names, phone numbers and emails, so a
//     stranger who finds the bot gets nothing: strangers are ignored silently.
//
// ── READING THE SIGN-UPS ───────────────────────────────────────────────────
// There is no signed-in user inside Telegram, so this reads through
// firebase-admin (see _lib/rosterData.js). If the credentials on Vercel do not
// work, Alina is told so, with a link to the page that does work, instead of
// silence.
//
// Always answers 200: Telegram re-sends an update it thinks failed, and a
// re-sent /sum would mean the same files twice.

const crypto = require("crypto");
const {
  site, hasEnded, listCompetitions, labelOf, registrationsAsServer,
  buildCompetitionFile, esc, telegramConfig, sendToChats,
} = require("./_lib/rosterData");

/** At most this many files per /sum, nearest competition first. */
const MAX_FILES = 8;

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Update ids already handled by this instance (a best-effort guard against re-sends). */
const seen = new Set();
const remember = (id) => {
  if (seen.has(id)) return false;
  seen.add(id);
  if (seen.size > 200) seen.delete(seen.values().next().value);
  return true;
};

/** "/sum@LensDanceBot all" → { command: "/sum", arg: "all" } */
function parseCommand(raw) {
  const m = String(raw || "").trim().match(/^\/([A-Za-z_]+)(?:@\w+)?(?:\s+(.*))?$/s);
  return m ? { command: `/${m[1].toLowerCase()}`, arg: (m[2] || "").trim().toLowerCase() } : { command: null, arg: "" };
}

const HELP = [
  "היי 👋 אפשר לבקש:",
  "<b>/sum</b> — קובץ לכל תחרות שעוד לא הסתיימה (טבלה לכל יום, לפי מספר עלייה ומקצה)",
  "<b>/sum all</b> — גם תחרויות שהסתיימו",
].join("\n");

async function handleSum(tg, chatId, arg) {
  const reply = (text) => sendToChats(tg, [chatId], { text });

  let comps;
  try {
    comps = await listCompetitions();
  } catch (err) {
    console.error("/sum could not list competitions:", err);
    await reply("לא הצלחתי לקרוא את רשימת התחרויות. נסי שוב בעוד רגע.");
    return;
  }

  const everything = arg === "all" || arg === "הכל";
  const wanted = everything ? comps : comps.filter((c) => !hasEnded(c));
  if (wanted.length === 0) {
    await reply(
      everything
        ? "אין תחרויות במערכת."
        : "אין כרגע תחרויות עתידיות. לכל התחרויות, כולל שהסתיימו: <b>/sum all</b>"
    );
    return;
  }

  // Nearest first for upcoming ones; newest first when looking back.
  const ordered = everything ? [...wanted].reverse() : wanted;
  const batch = ordered.slice(0, MAX_FILES);

  // Without this the chat sits silent for a few seconds, which looks like nothing happened.
  fetch(`https://api.telegram.org/bot${tg.token}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "upload_document" }),
  }).catch(() => {});

  const sentTitles = [];
  const empty = [];
  let failed = 0;
  for (const comp of batch) {
    const title = labelOf(comp);
    try {
      const regs = await registrationsAsServer(title);
      if (regs.length === 0) {
        empty.push(title);
        continue;
      }
      const built = await buildCompetitionFile(comp, regs);
      const [r] = await sendToChats(tg, [chatId], built);
      if (r?.sent) sentTitles.push(title);
      else failed += 1;
    } catch (err) {
      /* Almost always the Vercel credentials. Say so once, with the way round it. */
      console.error("/sum could not read sign-ups:", err);
      await reply(
        [
          "⚠️ <b>לא הצלחתי לקרוא את ההרשמות מהשרת.</b>",
          "בינתיים אפשר לקבל את הקובץ מכאן — בוחרים תחרות ולוחצים על \"שלח לי קובץ מקצים\":",
          `<a href="${site()}/admin/registrations">פתיחת רשימת ההרשמות</a>`,
        ].join("\n")
      );
      return;
    }
  }

  const lines = [];
  if (sentTitles.length > 0) lines.push(sentTitles.length === 1 ? "נשלח קובץ אחד." : `נשלחו ${sentTitles.length} קבצים.`);
  if (empty.length > 0) lines.push(`עדיין אין נרשמים: ${empty.map(esc).join(" · ")}`);
  if (failed > 0) lines.push(failed === 1 ? "קובץ אחד לא נשלח, נסי שוב." : `${failed} קבצים לא נשלחו, נסי שוב.`);
  if (ordered.length > MAX_FILES) lines.push(`יש עוד ${ordered.length - MAX_FILES} תחרויות; הצגתי את ${MAX_FILES} הראשונות.`);
  if (!everything) lines.push("לתחרויות שהסתיימו: <b>/sum all</b>");
  await reply(lines.join("\n"));
}

/** One-time registration of the webhook and the "/" command menu. */
async function setup(req, res, tg, secret) {
  const cron = process.env.CRON_SECRET;
  const presented = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!cron || !presented || !safeEqual(presented, cron)) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  if (!tg.token) {
    res.status(200).json({ ok: false, error: "TELEGRAM_BOT_TOKEN is not set" });
    return;
  }
  if (!secret || !/^[A-Za-z0-9_-]{16,256}$/.test(secret)) {
    res.status(200).json({ ok: false, error: "TELEGRAM_WEBHOOK_SECRET must be 16-256 characters: letters, digits, _ or -" });
    return;
  }
  const call = async (method, body) => {
    const r = await fetch(`https://api.telegram.org/bot${tg.token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json().catch(() => ({ ok: false }));
  };
  const webhook = await call("setWebhook", {
    url: `${site()}/api/telegram-webhook`,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
  const commands = await call("setMyCommands", {
    commands: [
      { command: "sum", description: "קובץ מתחרים לכל תחרות (טבלה לכל יום)" },
    ],
  });
  res.status(200).json({ ok: !!(webhook.ok && commands.ok), webhook, commands });
}

module.exports = async function handler(req, res) {
  const tg = telegramConfig();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";

  if (req.method === "GET" && req.query?.setup) {
    await setup(req, res, tg, secret);
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  // Lock 1: a real Telegram update carries the secret we registered.
  const header = req.headers["x-telegram-bot-api-secret-token"] || "";
  if (!secret || !tg.token || !safeEqual(header, secret)) {
    res.status(401).json({ ok: false });
    return;
  }

  const body = typeof req.body === "string" ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : req.body || {};
  const msg = body.message;
  if (!msg || typeof msg.text !== "string" || !msg.chat) {
    res.status(200).json({ ok: true, ignored: "not-a-text-message" });
    return;
  }

  // Lock 2: only the chats that already receive the alerts.
  const chatId = String(msg.chat.id);
  if (!tg.chatIds.includes(chatId)) {
    console.warn("Telegram message from an unlisted chat ignored:", chatId);
    res.status(200).json({ ok: true, ignored: "unlisted-chat" });
    return;
  }

  if (typeof body.update_id === "number" && !remember(body.update_id)) {
    res.status(200).json({ ok: true, ignored: "duplicate" });
    return;
  }

  const { command, arg } = parseCommand(msg.text);
  try {
    if (command === "/sum") await handleSum(tg, chatId, arg);
    else if (command === "/start" || command === "/help") await sendToChats(tg, [chatId], { text: HELP });
  } catch (err) {
    console.error("Telegram command failed:", err);
    await sendToChats(tg, [chatId], { text: "משהו השתבש. נסי שוב בעוד רגע." }).catch(() => {});
  }
  res.status(200).json({ ok: true });
};
