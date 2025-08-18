export default async function handler(req, res) {
  try {
    // TEMP: unauthenticated test — delete this file after verifying.
    const name = (new URL(req.url, "https://x")).searchParams.get("name") || "hello";
    const path = `test/${Date.now()}-${name}.txt`;
    const body = new TextEncoder().encode("hello from vercel");

    const url = `https://${process.env.BUNNY_STORAGE_HOST}/${process.env.BUNNY_STORAGE_ZONE}/${path}`;
    const r = await fetch(url, {
      method: "PUT",
      headers: {
        AccessKey: process.env.BUNNY_STORAGE_ACCESS_KEY,
        "Content-Type": "text/plain",
      },
      body,
    });

    const text = await r.text();
    if (!r.ok) throw new Error(`Bunny PUT failed ${r.status}: ${text}`);

    const publicUrl = `https://${process.env.BUNNY_CDN_HOST}/${path}`;
    res.status(200).json({ ok: true, path, cdn: publicUrl });
  } catch (e) {
    console.error("BUNNY TEST ERROR:", e);
    res.status(500).send(String(e));
  }
}
