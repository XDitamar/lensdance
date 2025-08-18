// api/media/[id].js (CommonJS)
const { verifyAuth, db } = require("../_firebaseAdmin");
const { deleteFile } = require("../_bunny");

module.exports = async (req, res) => {
  if (req.method !== "DELETE") {
    res.statusCode = 405;
    return res.end("Method Not Allowed");
  }

  try {
    const decoded = await verifyAuth(req);
    if (decoded.email !== process.env.ADMIN_EMAIL) {
      res.statusCode = 403;
      return res.end("Not authorized");
    }

    const id = req.query.id;
    const ref = db.collection("media").doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      res.statusCode = 404;
      return res.end("Not found");
    }

    const data = doc.data();
    if (data?.path) await deleteFile(data.path);
    await ref.delete();

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.statusCode = 500;
    res.end(e.message || "Delete failed");
  }
};
