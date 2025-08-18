// api/list.mjs
import { verifyAuth } from "./_firebaseAdmin.mjs";

/** Ensure dir prefix ends with a single trailing slash */
function norm(prefix) {
  if (!prefix) return "";
  return prefix.endsWith("/") ? prefix : prefix + "/";
}

/** Parse Bunny directory listing in a tolerant way */
function parseListing(text) {
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }

  if (!data) throw new Error("Bunny listing was not JSON. Check STORAGE host/zone and that path is a directory.");

  // Bunny usually returns an array of objects with IsDirectory/ObjectName
  if (Array.isArray(data)) return data;

  // Some responses are wrapped, e.g. { Items: [...] }
  if (Array.isArray(data.Items)) return data.Items;

  // Or lowercase keys
  if (Array.isArray(data.items)) return data.items;

  throw new Error("Unexpected Bunny listing shape.");
}

/** List a Bunny Storage directory and map to CDN URLs */
async function listBunnyDir(prefix) {
  const dir = norm(prefix);
  const base = `https://${process.env.BUNNY_STORAGE_HOST}/${process.env.BUNNY_STORAGE_ZONE}`;
  const url = `${base}/${encodeURI(dir)}`; // GET a folder path to list

  const r = await fetch(url, {
    method: "GET",
    headers: { AccessKey: process.env.BUNNY_STORAGE_ACCESS_KEY },
  });

  const text = await r.text();
  if (!r.ok) throw new Error(`Bunny list failed ${r.status}: ${text.slice(0,200)}`);

  const items = parseListing(text);

  return items
    .filter(x => !x.IsDirectory) // keep files only
    .map(x => {
      const name = x.ObjectName || x.Name || x.Key || x.FileName;
      const lastChanged = x.LastChanged || x.LastModified || null;
      return {
        name,
        lastChanged,
        url: `https://${process.env.BUNNY_CDN_HOST}/${dir}${encodeURIComponent(name)}`
      };
    });
}

export default async function handler(req, res) {
  try {
    const folder = String(req.query.folder || "");

    if (folder === "public") {
      const items = await listBunnyDir("public/");
      return res.status(200).json(items);
    }

    if (folder === "me") {
      const user = await verifyAuth(req); // needs Authorization: Bearer <idToken>
      const email = user.email;           // folder name equals email (create this in Bunny)
      const items = await listBunnyDir(`${email}/`);
      return res.status(200).json(items);
    }

    // Optional: list root if you pass folder=root
    if (folder === "root") {
      const items = await listBunnyDir("");
      return res.status(200).json(items);
    }

    return res.status(400).send("folder must be 'public', 'me', or 'root'");
  } catch (e) {
    console.error("LIST ERROR:", e);
    res.status(500).send(String(e));
  }
}
