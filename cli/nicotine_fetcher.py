#!/usr/bin/env python3
"""
Nicotine+ / Soulseek Headless Auto-Fetcher for Cadence & Antigravity
Runs 100% in the background inside Flatpak sandbox with zero GUI/popups.
"""

import sys
import time
import os
import re
import argparse
import threading
import multiprocessing
import subprocess

def sanitize_name(name):
    clean = re.sub(r'[\\/*?:"<>|]', "", name).strip()
    return clean or "Unknown"

def main():
    parser = argparse.ArgumentParser(description="Headless Soulseek/Nicotine Auto-Fetcher")
    parser.add_argument("query", help="Artist, track, or album to search and fetch")
    parser.add_argument("--auto-play", action="store_true", help="Auto-play on Cadence once download completes")
    parser.add_argument("--format", choices=["flac", "mp3", "any"], default="any", help="Preferred audio format")
    parser.add_argument("--timeout", type=int, default=120, help="Download timeout in seconds")
    parser.add_argument("--json", action="store_true", help="Output JSON status")
    args = parser.parse_args()

    from pynicotine import set_up_python
    from pynicotine.core import core
    from pynicotine.events import events
    from pynicotine.config import config
    from pynicotine.downloads import TransferStatus

    set_up_python()
    core.init_components(isolated_mode=False)

    logged_in = threading.Event()
    download_finished = threading.Event()
    results = []
    downloaded_paths = []
    failed_error = [None]

    def on_login(msg):
        if msg.success:
            logged_in.set()
        else:
            failed_error[0] = f"Soulseek login failed: {getattr(msg, 'reason', 'unknown')}"

    def on_search_response(msg):
        user = getattr(msg, "username", "unknown")
        inqueue = getattr(msg, "inqueue", 0)
        ulspeed = getattr(msg, "ulspeed", 0)
        free_slots = getattr(msg, "freeulslots", False)
        result_list = getattr(msg, "list", [])

        for item in result_list:
            if len(item) >= 5:
                _code, file_path, size, _ext_code, file_attrs = item[:5]
                ext_clean = os.path.splitext(file_path)[1].lower().replace(".", "")
                if ext_clean in ("flac", "mp3", "wav", "m4a", "ogg", "opus"):
                    results.append({
                        "user": user,
                        "file_path": file_path,
                        "size": size,
                        "ext": ext_clean,
                        "file_attrs": file_attrs,
                        "inqueue": inqueue,
                        "ulspeed": ulspeed,
                        "free_slots": free_slots,
                    })

    def on_update_download(transfer, *a, **kw):
        status = getattr(transfer, "status", None)
        path = getattr(transfer, "path", "")
        filename = getattr(transfer, "filename", "")
        percent = getattr(transfer, "percent", 0)
        speed = getattr(transfer, "speed", 0)

        if status == TransferStatus.FINISHED:
            if path and path not in downloaded_paths:
                downloaded_paths.append(path)
            download_finished.set()
        elif status == TransferStatus.TRANSFERRING:
            if not args.json:
                sys.stdout.write(f"\r[Soulseek] Downloading '{filename}': {round(percent, 1)}% ({round(speed / 1024, 1)} KB/s)...")
                sys.stdout.flush()
        elif status in (TransferStatus.CANCELLED, TransferStatus.CONNECTION_TIMEOUT, TransferStatus.LOCAL_FILE_ERROR):
            failed_error[0] = f"Transfer status: {status} for {filename}"

    events.connect("server-login", on_login)
    events.connect("file-search-response", on_search_response)
    events.connect("update-download", on_update_download)

    core.start()
    core.connect()

    # Wait for login (up to 30s)
    start_t = time.time()
    while not logged_in.is_set() and time.time() - start_t < 30:
        events.process_thread_events()
        time.sleep(0.05)

    if not logged_in.is_set():
        err = failed_error[0] or "Soulseek connection timed out"
        if not args.json:
            print(f"✗ {err}")
        core.quit()
        sys.exit(1)

    search_term = args.query.strip()
    if not args.json:
        print(f"✓ Connected to Soulseek as {config.sections['server']['login']}.")
        print(f"⚡ Searching network for '{search_term}'...")

    core.search.do_search(search_term, mode="global", switch_page=False)

    # Gather search results for 5-6s
    search_start = time.time()
    while time.time() - search_start < 6.0:
        events.process_thread_events()
        time.sleep(0.05)

    if not results:
        if not args.json:
            print(f"❌ No matching audio files found on Soulseek for '{search_term}'.")
        core.quit()
        sys.exit(1)

    query_tokens = [q.lower() for q in search_term.split() if len(q) > 1]

    # Scoring algorithm
    def score_item(r):
        fp_lower = r["file_path"].lower()
        score = 0

        # Match relevance
        matches = sum(1 for q in query_tokens if q in fp_lower)
        if matches == 0:
            return -1000
        score += matches * 50

        # Format preference
        ext = r["ext"]
        if args.format == "flac" and ext == "flac":
            score += 100
        elif args.format == "mp3" and ext == "mp3":
            score += 100
        elif ext == "flac":
            score += 60
        elif ext == "mp3":
            score += 30

        # Slot availability & queue
        if r["free_slots"]:
            score += 40
        if r["inqueue"] == 0:
            score += 30
        else:
            score -= min(30, r["inqueue"] * 3)

        # Upload speed
        score += min(30, (r["ulspeed"] or 0) / (100 * 1024))
        return score

    valid_results = [r for r in results if score_item(r) > 0]
    if not valid_results:
        valid_results = results

    sorted_results = sorted(valid_results, key=score_item, reverse=True)
    best = sorted_results[0]

    # Resolve target directory in /home/darnell/Music
    raw_path = best["file_path"].replace("\\", "/")
    parts = [p for p in raw_path.split("/") if p and not p.startswith("@")]
    
    music_base = os.path.expanduser("~/Music")
    dest_dir = music_base

    if len(parts) >= 3:
        artist_dir = sanitize_name(parts[-3])
        album_dir = sanitize_name(parts[-2])
        dest_dir = os.path.join(music_base, artist_dir, album_dir)
    elif len(parts) >= 2:
        artist_dir = sanitize_name(parts[-2])
        dest_dir = os.path.join(music_base, artist_dir)

    os.makedirs(dest_dir, exist_ok=True)

    if not args.json:
        print(f"✓ Selected Match: {best['file_path']} [{best['ext'].upper()}] ({round(best['size']/(1024*1024), 2)} MB)")
        print(f"  Peer: {best['user']} (FreeSlot: {best['free_slots']}, Queue: {best['inqueue']}, Speed: {round(best['ulspeed']/1024)} KB/s)")
        print(f"  Target Directory: {dest_dir}")
        print(f"⬇ Downloading in background...")

    core.downloads.enqueue_download(
        username=best["user"],
        virtual_path=best["file_path"],
        folder_path=dest_dir,
        size=best["size"],
        file_attributes=best["file_attrs"]
    )

    # Wait for download completion
    dl_start = time.time()
    while not download_finished.is_set() and time.time() - dl_start < args.timeout:
        events.process_thread_events()
        time.sleep(0.05)

    if download_finished.is_set():
        if not args.json:
            print("\n✓ Download completed successfully!")
        
        # Rescan Cadence library
        try:
            subprocess.run(["cadence-ctl", "rescan"], capture_output=True, text=True)
        except Exception:
            pass

        # Auto-play if requested
        if args.auto_play:
            if not args.json:
                print(f"▶ Auto-playing '{search_term}' on Cadence...")
            try:
                subprocess.run(["cadence-ctl", "play", search_term], capture_output=True, text=True)
            except Exception:
                pass
    else:
        if not args.json:
            print(f"\n⚠️ Download queued or transferring in background with peer {best['user']}.")

    core.quit()

if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
