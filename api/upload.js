// api/upload.js
import { IncomingForm } from "formidable";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import fetch from "node-fetch";
import { verifyAuth, db } from "./_firebaseAdmin";
import { putFile } from "./_bunny";

export const config = { api: { bodyParser: false } }; // required for formidable

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const decoded = await verifyAuth(req);
    if (decoded.email !== process.env.ADMIN_EMAIL) {
      return res.status(403).send("Not authorized");
    }

    const file = await parseForm(req);
    if (!file) return res.status(400).send("No file provided");

    const ext = file.originalFilename.split(".").pop();
    const key = `media/${uuidv4()}.${ext}`;

    const buffer = fs.readFileSync(file.filepath);
    const url = await putFile(key, buffer, file.mimetype);

    const doc = {
      url,
      path: key,
      type: file.mimetype,
      ownerUid: decoded.uid,
      createdAt: Date.now(),
    };

    const ref = await db.collection("media").add(doc);
    res.status(200).json({ id: ref.id, ...doc });
  } catch (err) {
    res.status(500).send(err.message);
  }
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ multiples: false });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve(files.file); // frontend must name input="file"
    });
  });
}
