// api/send-roster.js
//
// ─────────────────────────────────────────────────────────────────────────────
// SENDS ALINA THE ROSTER FOR A COMPETITION, AS A SPREADSHEET, ON TELEGRAM
// ─────────────────────────────────────────────────────────────────────────────
//
// Two ways in, one result (an .xlsx of who rides what, built by _lib/roster.js):
//
//  1. THE DAY BEFORE, AUTOMATICALLY. Vercel Cron calls this every morning (see
//     `crons` in vercel.json) with `Authorization: Bearer <CRON_SECRET>`. It
//     looks for a competition whose first day is TOMORROW (Israel time) and, if
//     there is one, builds and sends that roster. Most mornings there is none
//     and it does nothing, silently.
//
//  2. ON DEMAND, FROM THE ADMIN PAGE. A button on /admin/registrations POSTs
//     { competition: "<title>" } with the admin's own Firebase ID token. The
//     same file arrives on her phone. This is also the safety net for (1).
//
// ── WHY THERE ARE TWO WAYS TO READ THE SIGN-UPS ────────────────────────────
// `registrations` is readable by the admin only (firestore.rules), and the
// firebase-admin credentials on the deployment have been unreliable
// (api/media.js fails on them). So:
//
//   * ON DEMAND reads Firestore's REST API with the ADMIN'S OWN ID TOKEN as the
//     bearer, so the security rules decide, exactly as in api/spin.js. It needs
//     no server credentials and works today.
//
//   * THE CRON has no signed-in admin, so it needs firebase-admin. If those
//     credentials work it just works. If they do not, it must NOT fail
//     silently (a roster that quietly never arrives is the worst outcome):
//     it sends Alina a short message saying the file could not be built and
//     pointing her to the button. The real fix is working FIREBASE_*
//     credentials on Vercel, which unblocks other things too (see CLAUDE.md).
//
// ── SETUP ──────────────────────────────────────────────────────────────────
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (already used by
// api/notify-registration.js) and, for the cron, CRON_SECRET (already used by
// api/cleanup-expired-photos.js). SITE_URL is optional.
//
// Testing the cron by hand: GET /api/send-roster?for=2026-10-20 with the
// CRON_SECRET bearer pretends that date is "tomorrow".
//
// Reply: { ok, mode, competitions: [{ title, registrations, rows, sent }] }

const crypto = require("crypto");
const { expandRows, buildRosterXlsx } = require("./_lib/roster");
const { verifyCaller, isAdminEmail } = require("./_verify");

const DEFAULT_SITE = "https://www.lens-dance.com";
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "lensdance-8d29c";
const WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY || "AIzaSyCTL0IcIZ4cXhevCucMDJdTn5SKUArbdw8";
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const site = () => (process.env.SITE_URL || DEFAULT_SITE).replace(/\/+$/, "");

/* ── dates ───────────────────────────────────────────────────────────────── */

/** "YYYY-MM-DD" for a moment, as the calendar reads in Israel. */
const israelDay = (d = new Date()) =>
  d.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

/** The day after a "YYYY-MM-DD", by calendar (noon UTC dodges any DST edge). */
function nextDay(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** "Thursday 22 October 2026" in Hebrew, from "YYYY-MM-DD". */
function hebrewDate(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? ymd || ""
    : d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/* ── Firestore REST ──────────────────────────────────────────────────────── */

/** One Firestore REST value → a plain JS value. */
function fromValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  if ("mapValue" in v) return fromFields(v.mapValue.fields || {});
  return null;
}

const fromFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, fromValue(v)]));

/** competitions/* — public read, so no credentials needed. */
async function listCompetitions() {
  const r = await fetch(`${FS}/competitions?pageSize=300&key=${WEB_API_KEY}`);
  if (!r.ok) throw new Error(`competitions HTTP ${r.status}`);
  const data = await r.json();
  return (data.documents || []).map((d) => ({ id: d.name.split("/").pop(), ...fromFields(d.fields) }));
}

/** The label sign-ups are filed under; mirrors competitionLabel() in the app. */
const labelOf = (c) => [c?.name, c?.farm].filter(Boolean).join(" · ");

