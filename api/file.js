// api/file.js
//
// ─────────────────────────────────────────────────────────────────────────────
// SERVES A CLIENT'S OWN PHOTO FROM OUR OWN DOMAIN
// ─────────────────────────────────────────────────────────────────────────────
//
// A browser may DISPLAY a Storage file without permission but may not READ its
// bytes: fetch() against firebasestorage.googleapis.com is refused unless the
// bucket carries a CORS policy, and this one does not. That single refusal is
// what forced the gallery to download photographs one at a time — one browser
// prompt per file, which on a phone is unusable.
//
// This route removes the refusal by removing the cross-origin hop: the page
// asks its own domain, this function fetches the file server-side, and the
// bytes come back same-origin, where no permission is needed. With that, the
// gallery can build a zip on a desktop and hand a phone a single share sheet
// with every photograph in it — one approval for the lot.
//
// ── DOES THIS GIVE ANYTHING AWAY? NO ───────────────────────────────────────
// A Firebase download URL already contains its own access token; whoever holds
// the link can fetch the file directly. This proxies exactly that link and
// nothing else — it cannot reach a file the caller could not already open, so
// it widens no access. What it must not become is an open proxy for the whole
// internet, so the target is checked to be a download URL for OUR bucket, and
// refused otherwise.
//
// ── COST ───────────────────────────────────────────────────────────────────
// Every byte travels Storage → here → client instead of straight to the
// client, and that counts against the deployment's bandwidth. It is the price
// of not needing a change on the bucket. Setting a CORS policy (see the header
// of src/lib/zipDownload.js) makes this route unnecessary, and the client
// prefers the direct path whenever it works.

const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

const ALLOWED_HOSTS = new Set([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
]);

/** Only our own bucket, under any of the names it is reachable by. */
const BUCKET_FRAGMENTS = [
  "lensdance-8d29c.firebasestorage.app",
  "lensdance-8d29c.appspot.com",
];

module.exports = async function handler(req, res) {
  const raw = req.query?.url;
  if (!raw || typeof raw !== "string") {
    res.status(400).json({ ok: false, error: "Missing url" });
    return;
  }

  let target;
  try {
    target = new URL(raw);
  } catch {
    res.status(400).json({ ok: false, error: "Bad url" });
    return;
  }

  if (!ALLOWED_HOSTS.has(target.hostname) ||
      !BUCKET_FRAGMENTS.some((b) => target.pathname.includes(b) || target.hostname.startsWith(b))) {
    // Anything else and this would be an open proxy — a way to make our
    // server fetch arbitrary addresses on someone else's behalf.
    res.status(403).json({ ok: false, error: "Only this project's storage" });
    return;
  }

  try {
    const upstream = await fetch(target.toString());
    if (!upstream.ok) {
      res.status(upstream.status).json({ ok: false, error: `Upstream ${upstream.status}` });
      return;
    }

    const type = upstream.headers.get("content-type") || "application/octet-stream";
    const length = upstream.headers.get("content-length");
    res.setHeader("Content-Type", type);
    if (length) res.setHeader("Content-Length", length);
    // The bytes of a photograph never change, and a client who downloads the
    // gallery twice should not pay for it twice.
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.status(200);

    /* STREAMED, NOT BUFFERED.
       Reading the whole file into memory before answering would hold an 8 MB
       photograph in the function and push the response through the platform's
       buffered-body limit, which a full-resolution image can exceed on its
       own. Piping hands each chunk straight on: flat memory, and no ceiling
       on the size of a single picture. */
    if (upstream.body && Readable.fromWeb) {
      await pipeline(Readable.fromWeb(upstream.body), res);
      return;
    }

    // Older runtime with no web-stream bridge — correctness over memory.
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    console.error("file proxy failed:", err);
    // A stream that broke halfway has already sent its headers, and answering
    // again would throw on top of the original failure. Closing the connection
    // is what a truncated download looks like, and the client retries.
    if (res.headersSent) { res.end(); return; }
    res.status(502).json({ ok: false, error: err.message });
  }
};
