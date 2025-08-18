// api/list.mjs
import { verifyAuth } from "./_firebaseAdmin.mjs";

/**
 * List contents of a Bunny Storage directory
 */
async function listBunnyDir(prefix) {
  const base = `https://${process.env.BUNNY_STORAGE_HOST}/${process.env.BUNNY_STORAGE_ZONE}`;
  const url = `${base}/${encodeURI(prefix)}`; // must end with slash for dirs

  const r = await fetch(url, {
    method: "GET",
    headers: { AccessKey: process.env.BUNNY_STORAGE_ACCESS_KEY },
  });
  const text = await r.text();

  if (!r.ok) {
    throw new Error(`Bunny list failed ${r.status}: ${text.slice(0, 200)}`);
  }

  let arr;
  try {
    arr = JSON.parse(text);
  } catch {
    throw new Error(
      "Unexpected Bunny listing response. Check your STORAGE_HOST/ZONE and make sure you request a folder (with trailing slash)."
    );
  }

  return arr
    .filter((x) => !x.IsDirectory)
    .map((x) => {
      const name = x.ObjectName || x.Name || x.Key;
      return {
        name,
        url: `https://${process.env.BUNNY_CDN_HOST}/${prefix}${encodeURIComponent(
          name
        )}`,
      };
    });
}

export default async function handler(req, res) {
  try {
    const folder = String(req.query.folder || "");

    // Public gallery
    if (folder === "public") {
      const items = await listBunnyDir("public/"); // files live in StorageZone/public/
      return res.status(200).json(items);
    }

    // User's private gallery
    if (folder === "me") {
      const user = await verifyAuth(req);
      const safeEmail = user.email; // we assume you create folder in Bunny with exact email
      const items = await listBunnyDir(`${safeEmail}/`);
      return res.status(200).json(items);
    }

    return res.status(400).send("folder must be 'public' or 'me'");
  } catch (e) {
    console.error("LIST ERROR:", e);
    return res.status(500).send(String(e));
  }
}
