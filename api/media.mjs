import { db } from "./_firebaseAdmin.mjs";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");
    const uid = req.query.user;
    let q = db.collection("media");
    if (uid) q = q.where("ownerUid", "==", uid);
    const snap = await q.orderBy("createdAt", "desc").limit(500).get();
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    return res.status(200).json(items);
  } catch (e) {
    console.error("MEDIA LIST ERROR:", e);
    return res.status(500).send(e.message || "Failed to list media");
  }
}
