#!/usr/bin/env bash
# Wrapper to execute python batch fetcher with nicotine flatpak environment
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/home/darnell/.var/app/org.nicotine_plus.Nicotine/config}"
export XDG_DATA_HOME="${XDG_DATA_HOME:-/home/darnell/.var/app/org.nicotine_plus.Nicotine/data}"
export PYTHONPATH="/var/lib/flatpak/app/org.nicotine_plus.Nicotine/x86_64/stable/active/files/lib/python3.13/site-packages:$PYTHONPATH"

exec python3 -u - << 'PYEOF' "$@"
import os
import sys
import csv
import json
import re
import time
import subprocess
import urllib.request

LOG_FILE = "/home/darnell/.gemini/antigravity/brain/6c8669db-b6dc-4c13-8b15-5abb2dad11be/scratch/batch_fetch.log"
os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)

def log(msg):
    ts = time.strftime("[%Y-%m-%d %H:%M:%S]")
    line = f"{ts} {msg}\n"
    sys.stdout.write(line)
    sys.stdout.flush()
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception:
        pass

def normalize(s):
    if not s:
        return ""
    s = s.lower()
    s = re.sub(r'\(feat\..*?\)|\[feat\..*?\]', '', s)
    s = re.sub(r'\(official.*?\)|\[official.*?\]', '', s)
    s = re.sub(r'\(video.*?\)|\[video.*?\]', '', s)
    s = re.sub(r'\(audio.*?\)|\[audio.*?\]', '', s)
    s = re.sub(r'\(lyrics.*?\)|\[lyrics.*?\]', '', s)
    s = re.sub(r'\(remastered.*?\)|\[remastered.*?\]', '', s)
    s = re.sub(r'- topic', '', s)
    s = re.sub(r'[^a-z0-9\s]', ' ', s)
    return ' '.join(s.split())

def is_already_downloaded(title, artist):
    music_dir = os.path.expanduser("~/Music")
    title_norm = normalize(title)
    artist_norm = normalize(artist)
    if not title_norm:
        return False
    
    title_words = [w for w in title_norm.split() if len(w) > 2]
    
    for root, _, files in os.walk(music_dir):
        for f in files:
            if not f.lower().endswith(('.flac', '.mp3', '.m4a', '.ogg', '.wav')):
                continue
            fn_norm = normalize(os.path.splitext(f)[0])
            path_norm = normalize(root)
            
            # Exact title normalized match
            if title_norm in fn_norm:
                return True
            # Substring match if title is long enough
            if len(title_norm) > 7 and title_norm in fn_norm:
                return True
            # Multi-word match
            if title_words and all(w in fn_norm for w in title_words):
                if not artist_norm or any(aw in fn_norm or aw in path_norm for aw in artist_norm.split() if len(aw) > 2):
                    return True
    return False

def clean_query(title, artist):
    clean_t = re.sub(r'\(feat\..*?\)|\[feat\..*?\]', '', title, flags=re.IGNORECASE)
    clean_t = re.sub(r'\(official.*?\)|\[official.*?\]', '', clean_t, flags=re.IGNORECASE)
    clean_t = re.sub(r'\(video.*?\)|\[video.*?\]', '', clean_t, flags=re.IGNORECASE)
    clean_t = re.sub(r'\(audio.*?\)|\[audio.*?\]', '', clean_t, flags=re.IGNORECASE)
    clean_t = re.sub(r'\(lyrics.*?\)|\[lyrics.*?\]', '', clean_t, flags=re.IGNORECASE)
    clean_t = re.sub(r'\(remastered.*?\)|\[remastered.*?\]', '', clean_t, flags=re.IGNORECASE)
    clean_t = clean_t.strip(" -[](),\"'")

    clean_a = artist.replace(" - Topic", "").strip(" -[](),\"'")
    if clean_a.lower() in ("various artists", "unknown artist", "topic"):
        clean_a = ""
        
    if clean_a:
        return f"{clean_a} {clean_t}".strip()
    return clean_t

def main():
    csv_path = "/tmp/input_playlists.csv"
    if not os.path.exists(csv_path):
        log(f"ERROR: {csv_path} not found")
        sys.exit(1)

    log("=== Starting Playlist Batch Ingestion ===")
    tracks = []
    seen = set()

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            v_title = row.get("Video Title", "").strip()
            channel = row.get("Channel Name", "").strip()
            if not v_title:
                continue
            artist = channel.replace(" - Topic", "").strip()
            title = v_title
            if " - " in v_title:
                parts = v_title.split(" - ", 1)
                artist = parts[0].strip()
                title = parts[1].strip()

            key = f"{normalize(artist)}_{normalize(title)}"
            if key not in seen and normalize(title):
                seen.add(key)
                tracks.append({
                    "raw_artist": artist,
                    "raw_title": title,
                    "query": clean_query(title, artist)
                })

    log(f"Parsed {len(tracks)} deduplicated unique tracks from playlists.")
    
    total = len(tracks)
    downloaded = 0
    skipped = 0
    failed = 0

    fetcher_bin = os.path.expanduser("~/.local/bin/nicotine-fetch")

    for i, t in enumerate(tracks, 1):
        artist = t["raw_artist"]
        title = t["raw_title"]
        query = t["query"]

        if is_already_downloaded(title, artist):
            skipped += 1
            log(f"[{i}/{total}] SKIP (Already in ~/Music): {artist} - {title}")
            continue

        log(f"[{i}/{total}] FETCHING: '{query}'")
        try:
            cmd = [fetcher_bin, query, "--timeout", "35"]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=50)
            output = res.stdout or ""
            if "Download completed" in output:
                downloaded += 1
                match = re.search(r"File:\s*(.+)", output)
                fpath = match.group(1) if match else "OK"
                log(f"[{i}/{total}] SUCCESS: {artist} - {title} -> {fpath}")
            else:
                failed += 1
                log(f"[{i}/{total}] NOT FOUND / FAILED: {query}")
        except subprocess.TimeoutExpired:
            failed += 1
            log(f"[{i}/{total}] TIMEOUT: {query}")
        except Exception as e:
            failed += 1
            log(f"[{i}/{total}] ERROR: {query} ({e})")

        time.sleep(1.0)

    log(f"=== Finished Playlist Batch Ingestion ===")
    log(f"Total: {total} | Downloaded: {downloaded} | Skipped: {skipped} | Failed/Unmatched: {failed}")

    try:
        log("Triggering Cadence library rescan via HTTP...")
        req = urllib.request.Request("http://localhost:3001/api/rescan", method="POST")
        with urllib.request.urlopen(req, timeout=5) as r:
            log(f"Cadence rescan response: {r.status}")
    except Exception as e:
        log(f"Cadence rescan trigger note: {e}")

if __name__ == "__main__":
    main()
PYEOF
