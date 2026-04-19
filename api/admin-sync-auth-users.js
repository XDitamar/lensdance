import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const adminEmail = (process.env.REACT_APP_ADMIN_EMAIL || "lensdance29@gmail.com").toLowerCase();

const app =
  global._firebaseAdminApp ||
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });

global._firebaseAdminApp = app;

async function getAllAuthUsers() {
  const auth = getAuth(app);
  const users = [];
  let nextPageToken;

  do {
    const result = await auth.listUsers(1000, nextPageToken);
    users.push(...result.users);
    nextPageToken = result.pageToken;
  } while (nextPageToken);

  return users;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const callerEmail = String(req.headers["x-admin-email"] || "").toLowerCase();
    if (!callerEmail || callerEmail !== adminEmail) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const db = getFirestore(app);
    const authUsers = await getAllAuthUsers();

    let created = 0;
    let existing = 0;
    let skippedWithoutEmail = 0;

    for (const user of authUsers) {
      if (!user.email) {
        skippedWithoutEmail += 1;
        continue;
      }

      const userRef = db.collection("users").doc(user.uid);
      const existingDoc = await userRef.get();

      if (existingDoc.exists) {
        existing += 1;
        continue;
      }

      await userRef.set({
        uid: user.uid,
        email: String(user.email).toLowerCase(),
        createdAt: FieldValue.serverTimestamp(),
        syncedFromAuthAt: FieldValue.serverTimestamp(),
      });

      created += 1;
    }

    return res.status(200).json({
      ok: true,
      totalAuthUsers: authUsers.length,
      created,
      existing,
      skippedWithoutEmail,
    });
  } catch (error) {
    console.error("Error in /api/admin-sync-auth-users:", error);
    return res.status(500).json({ ok: false, error: error.message || "Internal server error" });
  }
}
