// api/send-roster.js
//
// ─────────────────────────────────────────────────────────────────────────────
// SENDS ALINA THE FILE FOR A COMPETITION ON TELEGRAM
// ─────────────────────────────────────────────────────────────────────────────
//
// Two ways in, one result (an .xlsx, one sheet per day, built by
// _lib/roster.js; the data and Telegram plumbing live in _lib/rosterData.js):
//
//  1. THE DAY BEFORE, AUTOMATICALLY. Vercel Cron calls this every morning (see
//     `crons` in vercel.json) with `Authorization: Bearer <CRON_SECRET>`. It
//     looks for a competition whose first day is TOMORROW (Israel time) and, if
//     there is one, builds and sends that file. Most mornings there is none
//     and it does nothing, silently.
//
//  2. ON DEMAND, FROM THE ADMIN PAGE. A button on /admin/registrations POSTs
//     { competition: "<title>" } with the admin's own Firebase ID token. The
//     same file arrives on her phone. This is also the safety net for (1).
//
// (Alina can also ask for the files herself in Telegram: see
// api/telegram-webhook.js, the /sum command.)
//
// Reading the sign-ups: see the header of _lib/rosterData.js for why the
// button works without server credentials and the cron needs them. When the
// cron cannot read, it sends Alina a message saying so and pointing to the
// button, rather than failing silently.
//
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (already used by
// api/notify-registration.js) and, for the cron, CRON_SECRET (already used by
// api/cleanup-expired-photos.js). SITE_URL is optional.
//
// Testing the cron by hand: GET /api/send-roster?for=2026-10-20 with the
// CRON_SECRET bearer pretends that date is "tomorrow".
//
// Reply: { ok, mode, competitions: [{ title, registrations, rows, sent }] }

const crypto = require("crypto");
const { verifyCaller, isAdminEmail } = require("./_verify");
const {
  site, israelDay, nextDay, hebrewDate, listCompetitions, labelOf,
  registrationsAsCaller, registrationsAsServer, buildCompetitionFile,
  esc, telegramConfig, sendToChats,
} = require("./_lib/rosterData");

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function safeJson(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}

/** Builds the file for one competition and sends it to every configured chat. */
async function buildAndSend(tg, comp, registrations) {
  const title = labelOf(comp);
  if (registrations.length === 0) {
    const dateText = comp.startDate ? hebrewDate(comp.startDate) : "";
    const sent = await sendToChats(tg, tg.chatIds, {
      text: `📋 <b>${esc(title)}</b>\n${esc(dateText)}\nעדיין אין נרשמים לתחרות הזו.`,
    });
    return { title, registrations: 0, rows: 0, sent: sent.filter((r) => r.sent).length, results: sent };
  }
  const built = await buildCompetitionFile(comp, registrations);
  const sent = await sendToChats(tg, tg.chatIds, built);
  return {
    title,
    registrations: built.registrations,
    rows: built.rows,
    sent: sent.filter((r) => r.sent).length,
    results: sent,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const presented = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!presented) {
    res.status(401).json({ ok: false, error: "missing-token" });
    return;
  }

  const tg = telegramConfig();
  if (!tg.token || tg.chatIds.length === 0) {
    res.status(200).json({ ok: false, error: "not-configured" });
    return;
  }

  /* Which door? The cron secret, or a signed-in admin. Checked in this order so a
     cron call never touches the identity service. */
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && safeEqual(presented, cronSecret)) {
    await runCron(req, res, tg);
    return;
  }
  await runOnDemand(req, res, tg, presented);
};

async function runCron(req, res, tg) {
  const tomorrow = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query?.for || ""))
    ? String(req.query.for)
    : nextDay(israelDay());

  let comps;
  try {
    comps = (await listCompetitions()).filter((c) => c.startDate === tomorrow);
  } catch (err) {
    console.error("Roster cron could not list competitions:", err);
    res.status(502).json({ ok: false, error: "competitions-unavailable" });
    return;
  }
  if (comps.length === 0) {
    res.status(200).json({ ok: true, mode: "cron", tomorrow, competitions: [], skipped: "no-competition-tomorrow" });
    return;
  }

  const out = [];
  for (const comp of comps) {
    const title = labelOf(comp);
    try {
      const regs = await registrationsAsServer(title);
      out.push(await buildAndSend(tg, comp, regs));
    } catch (err) {
      /* The point of this branch: never fail silently. Say so, and say what to do. */
      console.error("Roster cron could not read sign-ups:", err);
      const sent = await sendToChats(tg, tg.chatIds, {
        text: [
          `⚠️ <b>לא הצלחתי להכין את קובץ המתחרים</b>`,
          `${esc(title)} — מחר`,
          `פתחי את רשימת ההרשמות ולחצי על "שלח לי קובץ מקצים":`,
          `<a href="${site()}/admin/registrations">פתיחת רשימת ההרשמות</a>`,
        ].join("\n"),
      });
      out.push({ title, error: "server-read-failed", detail: err.message, sent: sent.filter((r) => r.sent).length });
    }
  }
  res.status(200).json({ ok: out.every((o) => !o.error), mode: "cron", tomorrow, competitions: out });
}

async function runOnDemand(req, res, tg, idToken) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  let caller;
  try {
    caller = await verifyCaller(idToken);
  } catch (err) {
    console.error("Roster could not verify the caller:", err);
    res.status(502).json({ ok: false, error: "verification-unavailable" });
    return;
  }
  if (!caller) {
    res.status(401).json({ ok: false, error: "invalid-token" });
    return;
  }
  if (!isAdminEmail(caller.email)) {
    res.status(403).json({ ok: false, error: "not-admin" });
    return;
  }

  const body = typeof req.body === "string" ? safeJson(req.body) : req.body || {};
  const title = typeof body.competition === "string" ? body.competition.trim() : "";
  if (!title || title.length > 200) {
    res.status(400).json({ ok: false, error: "bad-competition" });
    return;
  }

  try {
    // The competition record gives the dates; the title alone is enough if it
    // has been deleted since (sign-ups outlive it on purpose).
    const comp = (await listCompetitions()).find((c) => labelOf(c) === title) || { name: title };
    const regs = await registrationsAsCaller(title, idToken);
    const result = await buildAndSend(tg, comp, regs);
    res.status(200).json({ ok: result.sent > 0, mode: "on-demand", competitions: [result] });
  } catch (err) {
    console.error("Roster on demand failed:", err);
    res.status(502).json({ ok: false, error: "read-failed" });
  }
}
