// api/upload.js (CommonJS)
const { IncomingForm } = require("formidable");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { verifyAuth, db } = require("./_firebaseAdmin");
const { putFile } = require("./_bunny");

// Disable default body parsing so formidable can handle multipart
module.exports.config = { api: { bodyParser: false } };

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end("Method Not Allowed");
  }

  try {
    const decoded = await verifyAuth(req);
    if (decoded.email !== process.env.ADMIN_EMAIL) {
      res.statusCode = 403;
      return res.end("Not authorized");
    }

    const file = await parseForm(req);
    if (!file) {
      res.statusCode = 400;
      return res.end("No file");
    }

    const ext = (file.originalFilename || "").split(".").pop() || "bin";
    const key = `media/${new Date().toISOString().slice(0,10)}/${uuidv4()}.${ext}`;

    const buffer = fs.readFileSync(file.filepath);
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
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ id: ref.id, ...doc }));
  } catch (e) {
    res.statusCode = 500;
    return res.end(e.message || "Upload failed");
  }
};

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ multiples: false, keepExtensions: true });
    form.parse(req, (err, _fields, files) => {
      if (err) return reject(err);
      resolve(files.file); // input name must be "file"
    });
  });
}
