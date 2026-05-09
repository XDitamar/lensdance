import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const ADMIN_EMAIL = "lensdance29@gmail.com";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  return initializeApp({ credential: cert(serviceAccount) });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const callerEmail = String(req.headers["x-admin-email"] || "").toLowerCase();
  if (callerEmail !== ADMIN_EMAIL) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

  try {
    const app = getAdminApp();
    const auth = getAuth(app);
    const db = getFirestore(app);

    // List all Auth users with pagination
    const allUsers = [];
    let pageToken;
    do {
      const result = await auth.listUsers(1000, pageToken);
      allUsers.push(...result.users);
      pageToken = result.pageToken;
    } while (pageToken);

    let created = 0;
    let existing = 0;

    for (const user of allUsers) {
      if (!user.email) continue;

      const ref = db.collection("users").doc(user.uid);
      const snap = await ref.get();

      if (snap.exists) {
        existing++;
        continue;
      }

      await ref.set({
        uid: user.uid,
        email: user.email.toLowerCase(),
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      created++;
    }

    return res.status(200).json({
      ok: true,
      totalAuthUsers: allUsers.length,
      created,
      existing,
    });
  } catch (e) {
    console.error("admin-sync-auth-users error:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
