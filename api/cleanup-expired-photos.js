// api/cleanup-expired-photos.js
//
// ─────────────────────────────────────────────────────────────────────────────
// DELETES CLIENT PHOTOS WHOSE 30 DAYS ARE UP
// ─────────────────────────────────────────────────────────────────────────────
//
// Runs on a schedule (see `crons` in vercel.json). A browser cannot be trusted
// to do this: the deadline passes whether or not anybody has the site open.
//
// For every `retention/{uid}` document whose expiresAt has passed and which has
// not already been processed, this deletes the files in that client's Storage
// folder and stamps `deletedAt`.
//
// ── THIS FUNCTION DESTROYS CLIENT PHOTOGRAPHS. Three guards, on purpose: ────
//
// 1. AUTHORISATION. Refuses unless the caller presents CRON_SECRET. Vercel
//    sends it automatically on scheduled runs; a stranger hitting the URL gets
//    401. Without a secret configured the function refuses entirely rather
//    than defaulting to open.
//
// 2. AN EXPLICIT SWITCH. It only deletes when RETENTION_DELETE_ENABLED=1. With
//    the variable unset it does the full scan and REPORTS what it would have
//    removed, touching nothing. That is deliberate: an auto-delete job that
//    has never been watched run, pointed at the only copy of somebody's
//    competition photos, is not something to enable sight unseen. Read a dry
//    run first, then set the flag.
//
// 3. A PER-RUN CEILING. At most MAX_FOLDERS_PER_RUN clients are cleared in one
//    pass, so a mistake in the data cannot empty the whole bucket in one go.
//
// Reply shape: { ok, mode, scanned, processed: [{ uid, folder, files }], skipped }

const admin = require("firebase-admin");

const MAX_FOLDERS_PER_RUN = 25;

function initAdmin() {
  if (admin.apps.length) return admin.app();

  // Same two credential shapes the other functions in api/ accept.
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const credential = raw
    ? admin.credential.cert(JSON.parse(raw))
    : admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      });

  return admin.initializeApp({
    credential,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

/** Timestamp | Date | string → ms, or null when unreadable. */
function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value._seconds != null) return value._seconds * 1000;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

module.exports = async function handler(req, res) {
  // ── Guard 1: authorisation ────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(500).json({
      ok: false,
      error: "CRON_SECRET is not set. Refusing to run a destructive job unauthenticated.",
    });
    return;
  }
  const presented = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (presented !== secret) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  // ── Guard 2: the switch ───────────────────────────────────────────────────
  const live = process.env.RETENTION_DELETE_ENABLED === "1";
  const mode = live ? "delete" : "dry-run";

  try {
    initAdmin();
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const now = Date.now();

    const snap = await db.collection("retention").get();
    const due = [];
    let skipped = 0;

    snap.forEach((doc) => {
      const d = doc.data() || {};
      const expires = toMillis(d.expiresAt);
      // Already cleared, no readable deadline, or still in date — leave alone.
      if (d.deletedAt || !expires || expires > now) { skipped++; return; }
      due.push({ uid: doc.id, folder: d.folder || null, expires });
    });

    // Oldest deadline first, so a backlog is worked through in a sane order.
    due.sort((a, b) => a.expires - b.expires);

    // ── Guard 3: the ceiling ────────────────────────────────────────────────
    const batch = due.slice(0, MAX_FOLDERS_PER_RUN);
    const processed = [];

    for (const item of batch) {
      // Without a folder there is nothing safe to target. Never guess a prefix
      // — an empty or wrong one would match far more than intended.
      if (!item.folder) {
        processed.push({ uid: item.uid, folder: null, files: 0, note: "no folder recorded — skipped" });
        continue;
      }

      const prefix = `${item.folder.replace(/\/+$/, "")}/`;
      const [files] = await bucket.getFiles({ prefix });

      if (live) {
        await Promise.all(files.map((f) => f.delete({ ignoreNotFound: true })));
        await db.collection("retention").doc(item.uid).set(
          { deletedAt: admin.firestore.FieldValue.serverTimestamp(), deletedFiles: files.length },
          { merge: true }
        );
      }

      processed.push({ uid: item.uid, folder: item.folder, files: files.length });
    }

    res.status(200).json({
      ok: true,
      mode,
      scanned: snap.size,
      due: due.length,
      skipped,
      deferred: Math.max(0, due.length - batch.length),
      processed,
      hint: live
        ? undefined
        : "Dry run. Set RETENTION_DELETE_ENABLED=1 to let this delete for real.",
    });
  } catch (err) {
    console.error("cleanup-expired-photos failed:", err);
    res.status(500).json({ ok: false, mode, error: err.message });
  }
};
