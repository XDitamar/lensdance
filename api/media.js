// api/media.js (CommonJS)
const { db } = require("./_firebaseAdmin");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("Method Not Allowed");
  }
  try {
    const uid = req.query.user;
    let q = db.collection("media");
    if (uid) q = q.where("ownerUid", "==", uid);
    const snap = await q.orderBy("createdAt", "desc").limit(500).get();
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(items));
  } catch (e) {
    res.statusCode = 500;
    res.end(e.message || "Failed to list media");
  }
};
