#!/usr/bin/env python3
"""
Nicotine+ / Soulseek Ultra-Fast Headless Auto-Fetcher for Cadence
Designed for sub-10-second search, match selection, and line-rate download.
"""

import sys
import time
import os
import re
import argparse
import threading
import multiprocessing
import urllib.request
import json

def sanitize_name(name):
    clean = re.sub(r'[\\/*?:"<>|]', "", name).strip()
    return clean or "Unknown"

def main():
    t_start = time.time()
    parser = argparse.ArgumentParser(description="Ultra-Fast Soulseek/Nicotine Auto-Fetcher")
    parser.add_argument("query", help="Artist, track, or album to search and fetch")
    parser.add_argument("--auto-play", action="store_true", help="Auto-play on Cadence once download completes (default: False)")
    parser.add_argument("--format", choices=["flac", "mp3", "any"], default="any", help="Preferred audio format")
    parser.add_argument("--timeout", type=int, default=60, help="Download timeout in seconds")
    parser.add_argument("--json", action="store_true", help="Output JSON status")
    args = parser.parse_args()

    # Pre-patch portmapper and message queue before loading core
    from pynicotine import set_up_python
    from pynicotine import portmapper
    from pynicotine.slskproto import NetworkThread
    from pynicotine.slskmessages import ServerConnect, ServerDisconnect

    portmapper.PortMapper.add_port_mapping = lambda *a, **k: None

    pre_login_queue = []
    is_logged_in = [False]
    network_thread_ref = []

    orig_queue = NetworkThread._queue_network_message
    def safe_queue(self, msg):
        if not network_thread_ref:
            network_thread_ref.append(self)
        if isinstance(msg, (ServerConnect, ServerDisconnect)):
            return orig_queue(self, msg)
        if not is_logged_in[0]:
            pre_login_queue.append(msg)
            return
        return orig_queue(self, msg)

    NetworkThread._queue_network_message = safe_queue

    from pynicotine.core import core
    from pynicotine.events import events
    from pynicotine.config import config
    from pynicotine.downloads import TransferStatus

    set_up_python()
    core.init_components(isolated_mode=False)
    config.sections['server']['upnp'] = False
    config.sections['plugins']['enable'] = False

    # Ensure resilient DNS and port binding
    import socket
    srv = config.sections['server'].get('server', ('server.slsknet.org', 2242))
    try:
        socket.getaddrinfo(srv[0], srv[1], socket.AF_INET, socket.SOCK_STREAM)
    except Exception:
        config.sections['server']['server'] = ('208.76.170.59', srv[1])

    # Dynamic port selection if 2234 is held by another process
    for p in range(2234, 2250):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as test_s:
                test_s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                test_s.bind(('0.0.0.0', p))
                config.sections['server']['portrange'] = (p, p)
                break
        except OSError:
            continue

    logged_in = threading.Event()
    download_finished = threading.Event()
    results = []
    downloaded_paths = []
    failed_error = [None]

    import unicodedata
    import difflib

    # Pre-process search tokens for instant scoring
    raw_query = args.query.strip()
    m = re.match(r'^(?P<title>.+?)\s+(?:from|by)\s+(?P<artist>.+)$', raw_query, re.IGNORECASE)
    if m:
        artist = m.group("artist").strip()
        title = m.group("title").strip()
        search_term = f"{artist} {title}"
        artist_words = [w for w in re.split(r'\s+', artist) if len(w) > 1]
        other_words = [w for w in re.split(r'\s+', title) if len(w) > 1]
    else:
        artist = ""
        title = raw_query
        stopwords = {"by", "from", "the", "a", "an", "track", "album", "song"}
        words = [w for w in re.split(r'\s+', raw_query) if w.lower() not in stopwords]
        search_term = " ".join(words) if words else raw_query
        artist_words = []
        other_words = words

    # Normalize unicode / diacritics and punctuation for Soulseek network query
    def normalize_str(s):
        return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()

    search_term = normalize_str(search_term)
    search_term = re.sub(r"[^\w\s]", " ", search_term)
    search_term = " ".join(search_term.split())

    query_tokens = [normalize_str(q) for q in re.split(r'[\s\-_]+', search_term) if len(q) > 1]

    def score_item(r):
        fp_lower = normalize_str(r["file_path"])
        fn_lower = normalize_str(os.path.basename(r["file_path"].replace("\\", "/")))
        fn_words = re.split(r'[\s\-_.,()\[\]]+', fn_lower)
        score = 0

        # Keyword matching (direct substring or high fuzzy similarity)
        matches = 0
        for q in query_tokens:
            if q in fp_lower:
                matches += 1
            elif any(difflib.SequenceMatcher(None, q, w).ratio() >= 0.82 for w in fn_words):
                matches += 1

        if matches == 0:
            return -1000
        score += matches * 60

        # Specific artist keyword bonus in filepath
        if artist_words:
            matched_artist = sum(1 for aw in artist_words if normalize_str(aw) in fp_lower)
            if matched_artist > 0:
                score += matched_artist * 150
            else:
                score -= 100

        # Title phrase exact or high fuzzy matching
        norm_title = normalize_str(title)
        if norm_title:
            if norm_title in fn_lower:
                score += 500
            elif any(difflib.SequenceMatcher(None, norm_title, " ".join(fn_words[i:i+max(1, len(other_words))])).ratio() >= 0.80 for i in range(len(fn_words))):
                score += 450

        # Specific title keyword bonus in filename
        matched_title_words = 0
        for q in other_words:
            q_norm = normalize_str(q)
            if q_norm in fn_lower:
                score += 150
                matched_title_words += 1
            elif any(difflib.SequenceMatcher(None, q_norm, w).ratio() >= 0.82 for w in fn_words):
                score += 120
                matched_title_words += 1

        if other_words:
            if matched_title_words == 0:
                score -= 500
            elif matched_title_words < len(other_words):
                score -= 250

        # Audio format preference
        ext = r["ext"]
        if args.format == "flac" and ext == "flac":
            score += 100
        elif args.format == "mp3" and ext == "mp3":
            score += 100
        elif ext == "flac":
            score += 60
        elif ext == "mp3":
            score += 30

        # Free slot & queue bonus
        if r["free_slots"] and r["inqueue"] == 0:
            score += 150
        elif r["free_slots"]:
            score += 50
        
        if r["inqueue"] > 0:
            score -= min(200, r["inqueue"] * 30)

        # Upload speed bonus: prioritize high bandwidth peers
        spd_kb = (r["ulspeed"] or 0) / 1024
        if spd_kb > 5000:
            score += 120
        elif spd_kb > 1000:
            score += 80
        elif spd_kb > 250:
            score += 40
        elif spd_kb < 50:
            score -= 50
        return score

    best_match = [None]
    best_match_score = [-1000]

    def on_login(msg):
        if msg.success:
            is_logged_in[0] = True
            logged_in.set()
            if network_thread_ref:
                while pre_login_queue:
                    orig_queue(network_thread_ref[0], pre_login_queue.pop(0))
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
                    cand = {
                        "user": user,
                        "file_path": file_path,
                        "size": size,
                        "ext": ext_clean,
                        "file_attrs": file_attrs,
                        "inqueue": inqueue,
                        "ulspeed": ulspeed,
                        "free_slots": free_slots,
                    }
                    results.append(cand)
                    s = score_item(cand)
                    if s > best_match_score[0]:
                        best_match_score[0] = s
                        best_match[0] = cand

    target_transfer_key = [None]

    def on_update_download(transfer, *a, **kw):
        user = getattr(transfer, "username", "")
        vp = getattr(transfer, "virtual_path", "")
        if target_transfer_key[0] and (user + vp) != target_transfer_key[0]:
            return

        status = getattr(transfer, "status", None)
        fn = os.path.basename(vp.replace("\\", "/"))
        offset = getattr(transfer, "current_byte_offset", 0) or 0
        total = getattr(transfer, "size", 0) or 1
        pct = min(100.0, (offset / total) * 100.0)
        spd = getattr(transfer, "speed", 0) or 0

        if status == TransferStatus.FINISHED:
            folder = getattr(transfer, "folder_path", "")
            final_path = os.path.join(folder, fn) if folder else fn
            if final_path not in downloaded_paths:
                downloaded_paths.append(final_path)
            download_finished.set()
        elif status == TransferStatus.TRANSFERRING:
            if not args.json:
                sys.stdout.write(f"\r⚡ [Soulseek] Downloading '{fn}': {pct:.1f}% ({spd / 1024:.1f} KB/s)...   ")
                sys.stdout.flush()
        elif status == TransferStatus.QUEUED:
            qpos = getattr(transfer, "queue_position", 0)
            if not args.json:
                sys.stdout.write(f"\r⌛ [Soulseek] Queued at peer (pos: {qpos})...   ")
                sys.stdout.flush()
        elif status in (TransferStatus.CANCELLED, TransferStatus.CONNECTION_TIMEOUT, TransferStatus.LOCAL_FILE_ERROR):
            failed_error[0] = f"Transfer status: {status} for {fn}"

    events.connect("server-login", on_login)
    events.connect("file-search-response", on_search_response)
    events.connect("update-download", on_update_download)

    core.start()
    core.connect()

    # Wait for login (up to 5s)
    login_start = time.time()
    while not logged_in.is_set() and time.time() - login_start < 5.0:
        events.process_thread_events()
        time.sleep(0.01)

    if not logged_in.is_set():
        err = failed_error[0] or "Soulseek connection timed out"
        if not args.json:
            print(f"✗ {err}")
        core.quit()
        sys.exit(1)

    if not args.json:
        print(f"✓ Connected to Soulseek ({round(time.time() - t_start, 2)}s)")
        print(f"🔍 Searching network for '{search_term}'...")

    core.search.do_search(search_term, mode="global", switch_page=False)

    # Dynamic early-exit search: 1.5s minimum to stream results, exit early once top candidate found
    search_start = time.time()
    min_search_duration = 1.6
    max_search_duration = 3.2

    while time.time() - search_start < max_search_duration:
        events.process_thread_events()
        # If we already found a prime target with free slot and 0 queue, exit early!
        if time.time() - search_start >= min_search_duration and best_match[0]:
            if best_match[0]["free_slots"] and best_match[0]["inqueue"] == 0 and best_match_score[0] >= 200:
                break
        time.sleep(0.01)

    if not results or best_match_score[0] < 300:
        # Fallback searches if initial search returned 0 high-confidence results
        fallbacks = []
        clean_term = re.sub(r"[^\w\s]", " ", search_term).strip()
        clean_term = " ".join(clean_term.split())
        if clean_term != search_term:
            fallbacks.append(clean_term)
        if artist_words:
            fallbacks.append(" ".join(normalize_str(w) for w in artist_words))
        if other_words:
            fallbacks.append(" ".join(normalize_str(w) for w in other_words))

        for fb in fallbacks:
            if not results or best_match_score[0] < 300:
                if not args.json:
                    print(f"⚡ Expanding search to '{fb}'...")
                core.search.do_search(fb, mode="global", switch_page=False)
                fb_start = time.time()
                while time.time() - fb_start < 2.5:
                    events.process_thread_events()
                    if best_match[0] and best_match[0]["free_slots"] and best_match[0]["inqueue"] == 0 and best_match_score[0] >= 350:
                        break
                    time.sleep(0.01)

    if not results:
        if not args.json:
            print(f"❌ No matching audio files found on Soulseek for '{search_term}'.")
        core.quit()
        sys.exit(1)

    # Pick best scored candidate
    best = best_match[0] or sorted(results, key=score_item, reverse=True)[0]

    # Resolve target directory in /home/darnell/Music
    raw_path = best["file_path"].replace("\\", "/")
    parts = [p for p in raw_path.split("/") if p and not p.startswith("@")]
    
    music_base = os.path.expanduser("~/Music")
    dest_dir = music_base

    if artist:
        artist_dir = sanitize_name(artist)
        album_cand = sanitize_name(parts[-2]) if len(parts) >= 2 else ""
        if album_cand and album_cand.lower() not in ("music", "songs", "tracks", "shared", "audio", "unsorted", "downloads", "my music", "media", "unsorted tracks") and not album_cand.startswith("@"):
            dest_dir = os.path.join(music_base, artist_dir, album_cand)
        else:
            dest_dir = os.path.join(music_base, artist_dir)
    elif len(parts) >= 3:
        artist_dir = sanitize_name(parts[-3])
        album_dir = sanitize_name(parts[-2])
        dest_dir = os.path.join(music_base, artist_dir, album_dir)
    elif len(parts) >= 2:
        artist_dir = sanitize_name(parts[-2])
        dest_dir = os.path.join(music_base, artist_dir)

    os.makedirs(dest_dir, exist_ok=True)

    if not args.json:
        print(f"✓ Found Match ({round(time.time() - t_start, 2)}s): {best['file_path']} [{best['ext'].upper()}] ({round(best['size']/(1024*1024), 2)} MB)")
        print(f"  Peer: {best['user']} | Speed: {round(best['ulspeed']/1024)} KB/s | Queue: {best['inqueue']}")
        print(f"⬇ Downloading to: {dest_dir}")

    target_transfer_key[0] = best["user"] + best["file_path"]
    core.downloads.enqueue_download(
        username=best["user"],
        virtual_path=best["file_path"],
        folder_path=dest_dir,
        size=best["size"],
        file_attributes=best["file_attrs"]
    )

    # Download loop
    dl_start = time.time()
    while not download_finished.is_set() and time.time() - dl_start < args.timeout:
        events.process_thread_events()
        time.sleep(0.01)

    elapsed = round(time.time() - t_start, 2)

    if download_finished.is_set():
        if not args.json:
            print(f"\n✓ Download completed in {elapsed}s!")
            for p in downloaded_paths:
                print(f"  File: {p}")
        
        # Rescan Cadence library via direct HTTP call (fast, non-blocking)
        try:
            req = urllib.request.Request("http://localhost:3001/api/rescan", method="GET")
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode())
                if not args.json:
                    print(f"✓ Cadence library indexed ({data.get('count', 0)} tracks)")
        except Exception:
            pass

        # Strictly DO NOT play unless --auto-play is explicitly requested
        if args.auto_play:
            play_target = downloaded_paths[0] if downloaded_paths else search_term
            if not args.json:
                print(f"▶ Auto-playing '{play_target}' on Cadence...")
            try:
                subprocess.run(["cadence-ctl", "play", play_target], capture_output=True, text=True)
            except Exception:
                pass
    else:
        if not args.json:
            print(f"\n⚠️ Transfer in progress in background with peer {best['user']} ({elapsed}s).")

    core.quit()

if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
