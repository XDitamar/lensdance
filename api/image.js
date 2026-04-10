// api/image.js
// פונקציית Serverless של Vercel שעושה:
// מקבלת ?url=<downloadURL>&w=<width>&q=<quality>
// מורידה את התמונה, מצמצמת עם sharp, ומחזירה WebP קטן ומהיר.

import sharp from "sharp";

export default async function handler(req, res) {
  try {
    const { url, w, q } = req.query;

    if (!url) {
      res.status(400).json({ error: "Missing url query param" });
      return;
    }

    const width = parseInt(w, 10) || 900;   // 900px מספיק לגריד
    const quality = parseInt(q, 10) || 75;  // איכות 75% WebP

    // CDN cache חזק – שבוע ב-Vercel Edge + stale-while-revalidate
    res.setHeader("Cache-Control", "public, s-maxage=604800, stale-while-revalidate=86400, max-age=86400");
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Vary", "Accept");

    // מורידים את התמונה המקורית מ-Firebase
    const response = await fetch(url, {
      headers: { "Accept": "image/*" },
    });
    if (!response.ok) {
      console.error("Failed to fetch original image:", response.status);
      res.status(502).json({ error: "Failed to fetch original image" });
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // WebP – קטן ב-30% מ-JPEG, נטען מהר יותר
    const outputBuffer = await sharp(buffer)
      .resize({
        width,
        withoutEnlargement: true,
        fastShrinkOnLoad: true,
      })
      .webp({
        quality,
        effort: 2,        // מהיר יותר (0=מהיר, 6=איטי)
        smartSubsample: true,
      })
      .toBuffer();

    res.status(200).send(outputBuffer);
  } catch (err) {
    console.error("Error in /api/image:", err);
    res.status(500).json({ error: "Failed to process image" });
  }
}
