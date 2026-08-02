# חיבור פיד אינסטגרם אמיתי (lens.dance)

> **סטטוס: מושבת** (יולי 2026, לבקשת הלקוחה).
> הפיצ'ר בנוי במלואו אבל לא מוצג באתר. להפעלה מחדש:
>
> 1. ב-`src/pages/HomePage.jsx` — לבטל את ההערה מה-`import` ומ-`<InstagramFeed />`.
> 2. ב-`vercel.json` — להחזיר את בלוק ה-`crons`:
>    ```json
>    "crons": [{ "path": "/api/instagram-refresh", "schedule": "0 4 * * *" }]
>    ```
> 3. לבצע את השלבים למטה.

הקוד באתר כבר מוכן. חסר רק **טוקן אחד** — אחריו הכל מתחדש לבד לנצח.

## שלב 0 — תנאי מקדים

חשבון `lens.dance` חייב להיות **Business** או **Creator** (לא Personal).
באפליקציית אינסטגרם: `Settings → Account type and tools → Switch to professional account`.

## שלב 1 — אפליקציה ב-Meta

1. להיכנס ל-https://developers.facebook.com/ ולהתחבר עם פייסבוק.
2. `My Apps → Create App`.
3. Use case: **Other** → App type: **Business** → לתת שם (למשל `LensDance Site`).
4. בדשבורד: `Add products → Instagram → Set up`.
5. בתוך Instagram לבחור **API setup with Instagram login**.

## שלב 2 — הרשאות והפקת טוקן

1. בסעיף *2. Generate access tokens* → `Add account` → להתחבר עם `lens.dance` ולאשר.
2. לוודא שההרשאות `instagram_business_basic` מסומנות.
3. ללחוץ `Generate token` → להעתיק את הטוקן (מחרוזת ארוכה, מתחילה ב-`IG...`).

זהו טוקן long-lived לתוקף 60 יום. אין צורך להאריך ידנית — הקוד מטפל בזה.

## שלב 3 — להזין ב-Vercel

בפרויקט ב-Vercel → `Settings → Environment Variables`, להוסיף:

| Name | Value | Environments |
|---|---|---|
| `INSTAGRAM_ACCESS_TOKEN` | הטוקן משלב 2 | Production, Preview, Development |
| `CRON_SECRET` | מחרוזת אקראית כלשהי (למשל מ-`openssl rand -hex 24`) | Production |

ואז **Redeploy**.

## מה קורה מכאן

- `api/instagram.js` מושך את 8 הפוסטים האחרונים דרך Instagram Graph API.
- בקריאה הראשונה הטוקן נשמר ב-Firestore בקולקציה `secrets/instagram`
  (חסומה לחלוטין ללקוחות ב-`firestore.rules` — נגישה רק ל-Admin SDK בשרת).
- Cron יומי ב-04:00 (`vercel.json`) קורא ל-`/api/instagram-refresh` ומחליף
  את הטוקן בטוקן חדש ל-60 יום. הטוקן לעולם לא פג.
- התשובה נשמרת ב-CDN של Vercel לשעה, כך שאינסטגרם נקרא ~פעם בשעה בלבד.
- אם הכל נופל — האתר חוזר לתמונות הגיבוי המקומיות ולא נשבר.

## בדיקה ידנית

```bash
curl https://<הדומיין>/api/instagram | head -c 500
curl -H "Authorization: Bearer $CRON_SECRET" https://<הדומיין>/api/instagram-refresh
```

הראשון צריך להחזיר `permalink` אמיתיים של `instagram.com/p/...`.
השני צריך להחזיר `{"ok":true,...,"daysLeft":60}`.
