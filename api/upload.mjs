import { IncomingForm } from "formidable";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import { verifyAuth, db } from "./_firebaseAdmin.mjs";
import { putFile } from "./_bunny.mjs";

export const config = {
  api: { bodyParser: false, sizeLimit: "100mb" }
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const decoded = await verifyAuth(req);
    if (decoded.email !== process.env.ADMIN_EMAIL) return res.status(403).send("Not authorized");

    const file = await parseForm(req);
    if (!file) return res.status(400).send("No file provided");

    const ext = (file.originalFilename || "bin").split(".").pop();
    const key = `media/${new Date().toISOString().slice(0,10)}/${uuidv4()}.${ext}`;

    const buffer = await fs.readFile(file.filepath);
    const publicUrl = await putFile(key, buffer, file.mimetype);

    const doc = {
      url: publicUrl,
      path: key,
      type: file.mimetype || "application/octet-stream",
      ownerUid: decoded.uid,
      createdAt: Date.now(),
      provider: "bunny",
    };

    const ref = await db.collection("media").add(doc);
    return res.status(200).json({ id: ref.id, ...doc });
  } catch (e) {
    console.error("UPLOAD ERROR:", e);
    return res.status(500).send(String(e));
  }
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ multiples: false, keepExtensions: true });
    form.parse(req, (err, _fields, files) => {
      if (err) return reject(err);
      resolve(files.file); // input name="file"
    });
  });
}
