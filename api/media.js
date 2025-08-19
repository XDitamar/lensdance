// /api/media.js  (Node/Express/Vercel-style handler)
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const ZONE = process.env.BUNNY_STORAGE_ZONE;            // e.g. "lensdance-media"
  const HOST = process.env.BUNNY_STORAGE_HOST || "storage.bunnycdn.com"; // region host
  const KEY  = process.env.BUNNY_STORAGE_ACCESS_KEY;      // DO NOT expose to client
  const CDN  = process.env.BUNNY_CDN_HOST;                // e.g. "lensdance.b-cdn.net"

  if (!ZONE || !HOST || !KEY || !CDN) {
    return res.status(500).json({ ok: false, error: "Missing env vars" });
  }

  // folders we want to expose publicly
  const roots = [
    { kind: "image", path: "lensdance-images/public" },
    { kind: "video", path: "lensdance-videos/public" },
  ];

  const listDir = async (path) => {
    const url = `https://${HOST}/${encodeURIComponent(ZONE)}/${path}/`;
    const r = await fetch(url, { headers: { AccessKey: KEY } });
    if (!r.ok) throw new Error(`Bunny list failed: ${r.status} ${await r.text()}`);
    /** Bunny returns an array like:
     *  [{ ObjectName, IsDirectory, Path, Length, ContentType, LastChanged, ...}, ...]
     */
    return r.json();
  };

  const toCDNUrl = (rel) => `https://${CDN}/${rel.replace(/^\/+/, "")}`;

  const extsToMime = (name) => {
    const n = name.toLowerCase();
    if (/\.(jpg|jpeg|png|webp|gif|avif)$/.test(n)) return "image";
    if (/\.(mp4|webm|mov|m4v|ogg)$/.test(n)) return "video";
    return "other";
  };

  try {
    const results = [];
    for (const root of roots) {
      const items = await listDir(root.path); // list the directory
      for (const it of items) {
        if (it.IsDirectory) continue; // skip subfolders; recurse later if you want
        const relPath = `${root.path}/${it.ObjectName}`;
        const typeGuess = extsToMime(it.ObjectName);
        results.push({
          id: `${relPath}`,                         // unique enough
          url: toCDNUrl(`${relPath}`),              // CDN-delivered URL
          type: it.ContentType?.startsWith("image") || typeGuess === "image"
                  ? "image"
                  : (it.ContentType?.startsWith("video") || typeGuess === "video"
                      ? "video" : "other"),
          name: it.ObjectName,
          size: it.Length,
          lastChanged: it.LastChanged,
        });
      }
    }

    // sort newest first (optional)
    results.sort((a, b) => (b.lastChanged || "").localeCompare(a.lastChanged || ""));
    res.status(200).json(results);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message || "List failed" });
  }
}
