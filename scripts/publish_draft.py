#!/usr/bin/env python3
"""
Publish reviewed lesson drafts: generates pronunciation audio (Google Cloud
TTS, Chirp3 HD), uploads it to Supabase Storage, and upserts the lessons into
Supabase as status='published'. Then deletes the processed draft file(s) so
re-runs are a no-op.

Meant to run in CI (see .github/workflows/publish-drafts.yml) right after a
draft-lessons-* PR is merged to main — that merge is the human-review gate;
this script does the mechanical rest. Also runnable locally.

Requires:
  GOOGLE_TTS_API_KEY            - Google Cloud TTS API key
  SUPABASE_SERVICE_ROLE_KEY     - Supabase service_role key (bypasses RLS)

Usage: python3 scripts/publish_draft.py
"""
import glob
import json
import os
import sys
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUPABASE_URL = "https://zitpckldwilcfaoyhfvl.supabase.co"
DRAFTS_GLOB = os.path.join(ROOT, "data", "drafts", "pending-review-*.json")

VOICE_NAME = "cs-CZ-Chirp3-HD-Achernar"
LANGUAGE_CODE = "cs-CZ"

TTS_KEY = os.environ.get("GOOGLE_TTS_API_KEY")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")


def _request(method, url, body=None, headers=None, raw=False, api_key=None):
    h = {"apikey": api_key, "Authorization": f"Bearer {api_key}"} if api_key else {}
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
    with urllib.request.urlopen(req) as resp:
        raw_resp = resp.read()
        return json.loads(raw_resp) if raw_resp else None


def synthesize(text):
    url = f"https://texttospeech.googleapis.com/v1/text:synthesize?key={TTS_KEY}"
    payload = {
        "input": {"text": text},
        "voice": {"languageCode": LANGUAGE_CODE, "name": VOICE_NAME},
        "audioConfig": {"audioEncoding": "MP3"},
    }
    import base64
    data = _request("POST", url, body=payload)
    return base64.b64decode(data["audioContent"])


def upload_audio(storage_path, audio_bytes):
    url = f"{SUPABASE_URL}/storage/v1/object/audio/{storage_path}"
    _request("POST", url, body=audio_bytes, raw=True, api_key=SERVICE_KEY,
              headers={"Content-Type": "audio/mpeg", "x-upsert": "true"})
    return f"{SUPABASE_URL}/storage/v1/object/public/audio/{storage_path}"


def upsert(table, rows, on_conflict):
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}"
    _request("POST", url, body=rows, api_key=SERVICE_KEY,
              headers={"Prefer": "resolution=merge-duplicates,return=minimal"})


def level_code_for(lesson_id):
    # e.g. "a1-03" -> "A1", "b2-11" -> "B2"
    return lesson_id.split("-")[0].upper()


def position_for(lesson_id):
    # e.g. "a1-03" -> 2 (0-indexed, matching a1-01=0, a1-02=1, ...)
    return int(lesson_id.split("-")[1]) - 1


def publish_draft_file(path):
    print(f"\n== {os.path.relpath(path, ROOT)} ==")
    lessons = json.load(open(path, encoding="utf-8"))
    rows = []
    for lesson in lessons:
        lesson_id = lesson["id"]
        print(f"  {lesson_id}: {lesson['title']}")
        for i, v in enumerate(lesson.get("vocab", [])):
            word_path = f"cs/{lesson_id}-vocab-{i}-word.mp3"
            example_path = f"cs/{lesson_id}-vocab-{i}-example.mp3"
            print(f"    generating audio for vocab {i}")
            v["audioWord"] = upload_audio(word_path, synthesize(v["word"]))
            v["audioExample"] = upload_audio(example_path, synthesize(v["example"]))

        lesson_copy = dict(lesson)
        lesson_copy.pop("id")
        rows.append({
            "id": lesson_id,
            "level_code": level_code_for(lesson_id),
            "position": position_for(lesson_id),
            "status": "published",
            "data": lesson_copy,
        })

    upsert("lessons", rows, "id")
    print(f"  published {len(rows)} lesson(s)")


def main():
    draft_files = sorted(glob.glob(DRAFTS_GLOB))
    if not draft_files:
        print("No pending drafts to publish. Nothing to do.")
        return

    if not TTS_KEY:
        print("ERROR: set GOOGLE_TTS_API_KEY")
        sys.exit(1)
    if not SERVICE_KEY:
        print("ERROR: set SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)

    for path in draft_files:
        try:
            publish_draft_file(path)
        except urllib.error.HTTPError as e:
            print(f"  FAILED: HTTP {e.code}: {e.read().decode()}")
            sys.exit(1)
        os.remove(path)
        print(f"  removed processed draft: {os.path.relpath(path, ROOT)}")

    print("\nDone. Published lessons are now live in Supabase.")


if __name__ == "__main__":
    main()
