# Accessibility statement · הצהרת נגישות

The same statement is in the app, in all 7 languages: the **Accessibility** button at the bottom of the window.

## English

CapeWatch is made to be usable by everyone, including people with disabilities. It aims to meet level AA of the Web
Content Accessibility Guidelines (WCAG 2.1), on which the Israeli standard IS 5568 is based.

**What CapeWatch does**

- Everything works with the keyboard alone, with a clearly visible focus.
- Buttons, pictures and windows have names for screen readers, and the results of a lookup are read out.
- Text and colours have enough contrast (at least 4.5:1 for small text) in both the light and the dark theme.
- Ctrl and + or − makes everything bigger or smaller; Ctrl+0 resets it.
- With animation effects turned off in Windows, nothing moves.
- Seven languages; Hebrew reads right to left, and nothing moves when the language changes.

**How it was checked**

Automatic checks with axe-core 4.14 (WCAG 2.0, 2.1 and 2.2, levels A and AA) of the page and of every window
(a cape's details, Settings with the "Delete my data" question, "Choose capes", this statement), in English and
Hebrew, in the light and the dark theme, in a narrow (400 px) and a wide (1200 px) window; tests that use only the
keyboard; and checks that no text is cut off in any of the 7 languages. They run with every change
(`tests/browser/a11y.test.mjs`, `tests/browser/owned.test.mjs`, `tests/browser/display.test.mjs`).

**Known limits**

- The 3D figure turns only with the mouse; the same capes are on the page as pictures and names.
- Cape pictures are drawn from the game's textures and have no text of their own: each cape's name is written next
  to its picture.

**Accessibility contact**

Kayoiz, the developer of CapeWatch: kayoiz.dev@gmail.com. Tell me what you were doing and what went wrong, and I
will answer and fix it as soon as I can.

Statement updated: October 2026.

## עברית

CapeWatch נבנתה כדי שכל אחד יוכל להשתמש בה, כולל אנשים עם מוגבלות. היא שואפת לעמוד ברמה AA של הנחיות הנגישות
לתוכן אינטרנט (WCAG 2.1), שעליהן מבוסס התקן הישראלי ת"י 5568.

**מה CapeWatch עושה**

- הכל עובד גם במקלדת בלבד, עם סימון פוקוס ברור.
- לכפתורים, לתמונות ולחלונות יש שמות לקוראי מסך, ותוצאות החיפוש מוקראות.
- לטקסט ולצבעים יש ניגודיות מספקת (לפחות 4.5:1 לטקסט קטן) גם בערכה הבהירה וגם בכהה.
- ‏Ctrl עם + או − מגדיל או מקטין הכל, ו-Ctrl+0 מחזיר לגודל הרגיל.
- כשאפקטי האנימציה כבויים ב-Windows, שום דבר לא זז.
- שבע שפות; עברית נקראת מימין לשמאל, ושום דבר לא זז כשמחליפים שפה.

**איך זה נבדק**

בדיקות אוטומטיות בכלי axe-core 4.14, לפי WCAG 2.0, 2.1 ו-2.2 ברמות A ו-AA, של הדף ושל כל חלון (פרטי גלימה, הגדרות
כולל שאלת "מחיקת הנתונים שלי", "בחירת גלימות", ההצהרה הזאת), בעברית ובאנגלית, בערכה הבהירה ובכהה, בחלון צר
(400 פיקסלים) ורחב (1200 פיקסלים); בדיקות שמשתמשות במקלדת בלבד; ובדיקה שאף טקסט לא נחתך באף אחת מ-7 השפות. הבדיקות
רצות בכל שינוי.

**מגבלות ידועות**

- את הדמות התלת-ממדית מסובבים רק בעכבר; אותן גלימות מופיעות בדף גם בתמונות ובשמות.
- התמונות של הגלימות מצוירות מהטקסטורות של המשחק ואין בהן טקסט: השם של כל גלימה כתוב ליד התמונה שלה.

**פנייה בנושא נגישות**

‏Kayoiz, המפתח של CapeWatch: ‏kayoiz.dev@gmail.com. כתבו מה עשיתם ומה לא עבד, ואענה ואתקן בהקדם האפשרי.

ההצהרה עודכנה: אוקטובר 2026.
