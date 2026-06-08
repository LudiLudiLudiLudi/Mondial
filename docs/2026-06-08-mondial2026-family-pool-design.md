# Mondial 2026 — Family Pool · מסמך עיצוב

**תאריך:** 2026-06-08
**סטטוס:** עיצוב מאושר (טרם יישום)
**מיקום:** `/Users/admin/projects/mondial2026-family-pool` (פרויקט עצמאי, ללא תלות ב-V13/Astro_X)

---

## 1. מטרה

בריכת ניחושים משפחתית למונדיאל 2026. עץ המשחקים והלו"ז **קבועים מראש** בקובץ JSON.
המשתתפים מזינים תחזיות; המנהל מעדכן תוצאות אמת; הניקוד מתעדכן אוטומטית.

**עקרון מנחה (מבחן הילד בן 12 / מבחן הסבתא):** אם אי אפשר להסביר שכבה למשפחה — היא מיותרת.
סבתא שנכנסת לקישור בוואטסאפ צריכה להגיע לניחוש הראשון תוך פחות מדקה: מסך אחד (שם + קוד) → ישר לניחושים.

## 2. מחסנית טכנולוגית ואילוצים

- **Backend:** Python + Flask + SQLAlchemy + SQLite (מוכן למעבר Postgres ללא שינוי לוגיקה).
- **Frontend:** עברית מלאה, RTL, מוגש מ-Flask (`templates/` + `static/`).
- **תפעול:** Docker עצמאי, `.venv` נפרד, `git init` חדש, README עצמאי, ניתן להעברה למחשב אחר.
- **אילוץ קוד:** **אין נתיבים מוחלטים בקוד** — רק `Path(__file__)` או משתני סביבה.
  `BASE_DIR = Path(__file__).resolve().parent.parent`.
- **REST API:** JSON over HTTP, מבנה מודולרי, קוד פשוט וקריא.

## 3. מבנה תיקיות

```
mondial2026-family-pool/
├── app/
│   ├── __init__.py            # Flask factory, רישום blueprints
│   ├── config.py              # env-driven; SQLite default; BASE_DIR מ-Path(__file__)
│   ├── extensions.py          # db = SQLAlchemy()
│   ├── models/                # ORM (טבלה לקובץ או מאוחד)
│   ├── services/
│   │   ├── tournament_service.py   # load_tournament / load_results / save_results / promote
│   │   ├── scoring_service.py      # score_prediction / recompute_all
│   │   └── leaderboard_service.py  # standings כלליות + standings לבתים
│   ├── api/                   # blueprints: auth, predictions, admin, leaderboard, tournament
│   └── web/
│       ├── templates/         # RTL Hebrew
│       └── static/
├── data/
│   ├── mondial2026.json       # מבנה הטורניר הקבוע (בתים, 104 משחקים, עץ נוקאאוט)
│   ├── scoring_presets.json   # presets ניקוד
│   └── demo_users.json        # משתמשי דמו לפיתוח
├── tests/
├── scripts/                   # init_db.py, load_tournament.py, recompute_scores.py
├── docker/                    # Dockerfile, docker-compose.yml
├── docs/
├── README.md
└── .gitignore
```

**הוסר במכוון (YAGNI):** `data_provider/` abstraction, provider interface, `Team` table, refresh logic.
תוצאות אמת נשמרות ב-SQLite; שמות נבחרות מגיעים מה-JSON.

## 4. מודל הנתונים

8 טבלאות (SQLAlchemy):

### Tournament
`id`, `name`, `invite_code` (משפחתי, להצטרפות), `admin_join_code` (מעניק הרשאת מנהל),
`active_config_id` (FK → ScoringConfig), `created_at`.

### User
זהות גלובלית. `id`, `display_name`, `created_at`. **ללא** role, **ללא** join_code.

### TournamentUser
חברות אדם-בטורניר. `id`, `tournament_id`, `user_id`, `role` (`admin`/`participant`/`child`),
`join_code` (קוד אישי **לטורניר**, אקראי קצר — לכניסה ממכשיר נוסף), `joined_at`.

### Group
`id`, `tournament_id`, `code` (A–L), `teams_json` (רשימת שמות נבחרות; לא מנורמל בכוונה — קטן).

### Match
`id` (מזהה מה-JSON, למשל `M01`), `tournament_id`, `stage`
(`group`/`r32`/`r16`/`qf`/`sf`/`third`/`final`), `group_code` (nullable),
`scheduled_utc` (= זמן נעילת ניחוש), `home_name`, `away_name` (slot labels בנוקאאוט עד מילוי),
`home_score`, `away_score` (nullable), `status` (`scheduled`/`finished`),
`advancing_side` (nullable: `home`/`away` — מי עלתה שלב), `advance_method` (nullable: `normal`/`extra_time`/`penalties`),
`next_match_id` (nullable), `next_slot` (nullable: `home`/`away`).

