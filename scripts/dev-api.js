// scripts/dev-api.js
//
// A tiny LOCAL stand-in for Vercel's serverless runtime, so that `npm start`
// can talk to the functions in api/ without `vercel dev` (which needs a Vercel
// login and a linked project).
//
//   Terminal 1:  npm run dev-api      (this file, on http://127.0.0.1:3001)
//   Terminal 2:  npm start            (CRA on :3000; package.json "proxy" sends
//                                      /api/* to this server)
//
// Why it exists: under plain `npm start` there is no /api, so a POST to
// /api/spin gets the dev server's 404 HTML page, which the wheel page reports as
// "service unavailable". With this running, /api/spin answers with JSON.
//
// ── SAFETY ─────────────────────────────────────────────────────────────────
//  * It refuses to start when VERCEL or NODE_ENV=production is set: this is a
//    development tool and must never be mistaken for a deployment.
//  * It listens on 127.0.0.1 only, never on the network.
//  * It does NOT load .env or .env.local wholesale. Only SPIN_SECRET is read
//    from .env.local; every other variable is left unset, so a local run cannot
//    send Alina a Telegram message or touch production storage by accident.
//    If .env.local has no SPIN_SECRET, a random one is generated in memory for
//    this process (so signatures from one run do not verify in the next). The
//    secret is never printed.
//  * WHEEL_TEST_EMAILS defaults to test@gmail.com for THIS process only, so the
//    test account can use /prize?test=1 (see TEST SPINS in api/spin.js).
//
// The real Firebase services are still used for sign-in checks and order reads
// (the handlers call Google's REST APIs with the caller's own token), exactly as
// in production.

const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { pathToFileURL } = require("url");

if (process.env.VERCEL || process.env.NODE_ENV === "production") {
  console.error("dev-api refuses to run when VERCEL or NODE_ENV=production is set. It is a local development tool.");
  process.exit(1);
}

const ROOT = path.join(__dirname, "..");
const API_DIR = path.join(ROOT, "api");
const HOST = "127.0.0.1";
const PORT = Number(process.env.DEV_API_PORT) || 3001;
const MAX_BODY = 1024 * 1024;

/** The functions this server will run, by the name used in /api/<name>. */
const HANDLERS = ["spin", "verify-prize", "send-roster", "telegram-webhook", "notify-registration", "file", "image"];

/* ── configuration: SPIN_SECRET only ─────────────────────────────────────── */

function readSpinSecretFromEnvLocal() {
  try {
    const text = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
    const m = text.match(/^SPIN_SECRET=(.*)$/m);
    const v = m && m[1].trim().replace(/^["']|["']$/g, "");
    return v || null;
  } catch (e) {
    return null;
  }
}

let secretSource;
if (process.env.SPIN_SECRET) {
  secretSource = "the environment";
} else {
  const fromFile = readSpinSecretFromEnvLocal();
  if (fromFile) {
    process.env.SPIN_SECRET = fromFile;
    secretSource = ".env.local";
  } else {
    process.env.SPIN_SECRET = crypto.randomBytes(24).toString("hex");
    secretSource = "a random value generated for this run";
  }
}
if (!process.env.WHEEL_TEST_EMAILS) process.env.WHEEL_TEST_EMAILS = "test@gmail.com";

/* ── loading a handler (fresh on every request, so edits show up at once) ─── */

async function load(name) {
  const file = path.join(API_DIR, `${name}.js`);
  if (!fs.existsSync(file)) return null;
  // Forget every cached module under api/ so an edit to a handler or to a
  // helper (_verify.js, _prizes.js, _lib/*) is picked up without a restart.
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(API_DIR + path.sep)) delete require.cache[key];
  }
  let mod;
  try {
    mod = require(file);
  } catch (err) {
    // api/image.js is written as an ES module (import / export default).
    if (err && (err.code === "ERR_REQUIRE_ESM" || /Cannot use import statement|Unexpected token 'export'/.test(String(err.message)))) {
      mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    } else {
      throw err;
    }
  }
  const fn = typeof mod === "function" ? mod : mod.default || mod.handler;
  return typeof fn === "function" ? fn : null;
}

/* ── adapting Node's request/response to what Vercel handlers expect ─────── */

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("body too large"), { code: "TOO_LARGE" })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function adaptResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = (data) => {
    if (data !== null && typeof data === "object" && !Buffer.isBuffer(data)) return res.json(data);
    if (typeof data === "string" && !res.getHeader("Content-Type")) res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(data);
    return res;
  };
  res.redirect = (a, b) => {
    const [code, url] = typeof a === "number" ? [a, b] : [307, a];
    res.statusCode = code;
    res.setHeader("Location", url);
    res.end();
    return res;
  };
  return res;
}

const sendJson = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
};

/* ── the server ──────────────────────────────────────────────────────────── */

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  res.on("finish", () => console.log(`${req.method} ${url.pathname} -> ${res.statusCode} (${Date.now() - started} ms)`));

  const m = url.pathname.match(/^\/api\/([a-z0-9-]+)\/?$/);
  if (!m || !HANDLERS.includes(m[1])) {
    sendJson(res, 404, { ok: false, error: "no-such-api", hint: `served here: ${HANDLERS.join(", ")}` });
    return;
  }

  try {
    // req.query: a string per key, an array when a key repeats (as on Vercel).
    const query = {};
    for (const [k, v] of url.searchParams) query[k] = k in query ? [].concat(query[k], v) : v;
    req.query = query;

    // req.body: parsed JSON when the request says it is JSON, otherwise the raw text.
    const raw = (await readBody(req)).toString("utf8");
    const type = String(req.headers["content-type"] || "");
    if (!raw) req.body = undefined;
    else if (type.includes("application/json")) {
      try { req.body = JSON.parse(raw); } catch (e) { sendJson(res, 400, { ok: false, error: "bad-json" }); return; }
    } else req.body = raw;

    adaptResponse(res);
    const handler = await load(m[1]);
    if (!handler) { sendJson(res, 501, { ok: false, error: "handler-not-loadable" }); return; }
    await handler(req, res);
    if (!res.writableEnded) res.end(); // a handler that forgot to answer must not hang the page
  } catch (err) {
    if (err && err.code === "TOO_LARGE") { sendJson(res, 413, { ok: false, error: "body-too-large" }); return; }
    console.error(`handler "${m[1]}" crashed:`, err && err.stack ? err.stack.split("\n").slice(0, 4).join("\n") : err);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: "handler-crash" });
    else if (!res.writableEnded) res.end();
  }
});

server.on("error", (err) => {
  console.error(err.code === "EADDRINUSE" ? `Port ${PORT} is already in use. Is dev-api already running?` : err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`dev-api listening on http://${HOST}:${PORT}  (serving /api/${HANDLERS.join(", /api/")})`);
  console.log(`  SPIN_SECRET: set (from ${secretSource}); value not shown`);
  console.log(`  test spins allowed for: ${process.env.WHEEL_TEST_EMAILS}`);
  console.log("  Now run `npm start` in another terminal and open http://localhost:3000/prize?test=1");
});
