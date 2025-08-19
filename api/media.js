// api/media.js
export default async function handler(req, res) {
  try {
    const ZONE = process.env.BUNNY_STORAGE_ZONE;
    const HOST = process.env.BUNNY_STORAGE_HOST || "storage.bunnycdn.com";
    const KEY = process.env.BUNNY_STORAGE_ACCESS_KEY;
    const CDN = process.env.BUNNY_CDN_HOST;

    if (!ZONE || !HOST || !KEY || !CDN) {
      return res.status(500).json({ ok: false, error: "Missing env vars" });
    }

    const path = "lensdance-images/public";
    const url = `https://${HOST}/${encodeURIComponent(ZONE)}/${path}/`;
    const r = await fetch(url, { headers: { AccessKey: KEY } });
    if (!r.ok) throw new Error(await r.text());
    const items = await r.json();

    const results = items
      .filter((it) => !it.IsDirectory)
      .map((it) => ({
        id: `${path}/${it.ObjectName}`,
        url: `https://${CDN}/${path}/${it.ObjectName}`,
        type: it.ContentType?.startsWith("image") ? "image" : "other",
        name: it.ObjectName,
        size: it.Length,
        lastChanged: it.LastChanged,
      }));

    res.status(200).json(results);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || "List failed" });
  }
}
