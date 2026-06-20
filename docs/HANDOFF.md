# HANDOFF — mondial2026-family-pool (2026-06-10, סוף יום)

## מצב: V1 פרוס ועובד. LIVE MATCHES LOCAL. מצב מוצר: הקפאה — באגים בלבד.

## 🐵 קוף — משתתף וירטואלי (APPLIED 2026-06-10 22:08Z, KEEP, MODE A)
- **מהות:** פיצ'ר מוצר גלוי (בדיחה משפחתית), לא נתון בדיקה. משתתף אמיתי לכל דבר: מונים, רשימות, דירוג, ייצוא. אפס שינוי אפליקציה — נתונים בלבד.
- **זהות אחת:** `virtual_kof` · displayName `🐵 קוף` · `virtual:true` · approved · לא מנהל. מסמכים: `participants/CUP2026__virtual_kof` (+`private/cred`), `directory/...`, `predicted_flags/...`, 104× `predictions/CUP2026__M0XX__virtual_kof`.
- **ניחושים:** נוצרו פעם אחת (22:08Z, לפני כל שריקה): home 47 / away 41 / draw 16, אפס תיקו בנוקאאוט, כולם עם תוצאה משוערת. generate-once הוכח ב-LIVE (הרצה חוזרת = 108 SKIP).
- **אבטחה:** sentinel hash (אין preimage) + mustReset=false ⇒ login/בחירת-סיסמה חסומים. נשען רק על: hash קיים, mustReset=false, אין reset ציבורי, directory rules.
- **סקריפט:** `scripts/seed_kof_virtual_player.py` (dry-run offline; `--apply` עם טוקן בעלים; `--recover-cred` משחזר cred בלבד, אידמפוטנטי, לא נוגע בניחושים).
- **כללי תפעול (חשוב):**
  1. לא ללחוץ "🔑 אפס סיסמה" על הקוף (פותח ענף השתלטות); אופס בטעות → `--recover-cred --apply`.
  2. לא ללחוץ "הסר" על הקוף — מוחק רק את ה-participant ומשאיר רוח רפאים (מונים/ייצוא/דירוג ממשיכים; predictions בלתי-מחיקים מהלקוח). rollback מלא = ניקוי owner-REST של 108+ מסמכים.
  3. בקשת הצטרפות בשם "קוף" — לדחות (לא דורסת את virtual_kof, אבל יוצרת מתחזה).
- **השפעה:** מתחרה שווה על המקום הראשון (3/4/3, כיסוי מלא 104). אין במערכת ממוצעים/אחוזי הצלחה. מונים: נרשמו 9 · ניחשו 2.
- **מגבלה קוסמטית מקובלת:** מסכי fallback שגוזרים שם מ-docId יציגו `virtual_kof` (ב-HOTFIX המקומי שטרם נפרס).

- **LIVE:** https://mondial2026-family-pool.web.app/?t=CUP2026 (hosting פרוס 18:24Z, rules פרוסים, seed מלא)
- **נתיב:** /Users/admin/projects/mondial2026-family-pool · repo עצמאי (אין remote, commit אחרון ישן — כל ה-V1 בעץ העבודה, **לא בוצע commit**)
- **בידוד:** אסור V13/Astro_X/preview-tools שלהם. כללי עבודה: AGENTS.md.

## מה חי (הוכח ב-smoke על LIVE)
1. כניסה ללא קוד: שם → pending → אישור מנהל → בחירת סיסמה → כניסה; חוזרת: שם+סיסמה; איפוס ע"י מנהל.
2. מנהלים (סיסמה, לא שם): אלעד (סיסמה אמיתית קבועה!), דוד דין (טרם נכנס — זמנית Dinush!@#), דוד יוני (טרם — בלי זמנית: נכנס דרך "בחרו סיסמה חדשה").
3. לוח אמיתי: 104 משחקים, kickoffAt UTC, עברית+דגלים; עץ עם בתים אמיתיים.
4. ניחושים: 1X2 חובה / "מי עולה" בנוקאאוט; תוצאה משוערת אופציונלית (לא לניקוד). נשמר/משוחזר ב-LIVE.
5. נעילת kickoff: UI + rules (אי-אפשר לעקוף; הוכח עם שעון מזויף + דחיית שרת).
6. תוצאות+ניקוד: ⚙️ ניהול → הזנה → חישוב (scoring-config.js: HOME=3 DRAW=4 AWAY=3) → טבלה בבית. דטרמיניסטי.
7. בית: נרשמו/ניחשו/עוד-לא + מי-בפנים (👑/🟢/⏳) + טבלת ניקוד.
8. ייצוא CSV/JSON בניהול.

## ארכיטקטורה (נעולה)
Firestore בלבד (בלי Firebase Auth מעבר ל-anonymous). collections: tournaments, directory (שם→מזהה), participants(+private/cred — לא קריא ללקוח), device_links, join_requests, matches, predictions, scores, predicted_flags. אימות: verify-by-write (via:"login"/"set"). nameKey מנורמל. סיסמאות: SHA-256 בלבד.

## בשרת עכשיו (נקי מבדיקות)
7 משתתפים אמיתיים (3 מנהלים + הילל, ישי, מיכל, רפאל) · 104 matches · 0 predictions · device_links אמיתיים בלבד (אלעד, מיכל).

## ידוע / לתשומת לב
- hash-ים של סיסמאות זמניות מוטמעים בקוד לקוח (bootstrap) — מתים אחרי כניסה ראשונה; SHA-256 לא-ממולח (סביר למשפחה).
- חשיפת ניחושי-אחרים אחרי kickoff מותרת ב-rules; אין עדיין UI לזה.
- עץ: תוויות שלבים עמוקים = זיווג סדרתי (placeholder); אין קידום אוטומטי של מנצחות בעץ.
- כלי תפעול: owner-REST דרך token של firebase CLI (תבנית בסקריפטים בהיסטוריה); scripts/seed_cup2026.md.
- git: לבצע commit ראשוני של V1 כשיאושר.

## תפעול שוטף (מנהלים)
תוצאה: ⚙️ ניהול → בחר משחק → ציון (+מי עלתה בתיקו-נוקאאוט) → "שמור תוצאה וחשב ניקוד". גיבוי: כפתורי CSV/JSON.
