import { verifyAuth, db } from "../_firebaseAdmin.mjs";
import { deleteFile } from "../_bunny.mjs";

export default async function handler(req, res) {
  try {
    if (req.method !== "DELETE") return res.status(405).send("Method Not Allowed");

    const decoded = await verifyAuth(req);
    if (decoded.email !== process.env.ADMIN_EMAIL) return res.status(403).send("Not authorized");

    const id = req.query.id;
    const ref = db.collection("media").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).send("Not found");

    const data = doc.data();
    if (data?.path) await deleteFile(data.path);
    await ref.delete();
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("MEDIA DELETE ERROR:", e);
    return res.status(500).send(e.message || "Delete failed");
  }
}
