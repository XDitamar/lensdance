import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

export const db = admin.firestore();

export async function verifyAuth(req) {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) throw new Error("Missing token");
  return admin.auth().verifyIdToken(token);
}
