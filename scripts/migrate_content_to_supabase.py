#!/usr/bin/env python3
"""
One-time (and re-runnable) migration: pushes data/cs-lessons.json and
data/cs-b2.json into Supabase tables, and uploads data/audio/cs/*.mp3 into
Supabase Storage. After this runs successfully, the app reads from Supabase
at runtime instead of these static files (see js/app.js).

Requires: export SUPABSE_LANG_LEARNER_SERVICE_ROLE_KEY="..."  (service_role
key — bypasses RLS, keep local-only, never commit).

Usage: python3 scripts/migrate_content_to_supabase.py
"""
import json
import os
import sys
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUPABASE_URL = "https://zitpckldwilcfaoyhfvl.supabase.co"
SERVICE_KEY = os.environ.get("SUPABSE_LANG_LEARNER_SERVICE_ROLE_KEY")

if not SERVICE_KEY:
    print("ERROR: export SUPABSE_LANG_LEARNER_SERVICE_ROLE_KEY first (see your ~/.zshrc)")
    sys.exit(1)


def _request(method, url, body=None, headers=None, raw=False):
    h = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
    }
    if headers:
        h.update(headers)
    data = None
    if body is not None:
        if raw:
            data = body
        else:
            data = json.dumps(body).encode("utf-8")
            h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw_resp = resp.read()
            return json.loads(raw_resp) if raw_resp else None
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        print(f"  HTTP {e.code} on {method} {url}: {err_body}")
        raise


def upsert(table, rows, on_conflict):
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}"
    _request("POST", url, body=rows, headers={"Prefer": "resolution=merge-duplicates,return=minimal"})


def ensure_bucket(name):
    url = f"{SUPABASE_URL}/storage/v1/bucket"
    try:
        _request("POST", url, body={"id": name, "name": name, "public": True})
        print(f"  created bucket '{name}'")
    except urllib.error.HTTPError as e:
        if e.code in (400, 409):
            print(f"  bucket '{name}' already exists, continuing")
        else:
            raise


def upload_audio(local_path, storage_path):
    url = f"{SUPABASE_URL}/storage/v1/object/audio/{storage_path}"
    with open(local_path, "rb") as f:
        data = f.read()
    try:
        _request("POST", url, body=data, headers={"Content-Type": "audio/mpeg", "x-upsert": "true"}, raw=True)
    except urllib.error.HTTPError:
        raise
    return f"{SUPABASE_URL}/storage/v1/object/public/audio/{storage_path}"


def migrate_lessons():
    print("\n== Lessons ==")
    data = json.load(open(os.path.join(ROOT, "data", "cs-lessons.json"), encoding="utf-8"))

    level_rows = []
    lesson_rows = []
    for lpos, level in enumerate(data["levels"]):
        level_rows.append({
            "code": level["code"], "name": level["name"], "tagline": level["tagline"],
            "locked": level["locked"], "position": lpos,
        })
        for lespos, lesson in enumerate(level.get("lessons", [])):
            lesson_copy = dict(lesson)
            for v in lesson_copy.get("vocab", []):
                for key in ("audioWord", "audioExample"):
                    if key in v:
                        local_rel = v[key]  # e.g. data/audio/cs/a1-01-vocab-0-word.mp3
                        local_path = os.path.join(ROOT, local_rel)
                        storage_path = "cs/" + os.path.basename(local_rel)
                        if os.path.exists(local_path):
                            print(f"  uploading {storage_path}")
                            v[key] = upload_audio(local_path, storage_path)
            lesson_id = lesson_copy.pop("id")
            lesson_rows.append({
                "id": lesson_id, "level_code": level["code"], "position": lespos,
                "status": "published", "data": lesson_copy,
            })

    upsert("levels", level_rows, "code")
    upsert("lessons", lesson_rows, "id")
    print(f"  migrated {len(level_rows)} levels, {len(lesson_rows)} lessons")


def migrate_exam_items():
    print("\n== Exam items (cs-b2.json) ==")
    data = json.load(open(os.path.join(ROOT, "data", "cs-b2.json"), encoding="utf-8"))
    rows = [{"id": item["id"], "section": item["section"], "status": "published", "data": item}
            for item in data["items"]]
    upsert("exam_items", rows, "id")
    print(f"  migrated {len(rows)} exam items")


def main():
    print("Ensuring 'audio' storage bucket exists...")
    ensure_bucket("audio")
    migrate_lessons()
    migrate_exam_items()
    print("\nDone. App should now read from Supabase — see js/app.js.")


if __name__ == "__main__":
    main()