### Prediction
`id`, `user_id`, `match_id`, `pred_home`, `pred_away`,
`pred_advancing_side` (nullable: `home`/`away` — נוקאאוט בלבד),
`updated_at`, `locked_at`, `score_awarded`, `scored_at`, `config_id_used` (FK → ScoringConfig).
ייחודי לכל `(user_id, match_id)`. **אין שורה = אין ניחוש = 0 נק'.**

### ScoringConfig
`id`, `tournament_id`, `name`, `effective_from` (timestamp — לאי-רטרואקטיביות), `params` (JSON).
**ללא** `is_active` (המקור היחיד לאמת הוא `Tournament.active_config_id`).

### ScoringRun
audit לחישוב-מחדש. `id`, `tournament_id`, `config_id`, `started_at`, `finished_at`, `matches_affected`.

## 5. מבנה ה-JSON של הטורניר (`data/mondial2026.json`)

```jsonc
{
  "name": "מונדיאל 2026",
  "groups": [
    { "code": "A", "teams": ["נבחרת 1", "נבחרת 2", "נבחרת 3", "נבחרת 4"] }
    // ... A–L (12 בתים × 4)
  ],
  "matches": [
    { "id": "M01", "stage": "group", "group": "A",
      "home": "נבחרת 1", "away": "נבחרת 2",
      "scheduled_utc": "2026-06-11T19:00:00Z",
      "next_match_id": null, "next_slot": null },
    // ... שלב הבתים (72 משחקים)
    { "id": "M73", "stage": "r32",
      "home": "slot:1A", "away": "slot:2B",
      "scheduled_utc": "2026-06-28T19:00:00Z",
      "next_match_id": "M89", "next_slot": "home" }
    // ... r32 → r16 → qf → sf → third/final (סה"כ 104 משחקים)
  ]
}
```

**slots בנוקאאוט:** `home`/`away` מכילים תווית (`slot:1A`, `slot:2B`, או "מנצחת M73").
**קידום אוטומטי:** כשמנהל מזין תוצאת `M73`, השם של העולה נכתב ל-`Match[next_match_id]` לפי `next_slot`.
זה **לא** עץ דינמי — המבנה קבוע; רק שם הנבחרת זולג קדימה לאורך הצינור הקבוע.

**seeding שלב בתים → r32:** דירוג הבתים מחושב ב-`leaderboard_service`; slots של מקום 1/2 בכל בית (`slot:1A`, `slot:2B`) מתמלאים אוטומטית מהדירוג. שיבוץ מקומות שלישיים (`slot:3rd-…`) — לפי טבלת קומבינציות סטטית ב-JSON, באישור מנהל (מסך אחד), כי הוא תלוי באילו שלישיות העפילו.

## 6. מנוע הניקוד

**חתימה:** `scoring_service.score_prediction(prediction, result, config) → {result_points, advance_points, total}`
`result` = אובייקט קטן: `home_score`, `away_score`, `advancing_side`, `advance_method`, `is_knockout`
(המנוע לא צריך את כל אובייקט Match).

הניקוד **דינמי**, נקבע ע"י `ScoringConfig.params`. שני רכיבים נפרדים שמסתכמים:

**א. ניקוד תוצאה (כל המשחקים, לפי 90 דקות כולל פציעות):**
1. תוצאה מדויקת → `exact_result` (ברירת מחדל **3**)
2. אחרת — מנצח/תיקו נכון → `correct_winner` (ברירת מחדל **1**)
3. אחרת → 0

**ב. ניקוד עלייה (נוקאאוט בלבד, נפרד):**
- `pred_advancing_side == result.advancing_side` → `advance_bonus` (ברירת מחדל **+1**)
- אחרת → 0

**בונוסים גלובליים (בסוף הטורניר):** `champion_bonus`, `group_ranking_bonus` (ברירת מחדל 0).

**פרמטרים פעילים ב-MVP:** `exact_result`, `correct_winner`, `advance_bonus`, `champion_bonus`, `group_ranking_bonus`.
**לא ב-MVP:** `knockout_multiplier` = disabled (לעתיד) · `goal_diff`, `surprise_bonus` = **לא ממומשים** (לא בקוד).

### אימות מול דוגמאות
| ניחוש | תוצאה אמת | חישוב | סך |
|------|-----------|------|---|
| 1:1 + ספרד עולה | 1:1, פנדלים, ספרד עולה | 3 + 1 | **4** |
| 1:1 + צרפת עולה | 1:1, פנדלים, ספרד עולה | 3 + 0 | **3** |
| 2:1 לצרפת | 1:1, ספרד עולה | 0 + 0 | **0** |

### שינוי חוקים — לא רטרואקטיבי
`ScoringConfig.effective_from`: קונפיג חדש חל רק על משחקים שנפתחים **אחריו**.
`recompute_all()`: חישוב-מחדש ידני של כל הטורניר ע"י המנהל. בזמן ריצה — נעילת ניחושים + רישום `ScoringRun` (audit).
כל ניחוש שומר `score_awarded`, `scored_at`, `config_id_used` כדי שתמיד יהיה ברור למה התקבל ניקוד מסוים.

