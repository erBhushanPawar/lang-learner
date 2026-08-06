#!/usr/bin/env python3
"""
Generate Czech pronunciation audio for the Learn track using Google Cloud
Text-to-Speech (Chirp3 HD). Idempotent — skips files that already exist, so
re-running after adding new lessons only generates what's new.

Requires: export GOOGLE_TTS_API_KEY="..."   (never commit this key)

Usage: python3 scripts/generate_audio.py
"""
import json
import os
import sys
import base64
import urllib.request
import urllib.error

VOICE_NAME = "cs-CZ-Chirp3-HD-Achernar"
LANGUAGE_CODE = "cs-CZ"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LESSONS_FILE = os.path.join(ROOT, "data", "cs-lessons.json")
AUDIO_DIR = os.path.join(ROOT, "data", "audio", "cs")

API_KEY = os.environ.get("GOOGLE_TTS_API_KEY")
if not API_KEY:
    print("ERROR: set GOOGLE_TTS_API_KEY first, e.g.:\n  export GOOGLE_TTS_API_KEY=\"your-key\"")
    sys.exit(1)


def synthesize(text):
    url = f"https://texttospeech.googleapis.com/v1/text:synthesize?key={API_KEY}"
    payload = json.dumps({
        "input": {"text": text},
        "voice": {"languageCode": LANGUAGE_CODE, "name": VOICE_NAME},
        "audioConfig": {"audioEncoding": "MP3"}
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"  API error {e.code}: {e.read().decode()}")
        return None
    return base64.b64decode(data["audioContent"])


def ensure_audio(filename, text, stats):
    path = os.path.join(AUDIO_DIR, filename)
    rel_path = f"data/audio/cs/{filename}"
    if os.path.exists(path):
        stats["skipped"] += 1
        return rel_path
    print(f"  generating {filename}  ({text[:50]!r}{'...' if len(text) > 50 else ''})")
    audio = synthesize(text)
    if audio is None:
        stats["failed"] += 1
        return None
    with open(path, "wb") as f:
        f.write(audio)
    stats["generated"] += 1
    return rel_path


def main():
    os.makedirs(AUDIO_DIR, exist_ok=True)
    data = json.load(open(LESSONS_FILE, encoding="utf-8"))
    stats = {"generated": 0, "skipped": 0, "failed": 0}

    for level in data["levels"]:
        for lesson in level.get("lessons", []):
            for i, v in enumerate(lesson["vocab"]):
                word_file = ensure_audio(f"{lesson['id']}-vocab-{i}-word.mp3", v["word"], stats)
                example_file = ensure_audio(f"{lesson['id']}-vocab-{i}-example.mp3", v["example"], stats)
                if word_file:
                    v["audioWord"] = word_file
                if example_file:
                    v["audioExample"] = example_file

    json.dump(data, open(LESSONS_FILE, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"\nDone. Generated: {stats['generated']}, already cached: {stats['skipped']}, failed: {stats['failed']}")
    if stats["failed"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
