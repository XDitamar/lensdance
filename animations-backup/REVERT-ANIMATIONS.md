# ביטול אנימציות — הוראות שחזור

נוצר: 13.7.2026. כל אנימציה יושבת בבלוק CSS מסומן (`ANIM-X START` עד `ANIM-X END`) ואפשר לבטל אותה בנפרד. אפשר גם פשוט להגיד ל-Claude: "תבטל את אנימציה 3" או "תחזיר הכל לקוד הקודם".

## ביטול מלא של הכל

1. החזר את `src/pages/HomePage.jsx` מהגיבוי: העתק את `animations-backup/HomePage.jsx.original` על `src/pages/HomePage.jsx`
2. מחק מ-`src/pages/homepage.css` את כל הבלוקים מ-`ANIM-1 START` עד `ANIM-5 END` (בסוף הקובץ)
3. מחק מ-`src/style.css` את הבלוק `ANIM-6 START` עד `ANIM-6 END` (בסוף הקובץ)

## ביטול פרטני

| # | אנימציה | מה למחוק |
|---|---------|-----------|
| 1 | חשיפה בגלילה | בלוק ANIM-1 ב-homepage.css + ה-useEffect המסומן ANIM-1 ב-HomePage.jsx + כל `reveal` מה-className-ים (כולל transitionDelay) |
| 2 | כניסת כותרת | בלוק ANIM-2 ב-homepage.css בלבד |
| 3 | זום + כיתוב בתמונות | בלוק ANIM-3 ב-homepage.css + שלושת ה-`<span className="featured-caption">` ב-HomePage.jsx |
| 4 | ברק בכפתורים | בלוק ANIM-4 ב-homepage.css בלבד |
| 5 | ציור המפרידים | בלוק ANIM-5 ב-homepage.css + `reveal` משני המפרידים המסומנים ANIM-5 ב-HomePage.jsx |
| 6 | קו תחתון בתפריט | בלוק ANIM-6 ב-style.css בלבד |

הערה: אנימציות 1 ו-5 חולקות את מנגנון ה-reveal. אם מבטלים את שתיהן — למחוק גם את ה-useEffect.
