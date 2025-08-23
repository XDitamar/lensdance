// api/media.js
import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

// Ensure we initialize only once
const app = !global._firebaseAdminApp
  ? initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // e.g. "lensdance-8d29c.appspot.com"
    })
  : global._firebaseAdminApp;

global._firebaseAdminApp = app;
const bucket = getStorage().bucket();

export default async function handler(req, res) {
  try {
    // list all files under "public/"
    const [files] = await bucket.getFiles({ prefix: "public/" });

    const results = await Promise.all(
      files.map(async (file) => {
        // generate signed URL (valid 1 hour)
        const [url] = await file.getSignedUrl({
          action: "read",
          expires: Date.now() + 60 * 60 * 1000,
        });

        return {
          id: file.name,
          url,
          type: file.metadata.contentType?.startsWith("image")
            ? "image"
            : file.metadata.contentType?.startsWith("video")
            ? "video"
            : "other",
          name: file.name.split("/").pop(),
          size: file.metadata.size,
          updated: file.metadata.updated,
        };
      })
    );

    res.status(200).json(results);
  } catch (e) {
    console.error("Error in /api/media:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
}
