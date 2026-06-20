# MONDIAL2026 FAMILY POOL — חוזה RELEASE V1 (עודכן 2026-06-10)

LIVE: https://mondial2026-family-pool.web.app/?t=CUP2026
סטטוסים: **LIVE** (פרוס + הוכחת smoke) · **IMPLEMENTED_NOT_DEPLOYED** (קוד קיים, לא פרוס) · **PLANNED** (טרם מומש)
כלל: אסור לסמן LIVE בלי הוכחת smoke.

| # | סעיף | סטטוס | הוכחה |
|---|------|-------|-------|
| 1 | כניסה ללא קוד, קישור ?t=CUP2026 | **LIVE** | smoke 2026-06-10 (5/5) |
| 2 | זרימת משתתף: שם→pending→אישור→סיסמה→כניסה; חוזרת; איפוס | **LIVE** | E2E 10/10 + smoke |
| 3 | מנהלים: זמנית→אישית; לא לפי שם; bootstrap רק כשוודאי שאין רשומה | **LIVE** | E2E שלבים 1–4,10 |
| 4 | ארכיטקטורת Firestore (directory/cred/device_links) + verify-by-write | **LIVE** | rules פרוסים + E2E |
| 5 | ניווט נעול + מובייל אייקונים + פס סטטוס אנושי | **LIVE** | smoke + צילומים |
| 6 | לוח משחקים אמיתי + kickoffAt + עץ עם בתים אמיתיים | **IMPLEMENTED_NOT_DEPLOYED** | 104 משחקים אמיתיים (fixturedownload), עץ: 12 בתים/48 נבחרות/0 'טרם נקבע' — בדיקת שלב 1 |
| 7 | מודל ניחושים: 1X2 חובה / מי-עולה; תוצאה משוערת אופציונלית | **IMPLEMENTED_NOT_DEPLOYED** | שמירה/טעינה/עריכה מול backend חי — בדיקת שלב 2 |
| 8 | נעילת kickoffAt (UI + rules) | **IMPLEMENTED_NOT_DEPLOYED** (rules כבר פרוסים!) | שרת דחה כתיבה אחרי kickoff, אישר לפני; UI נעול בשעון מזויף — שלב 3 |
| 9 | תוצאות אמת → ניקוד אוטומטי → טבלה (קונפיג 3/4/3) | **IMPLEMENTED_NOT_DEPLOYED** | תוצאה 0:2 → 3 נק' לבחירת away; חישוב כפול עקבי; טבלה בבית — שלב 4 |
| 10 | לכידות בבית (נרשמו/ניחשו/לא ניחשו) | **IMPLEMENTED_NOT_DEPLOYED** | מונים אמיתיים (8 נרשמו) + טבלת ניקוד — שלב 5 |
| 11 | ייצוא CSV + JSON בניהול | **IMPLEMENTED_NOT_DEPLOYED** | CSV עם כל העמודות + JSON מלא — שלב 6 |

חוק מוצר לאחר סגירת V1: אין פיצ'רים — רק באגים, יציבות, נתונים.
