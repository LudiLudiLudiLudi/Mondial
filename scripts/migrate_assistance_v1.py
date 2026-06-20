#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""FAMILY MODE — איחוד מודל ה-audit למודל סיוע אחד (assistance).

ממיר שדות ישנים ל-assistedBy/assistedAt/assistanceReason. אין מחיקת נתונים.
  editedBy / restoredBy / helpedBy   → assistedBy
  editedAt / restoredAt              → assistedAt
  editReason / restoreReason         → assistanceReason (ממופה ל-enum החדש)

הערה: נכון להרצה זו אין בשרת אף מסמך עם השדות הישנים (0) — ההמרה היא no-op,
אבל הסקריפט אידמפוטנטי ובטוח להרצה חוזרת.

הרצה:
  FIREBASE_OWNER_TOKEN=... python3 migrate_assistance_v1.py            # DRY-RUN
  FIREBASE_OWNER_TOKEN=... python3 migrate_assistance_v1.py --apply
"""
import json, os, sys, urllib.request

PROJECT = "mondial2026-family-pool"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
CODE = "CUP2026"
APPLY = "--apply" in sys.argv
TOKEN = os.environ.get("FIREBASE_OWNER_TOKEN", "")
if not TOKEN:
    sys.exit("FIREBASE_OWNER_TOKEN חסר.")

# מיפוי הסיבות הישנות (עברית/אנגלית) ל-enum החדש
REASON_MAP = {
    "save_failed": "system_not_saved", "ui_bug": "technical_issue",
    "child_input_lost": "system_not_saved", "family_correction": "family_update",
    "שחזור תקלה": "system_not_saved", "ביקש עזרה": "child_requested_help",
    "טעות הזנה": "family_update", "תיקון משפחתי": "family_update",
}
NEW_ENUM = {"system_not_saved", "child_requested_help", "family_update", "late_entry", "technical_issue", "parent_support"}

def req(method, path, body=None):
    r = urllib.request.Request(f"{BASE}{path}", method=method,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(r) as resp:
        return json.load(resp)

rows = req("POST", ":runQuery", {"structuredQuery": {"from": [{"collectionId": "predictions"}],
    "where": {"fieldFilter": {"field": {"fieldPath": "tournamentCode"}, "op": "EQUAL", "value": {"stringValue": CODE}}}}})
sv = lambda f, k: f.get(k, {}).get("stringValue")
print(f"mode: {'APPLY' if APPLY else 'DRY-RUN'}")
converted = 0
for r in rows:
    if "document" not in r: continue
    path = r["document"]["name"].split("/documents/")[1]
    f = r["document"]["fields"]
    if sv(f, "assistedBy"):
        continue  # כבר במודל החדש
    old_by = sv(f, "editedBy") or sv(f, "restoredBy") or sv(f, "helpedBy")
    if not old_by:
        continue  # אין audit ישן — לא נוגעים
    old_at = f.get("editedAt") or f.get("restoredAt")
    old_reason = sv(f, "editReason") or sv(f, "restoreReason")
    new_reason = REASON_MAP.get(old_reason, "family_update") if old_reason else "family_update"
    fields = {"assistedBy": {"stringValue": old_by}, "assistanceReason": {"stringValue": new_reason}}
    if old_at: fields["assistedAt"] = old_at
    converted += 1
    print(f"  [{'APPLY' if APPLY else 'dry'}] {path}: assistedBy={old_by} reason={old_reason}→{new_reason}")
    if APPLY:
        mask = "&".join("updateMask.fieldPaths=" + k for k in fields)
        req("PATCH", "/" + path + "?" + mask, {"fields": fields})
print(f"\nסיכום: converted={converted} (0 = אין audit ישן בשרת — no-op). אין מחיקות.")
