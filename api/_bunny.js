import fetch from "node-fetch";

export async function putFile(path, buffer, contentType) {
  const url = `https://${process.env.BUNNY_STORAGE_HOST}/${process.env.BUNNY_STORAGE_ZONE}/${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      AccessKey: process.env.BUNNY_STORAGE_ACCESS_KEY,
      "Content-Type": contentType,
    },
    body: buffer,
  });
  if (!res.ok) throw new Error(`Bunny upload failed: ${res.status}`);
  return `https://${process.env.BUNNY_CDN_HOST}/${path}`;
}
