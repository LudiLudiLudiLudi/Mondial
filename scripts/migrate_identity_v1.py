#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""IDENTITY RECOVERY — Migration v1 (שלב 3 בתוכנית).

מטרה: להפסיק להשתמש ב-ownerUid כמזהה אדם. כל prediction מקבל participantId
(הזהות היציבה מ-participants/<id>), לפי displayName — רק כשההתאמה חד-משמעית.

כללים קשיחים:
  * יש participantId → לא נוגעים.
  * התאמת displayName יחידה → משלימים participantId (+identityStatus="ok").
  * אפס/כמה התאמות → identityStatus="needs_review" בלבד. שום שינוי אחר.
  * אין merge, אין מחיקה, אין שכתוב pick/guess/ownerUid — updateMask בלבד.

הרצה:
  python3 migrate_identity_v1.py                                   # DRY-RUN (קורא בלבד)
  FIREBASE_OWNER_TOKEN=... python3 migrate_identity_v1.py --apply
"""
import json
import os
import sys
import urllib.request
import urllib.parse

PROJECT = "mondial2026-family-pool"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
CODE = "CUP2026"
APPLY = "--apply" in sys.argv
TOKEN = os.environ.get("FIREBASE_OWNER_TOKEN", "")
if not TOKEN:
    sys.exit("FIREBASE_OWNER_TOKEN חסר (נדרש גם ל-dry-run — קריאת participants/predictions).")

def req(method, path, body=None):
    r = urllib.request.Request(
        f"{BASE}{path}", method=method,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(r) as resp:
        return json.load(resp)

def run_query(collection):
    body = {"structuredQuery": {
        "from": [{"collectionId": collection}],
        "where": {"fieldFilter": {"field": {"fieldPath": "tournamentCode"},
                                   "op": "EQUAL", "value": {"stringValue": CODE}}}}}
    rows = req("POST", ":runQuery", body)
    out = []
    for r in rows:
        if "document" not in r:
            continue
        d = r["document"]
        out.append((d["name"].split("/documents/")[1], d.get("fields", {})))
    return out

sv = lambda f, k: f.get(k, {}).get("stringValue")

print(f"mode: {'APPLY' if APPLY else 'DRY-RUN'}")

# --- משתתפים: displayName → participantId (docId) ---
parts = run_query("participants")
by_name = {}
for path, f in parts:
    name = sv(f, "displayName")
    by_name.setdefault(name, []).append(path.split("/")[-1])
print(f"participants: {len(parts)}")
ambiguous = {n: ids for n, ids in by_name.items() if len(ids) > 1}
if ambiguous:
    print("⚠️ שמות כפולים ב-participants:", ambiguous)

# --- ניחושים ---
preds = run_query("predictions")
print(f"predictions: {len(preds)}")
stats = {"already_ok": 0, "filled": 0, "needs_review": 0}
for path, f in preds:
    if sv(f, "participantId"):
        stats["already_ok"] += 1
        continue
    name = sv(f, "displayName")
    matches = by_name.get(name, [])
    doc_path = "/" + path
    if len(matches) == 1:
        stats["filled"] += 1
        action = f"FILL participantId={matches[0]}"
        if APPLY:
            req("PATCH",
                doc_path + "?updateMask.fieldPaths=participantId&updateMask.fieldPaths=identityStatus",
                {"fields": {"participantId": {"stringValue": matches[0]},
                            "identityStatus": {"stringValue": "ok"}}})
    else:
        stats["needs_review"] += 1
        action = f"NEEDS_REVIEW (התאמות: {len(matches)})"
        if APPLY:
            req("PATCH", doc_path + "?updateMask.fieldPaths=identityStatus",
                {"fields": {"identityStatus": {"stringValue": "needs_review"}}})
    print(f"  [{'APPLY' if APPLY else 'dry'}] {sv(f,'matchId')} · {name} · uid={ (sv(f,'ownerUid') or '')[:10] }… → {action}")

print(f"\nסיכום: already_ok={stats['already_ok']} filled={stats['filled']} needs_review={stats['needs_review']}")
print("גמר בהצלחה. אין merge, אין מחיקות, אין שינוי תוכן ניחושים.")
