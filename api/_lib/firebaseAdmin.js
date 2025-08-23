// api/_lib/firebaseAdmin.js
import admin from "firebase-admin";

let app;
if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey
    })
  });
} else {
  app = admin.app();
}

export const authAdmin = admin.auth();
export const db = admin.firestore();
export default app;
