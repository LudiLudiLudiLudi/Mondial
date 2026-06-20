#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Seed חד-פעמי: משתתף וירטואלי 🐵 קוף — PROPOSED, לא הורץ.

מודל: משתתף רגיל לכל דבר (directory/participants/predictions/predicted_flags),
ניחושים אקראיים שנוצרים פעם אחת בלבד. לא בוט, לא מנהל, לא רץ שוב.

עקרונות יציבות (לפי החוזה):
  generate_once        — כל מסמך נוצר רק אם אינו קיים (בדיקת קיום לפני כתיבה).
  never_regenerate     — קיים prediction → דילוג. אין עדכון/מחיקה לעולם.
  no_post_kickoff      — משחק שכבר התחיל בזמן ההרצה לא מקבל ניחוש (אין רטרו).

החלטת מוצר סופית (2026-06-10, FINAL ALIGNMENT):
  הקוף גלוי — בדיחה משפחתית, לא משתתף סודי.
  זהות אחת בלבד: entityId=virtual_kof בכל המסמכים —
    participants/CUP2026__virtual_kof · directory/CUP2026__virtual_kof ·
    predicted_flags/CUP2026__virtual_kof · predictions/CUP2026__M0XX__virtual_kof
    (scores ייכתבו ע"י המנהל כ-...__virtual_kof דרך ownerUid).
  מונים: נרשמו/ניחשו כוללים את הקוף במודע (participants=directory, אין פער 9/8).
  תופעת לוואי מתועדת (cosmetic): רשימת ה-fallback האנונימית בבית גוזרת שם
  מ-participantId ⇒ תציג "virtual_kof"; משתתפים מאושרים רואים "🐵 קוף"
  (participants.displayName). תיקון תצוגה = שינוי אפליקציה — מחוץ לתכולה.

אבטחה (FINAL ACCEPTANCE 2026-06-10 — מסתמכים אך ורק על):
  * passwordHash קיים (sentinel אקראי, אין preimage, לא נשמר ולא מודפס)
      ⇒ login (via=login) נדחה ב-rules: ה-hash שנשלח לעולם לא ישתווה לשמור.
  * mustReset=false ⇒ choose-password (via=set) נדחה ב-rules: hash≠null.
  * אין מסלול reset ציבורי — איפוס הוא כפתור מנהל בלבד.
  * directory lookup rules — קריאת directory היא שם→מזהה בלבד, בלי credentials.
  * virtual=true — סימון זהות (לתצוגה/תפעול עתידיים).
  לא מסתמכים על: אי-יכולת להקליד virtual_kof / נרמול מקלדת / מגבלות תצוגה.
  שריד מקובל: "אפס סיסמה" ידני של מנהל על הקוף (hash=null+mustReset=true)
  יפתח את ענף ה-set למקליד virtual_kof — לא לאפס את הקוף.

חריג שחזור (OPERATIONAL RECOVERY RULE, 2026-06-11):
  generate-once חל על יצירת participant ו-predictions — לא על private/cred.
  אם virtual=true וה-passwordHash חסר/אופס ⇒ מותר שחזור בעלים של sentinel:
      python3 seed_kof_virtual_player.py --recover-cred           # בדיקה (קריאה בלבד)
      FIREBASE_OWNER_TOKEN=... python3 seed_kof_virtual_player.py --recover-cred --apply
  השחזור אידמפוטנטי (cred תקין ⇒ no-op), נוגע אך ורק ב-passwordHash+mustReset
  (updateMask — לא דורס uids/lastLoginAt), ולעולם אינו נוגע ב-predictions.
  מצב משוחזר: passwordHash != null · mustReset = false · virtual = true.
  תפעול: בקשת הצטרפות בשם "קוף" אינה דורסת את virtual_kof (מזהים שונים) —
  אבל כדאי לדחות כדי למנוע קוף-מתחזה.

מגבלה קוסמטית מקובלת ל-V1: מסכי fallback אנונימיים שגוזרים תווית מ-docId
יציגו "virtual_kof" במקום "🐵 קוף".

הרצה (בעל המערכת בלבד, דורש אישור מפורש):
  python3 seed_kof_virtual_player.py                                   # DRY-RUN, בלי טוקן, בלי רשת
  FIREBASE_OWNER_TOKEN=<owner OAuth token> python3 seed_kof_virtual_player.py --apply
טוקן בעלים: gcloud auth print-access-token  (או התבנית ההיסטורית של firebase CLI).
"""
import json
import os
import secrets
import sys
import urllib.request
from datetime import datetime, timezone

PROJECT = "mondial2026-family-pool"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
CODE = "CUP2026"
ENTITY_ID = "virtual_kof"            # הזהות היחידה — בכל המסמכים, בלי מזהה נוסף
OWNER_UID = ENTITY_ID                # ownerUid של predictions/scores (אין auth אמיתי)
PART_ID = f"{CODE}__{ENTITY_ID}"     # CUP2026__virtual_kof; ה-🐵 בתצוגה בלבד (displayName)
DISPLAY = "🐵 קוף"
APPLY = "--apply" in sys.argv
TOKEN = os.environ.get("FIREBASE_OWNER_TOKEN", "")
RNG = secrets.SystemRandom()

RECOVER = "--recover-cred" in sys.argv

if (APPLY or RECOVER) and not TOKEN:
    sys.exit("FIREBASE_OWNER_TOKEN חסר. --apply/--recover-cred דורשים טוקן בעלים. (DRY-RUN של seed רץ בלי טוקן ובלי רשת.)")

def req(method, path, body=None):
    r = urllib.request.Request(
        f"{BASE}/{path}", method=method,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(r) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise

def exists(path):
    return req("GET", path) is not None

def fv(v):
    if isinstance(v, bool): return {"booleanValue": v}
    if v is None: return {"nullValue": None}
    if isinstance(v, int): return {"integerValue": str(v)}
    if isinstance(v, list): return {"arrayValue": {"values": [fv(x) for x in v]}}
    if isinstance(v, datetime): return {"timestampValue": v.isoformat().replace("+00:00", "Z")}
    return {"stringValue": str(v)}

def create(path, data):
    # generate_once: בדיקת קיום רק ב-apply (DRY-RUN הוא offline מוחלט).
    if APPLY:
        if exists(path):
            print(f"  SKIP (exists): {path}")
            return False
        req("PATCH", path, {"fields": {k: fv(v) for k, v in data.items()}})
        print(f"  CREATED: {path}")
    else:
        print(f"  [dry-run] WRITE: {path}")
    return True

now = datetime.now(timezone.utc)

# --- מצב שחזור cred (חריג מתועם ל-generate-once; לעולם לא נוגע ב-predictions) ---
if RECOVER:
    print(f"mode: RECOVER-CRED {'APPLY' if APPLY else 'CHECK-ONLY'} · {now.isoformat()}")
    part = req("GET", f"participants/{PART_ID}")
    if part is None:
        sys.exit("ABORT: participant לא קיים — אין מה לשחזר (זה seed, לא recovery).")
    virtual = part.get("fields", {}).get("virtual", {}).get("booleanValue") is True
    if not virtual:
        sys.exit("ABORT: virtual!=true — השחזור מותר רק למשתתף הווירטואלי.")
    cred = req("GET", f"participants/{PART_ID}/private/cred")
    cf = (cred or {}).get("fields", {})
    has_hash = "stringValue" in cf.get("passwordHash", {})
    must_reset = cf.get("mustReset", {}).get("booleanValue") is True
    print(f"  state: cred_exists={cred is not None} passwordHash_present={has_hash} mustReset={must_reset}")
    if has_hash and not must_reset:
        print("  OK: cred תקין — no-op (אידמפוטנטי).")
        sys.exit(0)
    if APPLY:
        # updateMask: נוגע רק ב-passwordHash+mustReset; uids/lastLoginAt נשמרים.
        req("PATCH",
            f"participants/{PART_ID}/private/cred"
            "?updateMask.fieldPaths=passwordHash&updateMask.fieldPaths=mustReset",
            {"fields": {"passwordHash": fv(secrets.token_hex(32)), "mustReset": fv(False)}})
        check = req("GET", f"participants/{PART_ID}/private/cred").get("fields", {})
        ok = "stringValue" in check.get("passwordHash", {}) and check.get("mustReset", {}).get("booleanValue") is not True
        print(f"  RESTORED: passwordHash!=null · mustReset=false · verified={ok}")
        sys.exit(0 if ok else 1)
    print("  [check-only] would restore: sentinel passwordHash + mustReset=false (updateMask בלבד)")
    sys.exit(0)

print(f"mode: {'APPLY' if APPLY else 'DRY-RUN'} · {now.isoformat()}")

# --- 1. זהות (פעם אחת) ---
print("== participant ==")
create(f"participants/{PART_ID}", {
    "tournamentCode": CODE, "displayName": DISPLAY, "nameKey": ENTITY_ID,
    "isAdmin": False, "status": "approved", "virtual": True,
    "joinedAt": now, "uids": [],
})
# sentinel: סיסמה בלתי-ניתנת-לניחוש ⇒ login/set חסומים ע"י ה-rules
create(f"participants/{PART_ID}/private/cred", {
    "passwordHash": secrets.token_hex(32), "mustReset": False,
    "lastLoginAt": None, "uids": [],
})
# קוף גלוי: directory + predicted_flags נוצרים ⇒ participants=directory,
# והמונים (נרשמו/ניחשו) כוללים אותו במודע.
create(f"directory/{PART_ID}", {"participantId": PART_ID, "tournamentCode": CODE})
create(f"predicted_flags/{PART_ID}", {"participantId": PART_ID, "tournamentCode": CODE})

# --- 2. ניחושים (generate_once, לא רטרואקטיבי) ---
print("== predictions ==")
matches = json.load(open(os.path.join(os.path.dirname(__file__), "..", "public", "matches.json"), encoding="utf-8"))["matches"]
made = skipped_exist = skipped_started = 0
for m in matches:
    if datetime.fromisoformat(m["kickoffAt"].replace("Z", "+00:00")) <= now:
        skipped_started += 1
        continue
    path = f"predictions/{CODE}__{m['id']}__{OWNER_UID}"
    pick = RNG.choice(["home", "draw", "away"]) if m["stage"] == "group" else RNG.choice(["home", "away"])
    data = {
        "tournamentCode": CODE, "matchId": m["id"], "ownerUid": OWNER_UID,
        "displayName": DISPLAY, "stage": m["stage"], "pick": pick,
        "guessHome": RNG.randint(0, 3), "guessAway": RNG.randint(0, 3),
        "updatedAt": now,
    }
    if create(path, data):
        made += 1
    else:
        skipped_exist += 1
print(f"summary: created={made} skipped_existing={skipped_exist} skipped_started={skipped_started} / {len(matches)}")
print("== exact write set (single identity: " + ENTITY_ID + ") ==")
print(f"  participants/{PART_ID}              (virtual=true, approved, displayName={DISPLAY})")
print(f"  participants/{PART_ID}/private/cred (sentinel hash, mustReset=false)")
print(f"  directory/{PART_ID}")
print(f"  predicted_flags/{PART_ID}")
print(f"  predictions/{CODE}__M0XX__{OWNER_UID}  × {made}")
print(f"  total writes: {4 + made}")