### Presets (`data/scoring_presets.json`)
משפחתי (פשוט) · ספורטיבי (מאוזן) · קשוח (מעט נקודות) · מותאם אישית.
ברירת מחדל = משפחתי: `exact_result=3, correct_winner=1, advance_bonus=1, champion_bonus=0, group_ranking_bonus=0`.

## 7. זרימת משתמשים, כניסה ותפקידים

**קודים:** `invite_code` (משפחתי, משותף) · `admin_join_code` (נפרד, מעניק מנהל) — שניהם על Tournament.

### הצטרפות משתתף (כניסה ראשונה) — סדר מחייב
1. פתיחת קישור → הזנת `invite_code` + `שם תצוגה` (מסך אחד).
2. אימות הקוד **לפני** יצירת ישויות (אין משתמשים יתומים).
3. יצירת `User` → `TournamentUser(role=participant)` → יצירת `join_code` אישי.
4. session token נשמר בדפדפן → כניסות הבאות אוטומטיות.
5. ישר למסך הניחושים. מוצג שם: "הקוד האישי שלך: XXXX — שמור כדי להיכנס ממכשיר אחר".

### כניסה ממכשיר אחר
הזנת `join_code` האישי (השמור על `TournamentUser`).

### מנהל
הזנת `admin_join_code` במקום invite → `role=admin`.

### מצב ילד (`role=child`)
זהה למשתתף בנתונים; שונה **רק ב-UI** (שפה פשוטה). למשל בנוקאאוט:
"אם המשחק מסתיים בשוויון — מי ממשיכה לשלב הבא?".

### איחור להצטרפות
- משחק שכבר נפתח → **נעול**, אי אפשר לנחש.
- משחק עתידי → פתוח לניחוש.
- משחק שעבר בלי ניחוש → 0 אוטומטי.
- בלי השלמה רטרואקטיבית.

## 8. תפקידים והרשאות

| פעולה | participant | child | admin |
|------|:-:|:-:|:-:|
| הזנת/עריכת ניחושים (עד נעילה) | ✓ | ✓ | ✓ |
| צפייה בטבלת מובילים | ✓ | ✓ | ✓ |
| עדכון תוצאות אמת | ✗ | ✗ | ✓ |
| ניהול קונפיג ניקוד / `recompute_all` | ✗ | ✗ | ✓ |
| שינוי תפקיד `participant ↔ child` | ✗ | ✗ | ✓ |

**קידום ל-admin רק דרך `admin_join_code`** — לא דרך UI (כדי שילד לא יהפוך למנהל בלחיצה בטעות).

## 9. עקרונות UX (RTL עברית)

- כל הממשק עברית מלאה, RTL.
- מסך כניסה אחד בלבד עד הניחוש הראשון (מבחן הסבתא).
- בנוקאאוט בלבד, מתחת לתוצאה: "מי תעלה שלב?" ◉ קבוצת בית / ◉ קבוצת חוץ.
- הסבר קבוע במסך:
  > "תחזית המשחק מתייחסת לתוצאה לאחר 90 דקות (כולל זמן פציעות).
  > במשחקי נוקאאוט ניתן לבחור בנפרד מי תעלה שלב במקרה של הארכה או פנדלים."
- מצב ילד: שפה פשוטה יותר לאותה פעולה.

## 10. משטח ה-REST API (ראשוני)

```
POST /api/join                 # invite_code + display_name → user + session
POST /api/login                # join_code → session
GET  /api/tournament           # מבנה + לו"ז + תוצאות
GET  /api/matches              # משחקים + סטטוס נעילה
GET  /api/predictions/me       # הניחושים שלי
PUT  /api/predictions/<match>  # הזנה/עריכה (נחסם אם נעול)
GET  /api/leaderboard          # טבלת מובילים + דירוג בתים
--- admin בלבד ---
PUT  /api/admin/results/<match>   # עדכון תוצאה (+ קידום אוטומטי)
GET/POST/PUT /api/admin/scoring   # ניהול ScoringConfig
POST /api/admin/recompute         # recompute_all + ScoringRun
PUT  /api/admin/members/<id>/role # participant ↔ child
```

## 11. בדיקות (TDD)

- `scoring_service`: יחידה — מאמת את שלוש הדוגמאות + קצוות (תיקו, אין ניחוש, נוקאאוט עם/בלי advancing).
- `tournament_service`: טעינת JSON, קידום נוקאאוט (`next_match_id`/`next_slot`), נעילה לפי `scheduled_utc`.
- `leaderboard_service`: דירוג בתים, סיכום נקודות.
- זרימת auth: סדר הצטרפות, אין יתומים, `join_code` ממכשיר אחר.
- `recompute_all`: אי-רטרואקטיביות + `ScoringRun`.

## 12. מחוץ ל-MVP (לעתיד)

`knockout_multiplier`, `goal_diff`, `surprise_bonus`, ריבוי טורנירים (המודל כבר תומך דרך `TournamentUser`),
מקור נתונים מרוחק (Remote API), אימייל/סיסמאות, ייבוא JSON ידני דרך UI.
