export default async function handler(req, res) {
  const need = [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
    "BUNNY_STORAGE_ZONE",
    "BUNNY_STORAGE_HOST",
    "BUNNY_STORAGE_ACCESS_KEY",
    "BUNNY_CDN_HOST",
    "ADMIN_EMAIL",
  ];
  const envStatus = Object.fromEntries(
    need.map((k) => [k, Boolean(process.env[k])])
  );
  res.status(200).json({
    ok: true,
    node: process.versions.node,
    env: envStatus,
    method: req.method,
    url: req.url,
  });
}
