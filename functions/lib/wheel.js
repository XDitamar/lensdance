// functions/lib/wheel.js
//
// THE RULES OF THE PRIZE WHEEL, as pure functions: no Firestore, no network, no
// clock except the one passed in. functions/index.js wraps them in callables
// that read and write through the Admin SDK; everything that decides "may this
// happen?" is decided HERE, so it can be tested without any of that.
//
// WHY THE PRIZE RECORD NEEDS NO SIGNATURE
// A checksum only protects something if the key that makes it is secret, and a
// browser or a Firestore rule cannot hold a secret. So the record is made
// impossible to forge instead: only a Cloud Function (Admin SDK) writes
// users/{uid}/prizes/{orderId}, and firestore.rules lets clients only READ it.
// A document in that path is genuine by construction.

const crypto = require("crypto");
const { PRIZES, TOTAL_WEIGHT, PRIZE_WHEEL_UNTIL, PRIZE_VALID_UNTIL } = require("../prizes");

/** No 0/O/1/I: the code gets read aloud and typed from a screenshot. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/* ── dates (Israel's calendar, whatever the server's clock zone is) ──────── */

/** "YYYY-MM-DD" as the calendar reads in Israel at `now`. */
function israelDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Can the wheel still be spun? Open through the whole of PRIZE_WHEEL_UNTIL. */
const wheelOpen = (now = new Date()) => israelDay(now) <= PRIZE_WHEEL_UNTIL;

/** Has a prize that was valid until `validUntil` run out? No date counts as run out. */
const isExpired = (validUntil, now = new Date()) => !validUntil || israelDay(now) > validUntil;

/* ── the draw ────────────────────────────────────────────────────────────── */

/**
 * One weighted draw over the prizes table. `randomInt` is injectable for tests;
 * crypto.randomInt rather than Math.random because this decides who gets
 * something worth money.
 */
function drawPrize(randomInt = crypto.randomInt) {
  let roll = randomInt(TOTAL_WEIGHT);
  for (const prize of PRIZES) {
    if (roll < prize.weight) return prize;
    roll -= prize.weight;
  }
  return PRIZES[PRIZES.length - 1];
}

/** "LD-" and six characters of CODE_ALPHABET. */
function makeCode(randomInt = crypto.randomInt) {
  let out = "";
  for (let i = 0; i < 6; i += 1) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `LD-${out}`;
}

const prizeById = (id) => PRIZES.find((p) => p.id === id) || null;
const isCapped = (prizeId) => !!prizeById(prizeId)?.capped;

/* ── may this order be spun? ─────────────────────────────────────────────── */

/**
 * `order` = { userId, submittedAtMs } read from registrations/{orderId}, or null
 * when there is no such registration. Returns null when the spin may go ahead,
 * otherwise the machine code the client turns into a friendly message.
 */
function checkSpinOrder({ uid, order }) {
  if (!order) return "order-not-found";
  // A sign-up made while signed out has userId null: it belongs to nobody who
  // can be proven to be the caller, so it earns no spin.
  if (!order.userId || order.userId !== uid) return "order-not-yours";
  if (!order.submittedAtMs || israelDay(new Date(order.submittedAtMs)) > PRIZE_WHEEL_UNTIL) return "order-too-late";
  return null;
}

/* ── may this prize be redeemed? ─────────────────────────────────────────── */

/**
 * The prize itself, before any order is chosen (this is also what the admin
 * screen shows). `prize` and each of `allPrizes` = { prizeId, orderId, issuedAt,
 * validUntil, redeemed }. Reasons: already-redeemed | expired | capped-limit.
 *
 * The six capped prizes are honoured ONCE per customer: only the EARLIEST one
 * they won (by issuedAt, the winning order's time) can ever be redeemed. A
 * redeemed capped prize still counts as that one, so a later capped prize is
 * refused after it too.
 */
function checkPrize({ prize, allPrizes, now = new Date() }) {
  if (prize.redeemed) return "already-redeemed";
  if (isExpired(prize.validUntil, now)) return "expired";
  if (isCapped(prize.prizeId)) {
    const capped = (allPrizes || [])
      .filter((p) => isCapped(p.prizeId))
      .sort((a, b) => a.issuedAt - b.issuedAt || String(a.orderId).localeCompare(String(b.orderId)));
    if (capped.length && capped[0].orderId !== prize.orderId) return "capped-limit";
  }
  return null;
}

/**
 * The order the prize would be spent ON. `target` = { id, userId, depositPaid,
 * submittedAtMs } or null. Reasons: wrong-owner | same-order | unpaid | not-later.
 * (A prize can never be spent on the order that produced it, and only on a LATER
 * order whose deposit is marked paid.)
 */
