import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef, useMemo } from "react";
import { Mic2, Music, RefreshCw, Search, Sparkles, Check, Disc3, Eye, Sliders } from "./icons";
import { Track, LyricsState } from "../types";

export interface LyricsDeckHandle {
  toggleSearch: () => void;
  refresh: () => void;
}

interface LyricsDeckProps {
  currentTrack: Track | null;
  currentTime: number;
  isPlaying?: boolean;
  onSeek: (time: number) => void;
  onLyricsLoaded?: (state: LyricsState) => void;
  isCompact?: boolean;
  hideHeader?: boolean;
}

interface LyricsCandidate {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  synced: boolean;
  instrumental: boolean;
  score: number;
  syncedLyrics?: string;
  plainLyrics?: string;
}

interface SyncedWord {
  start: number;
  end: number;
  text: string;
}

interface SyncedLine {
  time: number;
  vocalEndTime: number;
  nextStart: number;
  text: string;
  words: SyncedWord[];
  hasLeadIn: boolean;
  leadInStart: number;
}

// In-memory cache for instant zero-latency lyric transitions
const lyricsMemoryCache = new Map<string, LyricsState>();

export const LyricsDeck = forwardRef<LyricsDeckHandle, LyricsDeckProps>(({
  currentTrack,
  currentTime,
  isPlaying = false,
  onSeek,
  onLyricsLoaded,
  isCompact,
  hideHeader = false
}, ref) => {
  const [lyricsState, setLyricsState] = useState<LyricsState>({
    synced: false,
    source: "none",
    lines: []
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isOffsetBarOpen, setIsOffsetBarOpen] = useState(false);
  const [searchArtist, setSearchArtist] = useState("");
  const [searchTitle, setSearchTitle] = useState("");
  const [candidates, setCandidates] = useState<LyricsCandidate[]>([]);
  const [isSearchingCandidates, setIsSearchingCandidates] = useState(false);

  // User Microsecond Sync Offset Calibration (in milliseconds)
  const [syncOffsetMs, setSyncOffsetMs] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("cadence_lyrics_offset_ms");
      return saved ? parseInt(saved, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });

  const updateSyncOffset = (deltaMs: number) => {
    setSyncOffsetMs(prev => {
      const next = Math.max(-5000, Math.min(5000, prev + deltaMs));
      try {
        localStorage.setItem("cadence_lyrics_offset_ms", next.toString());
      } catch {}
      return next;
    });
  };

  const resetSyncOffset = () => {
    setSyncOffsetMs(0);
    try {
      localStorage.setItem("cadence_lyrics_offset_ms", "0");
    } catch {}
  };

  // Kinetic Karaoke and Blur Preferences
  const [isKineticEnabled, setIsKineticEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("cadence_lyrics_kinetic");
      return saved !== "false";
    } catch {
      return true;
    }
  });

  const [isDepthBlurEnabled, setIsDepthBlurEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("cadence_lyrics_blur");
      return saved !== "false";
    } catch {
      return true;
    }
  });

  const toggleKinetic = () => {
    setIsKineticEnabled(prev => {
      const next = !prev;
      try {
        localStorage.setItem("cadence_lyrics_kinetic", next.toString());
      } catch {}
      return next;
    });
  };

  const toggleBlur = () => {
    setIsDepthBlurEnabled(prev => {
      const next = !prev;
      try {
        localStorage.setItem("cadence_lyrics_blur", next.toString());
      } catch {}
      return next;
    });
  };

  /**
   * Sub-pixel playhead clock.
   *
   * This used to be `useState`, updated on every animation frame, so React
   * reconciled the entire lyric list at 60-120 Hz: for a typical song that is
   * 48-143 line elements per frame, each handed a freshly allocated inline style
   * object and a freshly allocated callback ref, so React could bail out of
   * neither the style diff nor the ref detach. Every line and every word also
   * carried `will-change: filter`, promoting each to its own GPU layer inside a
   * `mask-image` scroller.
   *
   * The clock now lives in a ref and never re-renders. Two things consume it:
   *
   *   - the active line index, which is state but only written when the index
   *     actually changes, so a re-render happens a handful of times per song
   *     instead of a hundred times per second;
   *   - the per-word karaoke wipe, written straight to `--prog` on the active
   *     line's word elements: a few style writes per frame, no JSX at all.
   */
  const smoothTimeRef = useRef<number>(currentTime);
  const lastAudioTimeRef = useRef<number>(currentTime);
  const lastAudioTickRef = useRef<number>(performance.now());
  const isPlayingRef = useRef<boolean>(isPlaying);

  // Stabilize onLyricsLoaded callback reference
  const onLyricsLoadedRef = useRef(onLyricsLoaded);
  useEffect(() => {
    onLyricsLoadedRef.current = onLyricsLoaded;
  }, [onLyricsLoaded]);

  const lastFetchedKeyRef = useRef<string | null>(null);

  // Manual scroll lockout state
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const userScrollTimeoutRef = useRef<number | null>(null);

  const outerWrapperRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [containerHeight, setContainerHeight] = useState<number>(320);

  // Dynamically observe container height in real time
  useEffect(() => {
    const el = outerWrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        if (height > 0) {
          setContainerHeight(prev => (Math.abs(prev - height) > 2 ? height : prev));
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fetchLyrics = useCallback((customArtist?: string, customTitle?: string, forceRefresh?: boolean) => {
    if (!currentTrack) {
      setLyricsState({ synced: false, source: "none", lines: [] });
      lastFetchedKeyRef.current = null;
      return;
    }

    const artist = customArtist !== undefined ? customArtist : currentTrack.artist || "";
    const title = customTitle !== undefined ? customTitle : currentTrack.title || "";
    const album = currentTrack.album || "";
    const duration = currentTrack.duration || 0;
    const filePath = customArtist || customTitle || forceRefresh ? "" : currentTrack.filePath || "";
    const cacheKey = `${currentTrack.id || currentTrack.filePath}:${artist}:${title}`;

    if (!forceRefresh && lyricsMemoryCache.has(cacheKey)) {
      const cached = lyricsMemoryCache.get(cacheKey)!;
      lastFetchedKeyRef.current = cacheKey;
      setLyricsState(cached);
      setIsLoading(false);
      onLyricsLoadedRef.current?.(cached);
      return;
    }

    setIsLoading(true);
    lastFetchedKeyRef.current = cacheKey;

    const params = new URLSearchParams({
      path: filePath,
      artist,
      title,
      album,
      duration: duration.toString()
    });
    if (forceRefresh) {
      params.set("refresh", "true");
    }

    fetch(`/api/lyrics?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        const state: LyricsState = {
          synced: !!data.synced,
          source: data.source || "none",
          provider: data.provider || "LRCLIB",
          isInstrumental: !!data.isInstrumental,
          hasWordSync: !!data.hasWordSync,
          lines: data.lines || []
        };
        lyricsMemoryCache.set(cacheKey, state);
        setLyricsState(state);
        onLyricsLoadedRef.current?.(state);
      })
      .catch(err => {
        console.error("Failed to load lyrics:", err);
        const state: LyricsState = { synced: false, source: "none", lines: [] };
        setLyricsState(state);
        onLyricsLoadedRef.current?.(state);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [currentTrack]);

  // Online candidate search
  const searchCandidates = useCallback(async (artistQuery: string, titleQuery: string) => {
    setIsSearchingCandidates(true);
    try {
      const params = new URLSearchParams({
        artist: artistQuery,
        title: titleQuery,
        duration: (currentTrack?.duration || 0).toString()
      });
      const res = await fetch(`/api/lyrics/search?${params.toString()}`);
      const data = await res.json();
      setCandidates(data.candidates || []);
    } catch {
      setCandidates([]);
    } finally {
      setIsSearchingCandidates(false);
    }
  }, [currentTrack]);

  // User manually selects a verified candidate match
  const handleSelectCandidate = async (candidate: LyricsCandidate) => {
    if (!currentTrack) return;
    const targetArtist = currentTrack.artist || candidate.artistName;
    const targetTitle = currentTrack.title || candidate.trackName;
    try {
      setIsLoading(true);
      const res = await fetch("/api/lyrics/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artist: targetArtist,
          title: targetTitle,
          lrc: candidate.syncedLyrics,
          plain: candidate.plainLyrics
        })
      });
      const data = await res.json();
      if (data.lines) {
        const state: LyricsState = {
          synced: !!data.synced,
          source: "online",
          provider: `LRCLIB (${candidate.trackName})`,
          isInstrumental: candidate.instrumental,
          lines: data.lines
        };
        const cacheKey = `${currentTrack.id || currentTrack.filePath}:${currentTrack.artist || ""}:${currentTrack.title || ""}`;
        lyricsMemoryCache.set(cacheKey, state);
        setLyricsState(state);
        onLyricsLoadedRef.current?.(state);
        setIsSearchOpen(false);
      }
    } catch (err) {
      console.error("Failed to save selected candidate:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    toggleSearch: () => setIsSearchOpen(prev => !prev),
    refresh: () => fetchLyrics(undefined, undefined, true)
  }), [fetchLyrics]);

  // Fetch lyrics whenever track changes
  useEffect(() => {
    setIsUserInteracting(false);
    lineRefs.current = [];
    setCandidates([]);
    if (userScrollTimeoutRef.current) {
      window.clearTimeout(userScrollTimeoutRef.current);
    }
    if (currentTrack) {
      const trackKey = currentTrack.id || currentTrack.filePath;
      if (lastFetchedKeyRef.current !== trackKey) {
        setSearchArtist(currentTrack.artist || "");
        setSearchTitle(currentTrack.title || "");
        fetchLyrics();
      }
    } else {
      lastFetchedKeyRef.current = null;
      setLyricsState({ synced: false, source: "none", lines: [] });
    }
  }, [currentTrack, fetchLyrics]);

  // Auto-search candidates when search drawer opens if candidates list is empty
  useEffect(() => {
    if (isSearchOpen && candidates.length === 0 && (searchTitle || searchArtist)) {
      searchCandidates(searchArtist, searchTitle);
    }
  }, [isSearchOpen, candidates.length, searchArtist, searchTitle, searchCandidates]);

  // Process and format lines with vocal phrase durations and Apple lead-in interludes
  const processedLines = useMemo<SyncedLine[]>(() => {
    if (!lyricsState.lines || lyricsState.lines.length === 0) return [];
    const rawLines = lyricsState.lines;

    return rawLines.map((line, idx) => {
      const lineStart = line.time;
      const nextLine = rawLines[idx + 1];
      const nextStart = nextLine ? nextLine.time : lineStart + 6.0;

      let words: SyncedWord[] = [];
      let vocalEndTime: number;

      if (line.words && line.words.length > 0) {
        words = line.words.map((w, wi, arr) => {
          const wordStart = w.start;
          const wordEnd = w.end ?? (arr[wi + 1]?.start ?? wordStart + 0.5);
          return {
            start: wordStart,
            end: Math.max(wordStart + 0.1, wordEnd),
            text: w.text
          };
        });
        vocalEndTime = words[words.length - 1].end;
      } else {
        // Intelligent phrasing duration: avoids keeping lines active during long musical breaks
        const wordCount = line.text.split(/\s+/).filter(Boolean).length;
        const estimatedDuration = Math.max(1.8, Math.min(6.5, wordCount * 0.42 + 1.0));
        vocalEndTime = lineStart + Math.min(Math.max(1.5, nextStart - lineStart - 0.3), estimatedDuration);
      }

      // Apple Music 3-dot lead-in countdown check (gap >= 2.4s)
      const prevLineEnd = idx === 0 ? 0 : rawLines[idx - 1].time + 2.0;
      const restGap = lineStart - prevLineEnd;
      const hasLeadIn = restGap >= 2.4;
      const leadInStart = Math.max(0, lineStart - 1.8);

      return {
        time: lineStart,
        vocalEndTime,
        nextStart,
        text: line.text,
        words,
        hasLeadIn,
        leadInStart
      };
    });
  }, [lyricsState.lines]);

  /**
   * Effective playhead at render granularity.
   *
   * Used only for threshold decisions (lead-in visibility and the three-dot
   * countdown), which are steps rather than continuous readouts, so reading the
   * ref here is correct and costs nothing.
   */
  const effectiveTime = smoothTimeRef.current + syncOffsetMs / 1000;

  /** Word elements belonging to the active line, indexed by word position. */
  const activeWordRefs = useRef<Array<HTMLElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const activeLineIndexRef = useRef<number>(-1);
  const syncOffsetRef = useRef<number>(syncOffsetMs);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    syncOffsetRef.current = syncOffsetMs;
  }, [syncOffsetMs]);

  useEffect(() => {
    lastAudioTimeRef.current = currentTime;
    lastAudioTickRef.current = performance.now();
    smoothTimeRef.current = currentTime;
  }, [currentTime]);

  /**
   * The rAF driver: extrapolates the playhead between `timeupdate` ticks, moves
   * the active line, and paints the karaoke wipe.
   *
   * React re-renders only when the active line index actually changes. The
   * per-frame wipe is written straight to `--prog` on the active line's word
   * elements, which touches no JSX.
   *
   * The loop reads its inputs through refs so it can be registered once. It also
   * suspends entirely when the document is hidden, so a minimised window is not
   * burning a core.
   */
  const processedLinesRef = useRef(processedLines);
  processedLinesRef.current = processedLines;
  const syncedRef = useRef(lyricsState.synced);
  syncedRef.current = lyricsState.synced;
  const kineticRef = useRef(isKineticEnabled);
  kineticRef.current = isKineticEnabled;

  /**
   * The word refs are only valid for the line they were collected on. When the
   * lyric set changes, drop them; otherwise the loop would keep painting
   * `--prog` onto detached elements from the previous song.
   */
  useEffect(() => {
    activeWordRefs.current = [];
  }, [processedLines]);

  /**
   * Recompute the active line when the playhead jumps rather than advances.
   *
   * The rAF loop only runs while playing, so without this a seek on a paused
   * player would leave the highlight on the previous line, and changing track
   * would highlight nothing at all until playback resumed.
   */
  useEffect(() => {
    const lines = processedLinesRef.current;
    if (lines.length === 0 || !syncedRef.current) {
      if (activeLineIndexRef.current !== -1) {
        activeLineIndexRef.current = -1;
        setActiveIndex(-1);
      }
      return;
    }
    const time = currentTime + syncOffsetMs / 1000;
    let lo = 0;
    let hi = lines.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (time >= lines[mid].time) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (found !== activeLineIndexRef.current) {
      activeLineIndexRef.current = found;
      setActiveIndex(found);
    }
  }, [currentTime, processedLines, syncOffsetMs, lyricsState.synced, currentTrack]);

  useEffect(() => {
    let rafId = 0;

    // The lines are sorted by time, so the active line is found by bisection.
    // This used to be a linear scan running on every render.
    const findActiveIndex = (time: number): number => {
      const lines = processedLinesRef.current;
      if (lines.length === 0 || !syncedRef.current) return -1;
      let lo = 0;
      let hi = lines.length - 1;
      let found = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (time >= lines[mid].time) {
          found = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return found;
    };

    const paintActiveWords = (time: number, lineIdx: number) => {
      if (!kineticRef.current) return;
      const line = processedLinesRef.current[lineIdx];
      if (!line?.words || line.words.length === 0) return;
      const refs = activeWordRefs.current;
      for (let i = 0; i < line.words.length; i++) {
        const el = refs[i];
        const w = line.words[i];
        if (!el || !w) continue;
        const duration = w.end - w.start;
        if (!(duration > 0.05)) continue;
        const progress = Math.max(0, Math.min(1, (time - w.start) / duration));
        el.style.setProperty("--prog", progress.toFixed(4));
      }
    };

    const tick = () => {
      if (isPlayingRef.current && !document.hidden) {
        const now = performance.now();
        const elapsed = (now - lastAudioTickRef.current) / 1000;
        // Extrapolate up to 0.4s to bridge the gap between 250ms timeupdate ticks.
        const estimated = lastAudioTimeRef.current + Math.min(elapsed, 0.4);
        smoothTimeRef.current = estimated;
        const time = estimated + syncOffsetRef.current / 1000;

        const next = findActiveIndex(time);
        if (next !== activeLineIndexRef.current) {
          activeLineIndexRef.current = next;
          // The outgoing line's word refs must be dropped, or the next line
          // inherits a stale array of detached elements.
          activeWordRefs.current = [];
          setActiveIndex(next);
        }
        paintActiveWords(time, activeLineIndexRef.current);
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const scrollAnimRef = useRef<number | null>(null);

  const easeOutApple = (t: number) => {
    return 1 - Math.pow(1 - t, 4);
  };

  const smoothScrollTo = useCallback((targetScrollTop: number, duration = 420) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (scrollAnimRef.current !== null) {
      cancelAnimationFrame(scrollAnimRef.current);
      scrollAnimRef.current = null;
    }

    const startTop = container.scrollTop;
    const distance = targetScrollTop - startTop;
    if (Math.abs(distance) < 1) return;

    const startTime = performance.now();

    const frame = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeOutApple(progress);

      container.scrollTop = startTop + distance * eased;

      if (progress < 1) {
        scrollAnimRef.current = requestAnimationFrame(frame);
      } else {
        scrollAnimRef.current = null;
      }
    };

    scrollAnimRef.current = requestAnimationFrame(frame);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollAnimRef.current !== null) {
        cancelAnimationFrame(scrollAnimRef.current);
      }
    };
  }, []);

  // Smoothly scroll active line to Apple Music golden ratio (~38% from top)
  const scrollToActive = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || activeIndex < 0) return;
    const targetEl = lineRefs.current[activeIndex];
    if (!targetEl) return;

    const containerH = container.clientHeight;
    if (containerH === 0) return;

    const targetScrollTop = targetEl.offsetTop - (containerH * 0.38) + (targetEl.offsetHeight / 2);
    smoothScrollTo(Math.max(0, targetScrollTop), 420);
  }, [activeIndex, smoothScrollTo]);

  useEffect(() => {
    if (!isUserInteracting && lyricsState.synced && activeIndex >= 0) {
      scrollToActive();
    }
  }, [activeIndex, isUserInteracting, lyricsState.synced, scrollToActive, containerHeight]);

  const handleUserWheelOrTouch = () => {
    if (scrollAnimRef.current !== null) {
      cancelAnimationFrame(scrollAnimRef.current);
      scrollAnimRef.current = null;
    }
    setIsUserInteracting(true);
    if (userScrollTimeoutRef.current) {
      window.clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = window.setTimeout(() => {
      setIsUserInteracting(false);
    }, 4500);
  };

  const handleResumeSync = () => {
    setIsUserInteracting(false);
    if (userScrollTimeoutRef.current) {
      window.clearTimeout(userScrollTimeoutRef.current);
    }
    scrollToActive();
  };

  const handleLineClick = (lineTime: number, idx: number) => {
    if (lyricsState.synced) {
      setIsUserInteracting(false);
      if (userScrollTimeoutRef.current) {
        window.clearTimeout(userScrollTimeoutRef.current);
      }
      onSeek(lineTime);
      
      const container = scrollContainerRef.current;
      const targetEl = lineRefs.current[idx];
      if (container && targetEl) {
        const containerH = container.clientHeight;
        const targetScrollTop = targetEl.offsetTop - (containerH * 0.38) + (targetEl.offsetHeight / 2);
        smoothScrollTo(Math.max(0, targetScrollTop), 320);
      }
    }
  };

  const handleManualSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTitle.trim()) return;
    searchCandidates(searchArtist.trim(), searchTitle.trim());
  };

  // Real-time responsive typography sizing
  const lyricFontSize = Math.max(18, Math.min(Math.round(containerHeight * 0.054), 36));

  return (
    <div ref={outerWrapperRef} className={`flex flex-col h-full w-full select-none relative overflow-hidden ${hideHeader ? "p-2 md:p-3" : "p-4 md:p-6"}`}>
      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center justify-between z-20 pb-3 border-b border-white/5 shrink-0">
          <div className="flex items-center space-x-2">
            <Mic2 className="w-4 h-4 text-primary" />
            <span className="text-xs uppercase tracking-wider font-semibold text-neutral-300">
              Lyrics
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {/* Sync Mode Pill */}
            {processedLines.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={toggleKinetic}
                  title="Toggle Kinetic / Synced Mode"
                  className={`flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-0.5 rounded-full border transition-all ${
                    isKineticEnabled && lyricsState.synced
                      ? "bg-primary/20 text-primary border-primary/35 shadow-sm shadow-primary/20"
                      : "bg-white/5 text-neutral-400 border-white/10 hover:border-white/20"
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{isKineticEnabled && lyricsState.synced ? "Kinetic" : "Synced"}</span>
                </button>

                <button
                  onClick={toggleBlur}
                  title="Toggle Apple Music Depth-of-Field Blur"
                  className={`p-1 rounded-full border transition-all ${
                    isDepthBlurEnabled
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "bg-white/5 text-neutral-500 border-white/10 hover:text-white"
                  }`}
                >
                  <Eye className="w-3 h-3" />
                </button>

                <button
                  onClick={() => setIsOffsetBarOpen(prev => !prev)}
                  title="Adjust Microsecond Sync Offset Calibration"
                  className={`p-1 rounded-full border transition-all ${
                    isOffsetBarOpen || syncOffsetMs !== 0
                      ? "bg-primary/20 text-primary border-primary/35"
                      : "bg-white/5 text-neutral-400 border-white/10 hover:text-white"
                  }`}
                >
                  <Sliders className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Search Online Lyrics Action */}
            <button
              onClick={() => setIsSearchOpen(prev => !prev)}
              className={`p-1.5 rounded-full border transition-all ${
                isSearchOpen
                  ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                  : "bg-white/5 hover:bg-white/10 border-white/10 text-neutral-300 hover:text-white"
              }`}
              title="Search Lyrics Online"
            >
              <Search className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => fetchLyrics(undefined, undefined, true)}
              disabled={isLoading}
              className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition-all disabled:opacity-50"
              title="Force Refresh Lyrics (Purge Cache)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-primary" : ""}`} />
            </button>
          </div>
        </div>
      )}

      {/* Sync Offset Calibration Bar */}
      {isOffsetBarOpen && (
        <div className="cadence-collapse-in z-20 py-2 border-b border-white/10 flex items-center justify-between gap-3 shrink-0 bg-neutral-900/90 backdrop-blur-xl -mx-4 px-4 shadow-xl">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-neutral-400">Sync Offset:</span>
            <span className={`text-[11px] font-mono font-bold ${syncOffsetMs === 0 ? "text-neutral-400" : syncOffsetMs > 0 ? "text-emerald-400" : "text-amber-400"}`}>
              {syncOffsetMs > 0 ? `+${syncOffsetMs}ms` : `${syncOffsetMs}ms`}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => updateSyncOffset(-100)}
              className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-neutral-300 hover:text-white transition-all"
            >
              -100ms
            </button>
            <button
              onClick={() => updateSyncOffset(-50)}
              className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-neutral-300 hover:text-white transition-all"
            >
              -50ms
            </button>
            <button
              onClick={resetSyncOffset}
              disabled={syncOffsetMs === 0}
              className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-neutral-400 hover:text-white disabled:opacity-40 transition-all"
            >
              Reset
            </button>
            <button
              onClick={() => updateSyncOffset(50)}
              className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-neutral-300 hover:text-white transition-all"
            >
              +50ms
            </button>
            <button
              onClick={() => updateSyncOffset(100)}
              className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-neutral-300 hover:text-white transition-all"
            >
              +100ms
            </button>
          </div>
        </div>
      )}

      {/* Manual Search & Candidate Matcher Drawer */}
      {isSearchOpen && (
        <div
          className="cadence-collapse-in z-20 py-3 border-b border-white/10 flex flex-col gap-2 shrink-0 bg-neutral-900/95 backdrop-blur-xl -mx-4 px-4 shadow-2xl overflow-hidden"
        >
          <form onSubmit={handleManualSearchSubmit} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Artist..."
              value={searchArtist}
              onChange={e => setSearchArtist(e.target.value)}
              className="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-primary"
            />
            <input
              type="text"
              placeholder="Title..."
              value={searchTitle}
              onChange={e => setSearchTitle(e.target.value)}
              className="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-primary"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-all shadow-md shadow-primary/20 shrink-0"
            >
              <Search className="w-3 h-3" />
              <span>Find</span>
            </button>
          </form>

          {/* Candidates Results List */}
          {isSearchingCandidates ? (
            <div className="flex items-center justify-center py-3 gap-2 text-neutral-400 text-xs font-mono">
              <RefreshCw className="w-3 h-3 animate-spin text-primary" />
              <span>Searching verified online lyrics...</span>
            </div>
          ) : candidates.length > 0 ? (
            <div className="max-h-48 overflow-y-auto space-y-1 pr-1 mt-1 no-scrollbar">
              <div className="text-[10px] font-mono text-neutral-400 uppercase px-1 pb-1">
                Verified Matches ({candidates.length})
              </div>
              {candidates.map(candidate => (
                <div
                  key={candidate.id}
                  onClick={() => handleSelectCandidate(candidate)}
                  className="flex items-center justify-between p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/15 cursor-pointer transition-all group text-left"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white truncate group-hover:text-primary transition-colors">
                        {candidate.trackName}
                      </span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                        candidate.synced
                          ? "bg-primary/20 text-primary border-primary/30"
                          : "bg-neutral-800 text-neutral-400 border-white/10"
                      }`}>
                        {candidate.synced ? "Synced" : "Plain"}
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-400 truncate">
                      {candidate.artistName} {candidate.albumName ? `• ${candidate.albumName}` : ""}
                    </div>
                  </div>
                  {candidate.duration && (
                    <span className="text-[10px] font-mono text-neutral-500 shrink-0 mr-2">
                      {Math.floor(candidate.duration / 60)}:{(Math.round(candidate.duration) % 60).toString().padStart(2, "0")}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectCandidate(candidate);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-primary/20 hover:bg-primary text-primary hover:text-white text-[10px] font-semibold transition-all shrink-0 flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    <span>Sync</span>
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* Ambient Radial Lighting Derived from Album Art */}
      <div className="apple-lyrics-ambient" />

      {/* Lyrics Scrollable Body */}
      <div
        ref={scrollContainerRef}
        onWheel={handleUserWheelOrTouch}
        onTouchStart={handleUserWheelOrTouch}
        className="apple-lyrics-container flex-1 overflow-y-auto overflow-x-hidden px-2 space-y-7 md:space-y-8 relative no-scrollbar z-10"
        style={{
          paddingTop: isCompact ? "1rem" : (lyricsState.synced ? `${Math.max(40, Math.round(containerHeight * 0.38))}px` : "1.5rem"),
          paddingBottom: isCompact ? "1rem" : (lyricsState.synced ? `${Math.max(40, Math.round(containerHeight * 0.42))}px` : "2rem")
        }}
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-400 space-y-3">
            <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-mono text-neutral-400">Loading lyrics...</p>
          </div>
        ) : processedLines.length > 0 ? (
          processedLines.map((line, idx) => {
            const isActive = lyricsState.synced && idx === activeIndex;
            const distance = idx - activeIndex;

            // Apple Music 3-dot lead-in countdown check
            const showLeadIn = lyricsState.synced && line.hasLeadIn && effectiveTime >= line.leadInStart && effectiveTime < line.time;
            const timeUntilLine = line.time - effectiveTime;
            const dot1Active = timeUntilLine <= 1.8;
            const dot2Active = timeUntilLine <= 1.2;
            const dot3Active = timeUntilLine <= 0.6;

            // Discrete GPU CSS classes
            let lineClass = "apple-lyric-line text-left rounded-2xl py-2 px-3 select-none group";
            if (lyricsState.synced) {
              lineClass += " cursor-pointer";
              if (isDepthBlurEnabled) lineClass += " blur-on";

              if (isActive) {
                lineClass += " is-active";
              } else if (Math.abs(distance) === 1) {
                lineClass += " is-near";
              } else if (distance < -1) {
                lineClass += " is-far-past";
              } else {
                lineClass += " is-far-future";
              }
            } else {
              lineClass += " cursor-default opacity-85 text-neutral-300";
            }

            return (
              <div
                key={`${idx}-${line.time}`}
                ref={el => {
                  lineRefs.current[idx] = el;
                }}
                onClick={() => handleLineClick(line.time, idx)}
                className={lineClass}
              >
                {/* 3-Dot Vocal Lead-In Countdown */}
                {showLeadIn && (
                  <div className="flex items-center gap-2 mb-2.5 pl-1 animate-fadeIn">
                    <span
                      className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                        dot1Active
                          ? "bg-primary scale-125 shadow-[0_0_12px_var(--primary-glow)] animate-lead-dot"
                          : "bg-white/20 scale-90"
                      }`}
                    />
                    <span
                      className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                        dot2Active
                          ? "bg-primary scale-125 shadow-[0_0_12px_var(--primary-glow)] animate-lead-dot"
                          : "bg-white/20 scale-90"
                      }`}
                    />
                    <span
                      className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                        dot3Active
                          ? "bg-primary scale-125 shadow-[0_0_12px_var(--primary-glow)] animate-lead-dot"
                          : "bg-white/20 scale-90"
                      }`}
                    />
                  </div>
                )}

                <div
                  style={{ fontSize: `${lyricFontSize}px` }}
                  className={`leading-[1.38] tracking-[-0.03em] origin-left transition-colors duration-300 ${
                    !lyricsState.synced
                      ? "text-neutral-300 font-medium group-hover:text-white"
                      : isActive
                      ? "text-white font-extrabold"
                      : "text-neutral-400 font-medium group-hover:text-neutral-100"
                  }`}
                >
                  {lyricsState.synced && isKineticEnabled && line.words && line.words.length > 0 ? (
                    <span className="whitespace-pre-wrap inline-block">
                      {line.words.map((w, wi) => {
                        const wordDuration = Math.max(0.05, w.end - w.start);
                        // Render-time value only. It picks the word's static state
                        // class and seeds --prog; the smooth per-frame wipe is
                        // written straight to the element by the rAF loop, because
                        // routing it through React meant reconciling every word of
                        // every line at display refresh rate.
                        const progress = Math.max(0, Math.min(1, (effectiveTime - w.start) / wordDuration));
                        const isWordActive = isActive && progress > 0 && progress < 1;
                        const isWordPast = (isActive && progress >= 1) || (lyricsState.synced && distance < 0);

                        return (
                          <span
                            key={`${wi}-${w.start}`}
                            // Collected only for the active line. Every other line
                            // passes no ref at all, so this array holds at most one
                            // line's worth of elements rather than one per word in
                            // the song.
                            ref={isActive ? (el) => { if (el) activeWordRefs.current[wi] = el; } : undefined}
                            className={`karaoke-word ${
                              isWordActive
                                ? "karaoke-word-active karaoke-word-wipe"
                                : isWordPast
                                ? "karaoke-word-past font-bold"
                                : "karaoke-word-upcoming"
                            }`}
                            style={{ "--prog": progress } as React.CSSProperties}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLineClick(w.start, idx);
                            }}
                          >
                            {wi > 0 ? " " : ""}
                            {w.text}
                          </span>
                        );
                      })}
                    </span>
                  ) : (
                    <span>
                      {line.text}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        ) : lyricsState.isInstrumental ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 px-6 my-auto">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-primary shadow-lg shadow-primary/10">
              <Disc3 className="w-7 h-7 animate-spin-vinyl text-primary" />
            </div>
            <div className="space-y-1 max-w-xs">
              <p className="text-sm font-bold text-white tracking-tight">Instrumental Master</p>
              <p className="text-xs text-neutral-400 leading-relaxed">No vocal lyrics registered for this track. Pure acoustics active.</p>
            </div>
            <button
              onClick={() => {
                setIsSearchOpen(true);
                searchCandidates(searchArtist, searchTitle);
              }}
              className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 text-xs font-semibold transition-all active:scale-95"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search Online</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 px-6">
            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-neutral-500">
              <Music className="w-8 h-8" />
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold text-neutral-300">No synced lyrics</p>
              <button
                onClick={() => {
                  setIsSearchOpen(true);
                  searchCandidates(searchArtist, searchTitle);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/20 text-primary border border-primary/30 text-xs font-semibold hover:bg-primary/30 transition-all active:scale-95"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search Online</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating "Sync to Playhead" Resume Pill */}
      {isUserInteracting && lyricsState.synced && activeIndex >= 0 && (
        <div className="cadence-slide-up absolute bottom-6 left-0 right-0 z-30 flex justify-center pointer-events-none">
          <button
            onClick={handleResumeSync}
            className="pointer-events-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary text-white text-xs font-semibold shadow-[0_4px_20px_var(--primary-glow)] hover:scale-105 active:scale-95 transition-all border border-white/20"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Sync to Playhead</span>
          </button>
        </div>
      )}

      {/* Floating Ambient Gradient Masks */}
      <div className={`lyrics-gradient-top pointer-events-none absolute left-0 right-0 ${hideHeader ? "h-12 top-0" : "h-16 top-12"} bg-gradient-to-b from-[#0d0d10] via-[#0d0d10]/80 to-transparent z-10 transition-all`} />
      <div className={`lyrics-gradient-bottom pointer-events-none absolute bottom-0 left-0 right-0 ${hideHeader ? "h-12" : "h-16"} bg-gradient-to-t from-[#0d0d10] via-[#0d0d10]/80 to-transparent z-10 transition-all`} />
    </div>
  );
});

export default LyricsDeck;

