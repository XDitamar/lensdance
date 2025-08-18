// Uses global fetch (Node 18/20 on Vercel)
export async function putFile(path, buffer, contentType) {
  const url = `https://${process.env.BUNNY_STORAGE_HOST}/${process.env.BUNNY_STORAGE_ZONE}/${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      AccessKey: process.env.BUNNY_STORAGE_ACCESS_KEY,
      "Content-Type": contentType || "application/octet-stream",
    },
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bunny PUT failed ${res.status}: ${text}`);
  }
  return `https://${process.env.BUNNY_CDN_HOST}/${path}`;
}

export async function deleteFile(path) {
  const url = `https://${process.env.BUNNY_STORAGE_HOST}/${process.env.BUNNY_STORAGE_ZONE}/${path}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { AccessKey: process.env.BUNNY_STORAGE_ACCESS_KEY },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Bunny DELETE failed ${res.status}: ${text}`);
  }
}