function checkTarget({ uid, prize, target }) {
  if (!target || !target.userId || target.userId !== uid) return "wrong-owner";
  if (target.id === prize.orderId) return "same-order";
  if (target.depositPaid !== true) return "unpaid";
  if (!(Number(target.submittedAtMs) > Number(prize.issuedAt))) return "not-later";
  return null;
}

/** Everything that must hold to redeem `prize` on `target`. Null means go ahead. */
function checkRedeem({ uid, prize, allPrizes, target, now = new Date() }) {
  return checkPrize({ prize, allPrizes, now }) || checkTarget({ uid, prize, target });
}

/* ── typing a prize code ─────────────────────────────────────────────────── */

const CODE_BODY = /^[A-HJ-NP-Z2-9]{6}$/;
/** Upper case, and nothing but letters and digits: spaces, hyphens, underscores, punctuation, emoji go. */
const squash = (raw) => String(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * What a customer typed -> the code as stored ("LD-" and six characters), or
 * null when it cannot be a code. Forgiving about how it is typed (case, spaces,
 * hyphens, with or without the "LD-" prefix), strict about what it is: six
 * characters of CODE_ALPHABET.
 */
function normaliseCode(raw) {
  if (typeof raw !== "string" || raw.length > 40) return null;
  const s = squash(raw);
  const body = s.length === 8 && s.startsWith("LD") ? s.slice(2) : s;
  return CODE_BODY.test(body) ? `LD-${body}` : null;
}

/** The test spin's code, "TEST": never a real prize, however it is typed. */
function isTestCode(raw) {
  if (typeof raw !== "string" || raw.length > 40) return false;
  const s = squash(raw);
  return s === "TEST" || s === "LDTEST";
}

/** checkPrize's reason -> the word the registration form uses. */
function codeReason(prizeReason) {
  return { "already-redeemed": "redeemed", expired: "expired", "capped-limit": "capped-limit" }[prizeReason] || null;
}

/* ── the follow-up details of the two special prizes ─────────────────────── */

const MAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE = /^\+?[0-9\s\-()]{7,}$/;
const str = (v) => (typeof v === "string" ? v.trim() : "");

/**
 * `extra` for the team prize ("team": five distinct friends and their consent)
 * or the jackpot ("jackpot": two DIFFERENT competitions). Null when fine,
 * otherwise "wrong-type" | "consent" | "count" | "incomplete" | "contact" |
 * "duplicate" | "same". Mirrors validateTeam / validateJackpot in
 * src/lib/rewards.js, which only decide what the form says before it asks.
 */
function validateExtra(prizeId, extra) {
  const special = prizeById(prizeId)?.special;
  if (!special || !extra || typeof extra !== "object" || extra.type !== special) return "wrong-type";

  if (special === "team") {
    if (extra.consent !== true) return "consent";
    if (!Array.isArray(extra.friends) || extra.friends.length !== 5) return "count";
    const seen = new Set();
    for (const f of extra.friends) {
      const name = str(f?.name);
      const contact = str(f?.contact).toLowerCase();
      if (!name || !contact) return "incomplete";
      const isPhone = PHONE.test(contact);
      if (!MAIL.test(contact) && !isPhone) return "contact";
      const key = isPhone ? contact.replace(/\D/g, "") : contact;
      if (seen.has(key)) return "duplicate";
      seen.add(key);
    }
    return null;
  }

  // jackpot
  const video = str(extra.video?.id);
  const pack = str(extra.pack?.id);
  if (!video || !pack) return "incomplete";
  if (video === pack) return "same";
  return null;
}

/** Only the fields we know, trimmed and capped, so a customer cannot store anything else. */
function cleanExtra(prizeId, extra) {
  if (prizeById(prizeId)?.special === "team") {
    return {
      type: "team",
      consent: true,
      friends: extra.friends.map((f) => ({ name: str(f.name).slice(0, 80), contact: str(f.contact).slice(0, 120) })),
    };
  }
  const comp = (c) => ({ id: str(c.id).slice(0, 100), label: str(c.label).slice(0, 200) });
  return { type: "jackpot", video: comp(extra.video), pack: comp(extra.pack) };
}

module.exports = {
  PRIZE_VALID_UNTIL,
  israelDay,
  wheelOpen,
  isExpired,
  drawPrize,
  makeCode,
  prizeById,
  isCapped,
  checkSpinOrder,
  checkPrize,
  checkTarget,
  checkRedeem,
  normaliseCode,
  isTestCode,
  codeReason,
  validateExtra,
  cleanExtra,
};