/** Sign-ups for one competition, read AS the caller (their token, their rules). */
async function registrationsAsCaller(title, idToken) {
  const r = await fetch(`${FS}:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "registrations" }],
        where: { fieldFilter: { field: { fieldPath: "competitionTitle" }, op: "EQUAL", value: { stringValue: title } } },
        limit: 2000,
      },
    }),
  });
  if (!r.ok) throw new Error(`registrations HTTP ${r.status}`);
  const rows = await r.json();
  return rows.filter((x) => x.document).map((x) => fromFields(x.document.fields));
}

/** Sign-ups for one competition through firebase-admin (the cron's only way). */
async function registrationsAsServer(title) {
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    admin.initializeApp({
      credential: raw
        ? admin.credential.cert(JSON.parse(raw))
        : admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
          }),
    });
  }
  const snap = await admin.firestore().collection("registrations").where("competitionTitle", "==", title).get();
  return snap.docs.map((d) => d.data());
}

/* ── Telegram ────────────────────────────────────────────────────────────── */

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const telegramConfig = () => ({
  token: process.env.TELEGRAM_BOT_TOKEN,
  chatIds: (process.env.TELEGRAM_CHAT_ID || "").split(",").map((s) => s.trim()).filter(Boolean),
});

/** Sends text, or a document with a caption, to every chat; one failing never stops the rest. */
async function sendToAll({ token, chatIds }, { text, file, filename, caption }) {
  return Promise.all(
    chatIds.map(async (chat_id) => {
      try {
        let tg;
        if (file) {
          const form = new FormData();
          form.append("chat_id", chat_id);
          form.append("caption", caption || "");
          form.append("parse_mode", "HTML");
          form.append(
            "document",
            new Blob([file], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
            filename
          );
          tg = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: form });
        } else {
          tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id, text, parse_mode: "HTML", disable_web_page_preview: true }),
          });
        }
        const data = await tg.json().catch(() => ({}));
        if (!tg.ok || data.ok === false) {
          console.error("Telegram send failed:", chat_id, tg.status, data);
          return { chat_id, sent: false, error: data.description || `HTTP ${tg.status}` };
        }
        return { chat_id, sent: true };
      } catch (err) {
        console.error("Telegram send threw:", chat_id, err);
        return { chat_id, sent: false, error: err.message };
      }
    })
  );
}

/** Builds the file for one competition and sends it. Returns what happened. */
async function buildAndSend(tg, comp, registrations) {
  const title = labelOf(comp);
  const dateText = comp.startDate
    ? comp.endDate && comp.endDate !== comp.startDate
      ? `${hebrewDate(comp.startDate)} – ${hebrewDate(comp.endDate)}`
      : hebrewDate(comp.startDate)
    : "";

  if (registrations.length === 0) {
    const sent = await sendToAll(tg, {
      text: `📋 <b>מקצים — ${esc(title)}</b>\n${esc(dateText)}\nעדיין אין נרשמים לתחרות הזו.`,
    });
    return { title, registrations: 0, rows: 0, sent: sent.filter((r) => r.sent).length, results: sent };
  }

  const rows = expandRows(registrations);
  const file = await buildRosterXlsx({ title, dateText, registrations: registrations.length }, rows);
  const paid = rows.filter((r) => r.paid).length;
  const sent = await sendToAll(tg, {
    file,
    filename: `roster-${comp.startDate || "competition"}.xlsx`,
    caption: [
      `📋 <b>מקצים — ${esc(title)}</b>`,
      esc(dateText),
      `${registrations.length} נרשמים · ${paid}/${rows.length} שורות עם מקדמה`,
    ].filter(Boolean).join("\n"),
  });
  return { title, registrations: registrations.length, rows: rows.length, sent: sent.filter((r) => r.sent).length, results: sent };
}

/* ── handler ─────────────────────────────────────────────────────────────── */

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

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
      const sent = await sendToAll(tg, {
        text: [
          `⚠️ <b>לא הצלחתי להכין את קובץ המקצים</b>`,
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

function safeJson(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}
