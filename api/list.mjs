// api/list.mjs
import { verifyAuth } from "./_firebaseAdmin.mjs";

// Helper to call Bunny Storage directory listing
async function listBunnyDir(prefix) {
  // prefix example: "public/" or "id@gmail.com/"
  const base = `https://${process.env.BUNNY_STORAGE_HOST}/${process.env.BUNNY_STORAGE_ZONE}`;
  const url = `${base}/${encodeURI(prefix)}`; // Bunny lists when you GET a directory path
  const r = await fetch(url, {
    method: "GET",
    headers: { AccessKey: process.env.BUNNY_STORAGE_ACCESS_KEY },
  });

  // Bunny returns JSON for directories; if host/zone/path is wrong you'll get HTML or 404
  const text = await r.text();
  if (!r.ok) throw new Error(`Bunny list failed ${r.status}: ${text.slice(0,200)}`);

  // Try JSON parse; if it fails, show first chars to help debug
  let arr;
  try { arr = JSON.parse(text); }
  catch { throw new Error("Unexpected directory listing response from Bunny. Check host/zone/path."); }

  // Keep files only (skip subfolders)
  const files = arr.filter(item => !item.IsDirectory);
  // Map to CDN URLs
  return files.map(f => ({
    name: f.ObjectName || f.Name || f.Key,
    size: f.Length || f.Size || 0,
    lastChanged: f.LastChanged || null,
    url: `https://${process.env.BUNNY_CDN_HOST}/${prefix}${encodeURIComponent(f.ObjectName || f.Name || f.Key)}`
  }));
}

export default async function handler(req, res) {
  try {
    const folder = (req.query.folder || "").toString();

    if (folder === "public") {
      const items = await listBunnyDir("public/");
      return res.status(200).json(items);
    }

    if (folder === "me") {
      const decoded = await verifyAuth(req); // requires Authorization: Bearer <idToken>
      const email = decoded.email;
      if (!email) return res.status(401).send("Missing user email");
      const items = await listBunnyDir(`${email}/`);
      return res.status(200).json(items);
    }

    return res.status(400).send("folder must be 'public' or 'me'");
  } catch (e) {
    console.error("LIST ERROR:", e);
    return res.status(500).send(String(e));
  }
}
