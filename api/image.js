// api/image.js
// פונקציית Serverless של Vercel שעושה:
// מקבלת ?url=<downloadURL>&w=<width>&q=<quality>
// מורידה את התמונה, מצמצמת עם sharp, ומחזירה למשתמש.

// אין צורך ב-import ל-fetch – ב-Node 18+ הוא גלובלי.

import sharp from "sharp";

export default async function handler(req, res) {
  try {
    const { url, w, q } = req.query;

    if (!url) {
      res.status(400).json({ error: "Missing url query param" });
      return;
    }

    const width = parseInt(w, 10) || 1280;  // למשל 1280px
    const quality = parseInt(q, 10) || 70;  // איכות 70%

    // מטמון חזק – שנה קדימה (לפני הפעולה, כדי שהדפדפן ידע מיד)
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Type", "image/jpeg");

    // מורידים את התמונה המקורית (4K) מה-Download URL של Firebase
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

    // משתמשים ב-sharp כדי להקטין ולשמור איכות סבירה
    const outputBuffer = await sharp(buffer)
      .resize({
        width,
        withoutEnlargement: true, // לא להגדיל תמונות קטנות
        fastShrinkOnLoad: true,   // מהיר יותר בהקטנה
      })
      .jpeg({
        quality,
        mozjpeg: true,
        progressive: true,        // JPEG פרוגרסיבי – נראה מהר יותר בדפדפן
      })
      .toBuffer();

    res.status(200).send(outputBuffer);
  } catch (err) {
    console.error("Error in /api/image:", err);
    res.status(500).json({ error: "Failed to process image" });
  }
}
