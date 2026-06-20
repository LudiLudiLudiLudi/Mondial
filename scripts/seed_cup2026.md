# Seed מינימלי — CUP2026 (להרצה ידנית ע"י בעל המערכת בלבד)

> לא מורץ אוטומטית. דורש הרשאות בעלים (Console או service-account).
> בלי משתתפים — רק הטורניר ושני המנהלים.

## מסמכים ליצירה (בדיוק אלה)

```jsonc
// tournaments/CUP2026
{ "code": "CUP2026", "name": "מונדיאל 2026", "createdAt": <serverTimestamp> }

// participants/CUP2026__אלעד
{ "tournamentCode": "CUP2026", "displayName": "אלעד", "nameKey": "אלעד",
  "isAdmin": true, "status": "approved", "joinedAt": <serverTimestamp>, "uids": [] }

// participants/CUP2026__אלעד/private/cred
{ "passwordHash": null, "mustReset": false, "lastLoginAt": null, "uids": [] }

// directory/CUP2026__אלעד
{ "participantId": "CUP2026__אלעד", "tournamentCode": "CUP2026" }

// participants/CUP2026__דוד דין
{ "tournamentCode": "CUP2026", "displayName": "דוד דין", "nameKey": "דוד דין",
  "isAdmin": true, "status": "approved", "joinedAt": <serverTimestamp>, "uids": [] }

// participants/CUP2026__דוד דין/private/cred
{ "passwordHash": null, "mustReset": false, "lastLoginAt": null, "uids": [] }

// directory/CUP2026__דוד דין
{ "participantId": "CUP2026__דוד דין", "tournamentCode": "CUP2026" }
```

## למה `passwordHash: null`
כניסה ראשונה של מנהל: סיסמה זמנית (bootstrap בקוד הלקוח) → ה-rules מתירים
set-password רק כש-`passwordHash == null` → המנהל בוחר סיסמה חדשה → מכאן והלאה
רק הסיסמה החדשה תקפה. הזמנית לא נשמרת בשרת לעולם.

## סדר הרצה לפני בדיקה חיה
1. deploy של `firestore.rules` (באישור מפורש בלבד).
2. יצירת 7 המסמכים לעיל (Console → Firestore, או סקריפט admin).
3. בדיקת מסלול מנהל ראשון מ-2 מכשירים.
