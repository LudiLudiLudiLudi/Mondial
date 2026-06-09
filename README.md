# מונדיאל 2026 — הטורניר המשפחתי

אפליקציית ניחושים משפחתית למונדיאל 2026. עברית מלאה, RTL, מובייל ראשון.
**Firebase Hosting + Firestore בלבד** — בלי שרת, בלי build.

## מטרה
לינק אחד → המשפחה נכנסת → מנחשים → המנהל מעדכן תוצאה → רואים טבלה.

## מבנה
```
public/
├── index.html   # מסך כניסה
├── app.js        # לוגיקת לקוח
└── style.css     # עיצוב
firebase.json     # הגדרות Hosting
.firebaserc       # פרויקט: mondial2026-family-pool
```

## הרצה מקומית
פותחים את `public/index.html` בדפדפן (או `firebase serve`).

## פריסה (בהמשך)
```bash
firebase deploy
```
