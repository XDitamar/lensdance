// api/_lib/rosterData.js
//
// Everything the two roster entry points share: reading competitions and
// sign-ups from Firestore, turning a competition into a file, and sending text
// or a document through the Telegram bot.
//
//   api/send-roster.js       the day-before file + the admin page's button
//   api/telegram-webhook.js  Alina's /sum command
//
// ── HOW SIGN-UPS ARE READ ──────────────────────────────────────────────────
// `registrations` is readable by the admin only (firestore.rules), and the
// firebase-admin credentials on the deployment have been unreliable
// (api/media.js fails on them). Two ways, depending on who is asking:
//
//   * A signed-in admin (the button): Firestore's REST API with the ADMIN'S OWN
//     ID TOKEN as the bearer, so the security rules decide, as in api/spin.js.
//     No server credentials needed; works today.
//   * Nobody signed in (the cron, the Telegram command): there is no identity,
//     so this needs firebase-admin. If its credentials work, it works. If they
//     do not, the caller says so out loud (a roster that quietly never arrives
//     is the worst outcome). The real fix is working FIREBASE_* credentials on
//     Vercel, which unblocks other things too (see CLAUDE.md).

const { expandRows, buildRosterXlsx } = require("./roster");

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

/** "יום חמישי, 22 באוקטובר 2026" from "YYYY-MM-DD". */
function hebrewDate(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? ymd || ""
    : d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Has the last day of this competition passed? (Dates are "YYYY-MM-DD" strings.) */
const hasEnded = (c) => {
  const end = c?.endDate || c?.startDate;
  return !!end && end < israelDay();
};

/* ── Firestore ───────────────────────────────────────────────────────────── */

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

/** competitions/* — public read, so no credentials needed. Soonest first. */
async function listCompetitions() {
  const r = await fetch(`${FS}/competitions?pageSize=300&key=${WEB_API_KEY}`);
  if (!r.ok) throw new Error(`competitions HTTP ${r.status}`);
  const data = await r.json();
  return (data.documents || [])
    .map((d) => ({ id: d.name.split("/").pop(), ...fromFields(d.fields) }))
    .sort((a, b) => String(a.startDate || "").localeCompare(String(b.startDate || "")));
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

/** Sign-ups for one competition through firebase-admin (no signed-in caller). */
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

/* ── the file ────────────────────────────────────────────────────────────── */

/**
 * One competition's sign-ups → the workbook and the words that go with it.
 * `registrations` must be non-empty (the callers say "no sign-ups" in words).
 */
async function buildCompetitionFile(comp, registrations) {
  const title = labelOf(comp);
  const dateText = comp.startDate
    ? comp.endDate && comp.endDate !== comp.startDate
      ? `${hebrewDate(comp.startDate)} – ${hebrewDate(comp.endDate)}`
      : hebrewDate(comp.startDate)
    : "";
  const rows = expandRows(registrations);
  const file = await buildRosterXlsx({ title, dateText, registrations: registrations.length }, rows);
  const paid = rows.filter((r) => r.paid).length;
  return {
    title,
    file,
    filename: `${comp.startDate || "competition"}-${String(comp.id || "roster").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 12) || "roster"}.xlsx`,
    caption: [
      `📋 <b>${esc(title)}</b>`,
      esc(dateText),
      `${registrations.length} נרשמים · ${paid}/${rows.length} שורות עם מקדמה`,
    ].filter(Boolean).join("\n"),
    registrations: registrations.length,
    rows: rows.length,
  };
}

/* ── Telegram ────────────────────────────────────────────────────────────── */

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const telegramConfig = () => ({
  token: process.env.TELEGRAM_BOT_TOKEN,
  chatIds: (process.env.TELEGRAM_CHAT_ID || "").split(",").map((s) => s.trim()).filter(Boolean),
});

/** Sends text, or a document with a caption, to each chat; one failing never stops the rest. */
async function sendToChats({ token }, chatIds, { text, file, filename, caption }) {
  return Promise.all(
    chatIds.map(async (chat_id) => {
      try {
        let tg;
        if (file) {
          const form = new FormData();
          form.append("chat_id", String(chat_id));
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

module.exports = {
  site, israelDay, nextDay, hebrewDate, hasEnded,
  listCompetitions, labelOf, registrationsAsCaller, registrationsAsServer,
  buildCompetitionFile, esc, telegramConfig, sendToChats,
};
