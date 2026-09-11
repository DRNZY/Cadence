import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic2, Music, RefreshCw, Search, Sparkles, Check, Disc3 } from "lucide-react";
import { Track, LyricLine, LyricsState } from "../types";

export interface LyricsDeckHandle {
  toggleSearch: () => void;
  refresh: () => void;
}

interface LyricsDeckProps {
  currentTrack: Track | null;
  currentTime: number;
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

// In-memory cache for instant zero-latency lyric transitions
const lyricsMemoryCache = new Map<string, LyricsState>();

export const LyricsDeck = forwardRef<LyricsDeckHandle, LyricsDeckProps>(({
  currentTrack,
  currentTime,
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
  const [searchArtist, setSearchArtist] = useState("");
  const [searchTitle, setSearchTitle] = useState("");
  const [candidates, setCandidates] = useState<LyricsCandidate[]>([]);
  const [isSearchingCandidates, setIsSearchingCandidates] = useState(false);

  // Stabilize onLyricsLoaded callback reference to prevent infinite re-fetch loop
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
        setLyricsState(state);
        onLyricsLoaded?.(state);
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

  // Find active line index based on currentTime
  let activeIndex = -1;
  const lines = lyricsState.lines;
  if (lines.length > 0 && lyricsState.synced) {
    for (let i = 0; i < lines.length; i++) {
      if (currentTime >= lines[i].time) {
        if (i === lines.length - 1 || currentTime < lines[i + 1].time) {
          activeIndex = i;
          break;
        }
      }
    }
  }

  const scrollAnimRef = useRef<number | null>(null);

  const easeInOutCubic = (t: number) => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  const smoothScrollTo = useCallback((targetScrollTop: number, duration = 400) => {
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
      const eased = easeInOutCubic(progress);

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

  // Smoothly scroll active line to center
  const scrollToActive = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || activeIndex < 0) return;
    const targetEl = lineRefs.current[activeIndex];
    if (!targetEl) return;

    const containerH = container.clientHeight;
    if (containerH === 0) return;

    const targetScrollTop = targetEl.offsetTop - (containerH / 2) + (targetEl.offsetHeight / 2);
    smoothScrollTo(Math.max(0, targetScrollTop), 400);
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
    }, 4000);
  };

  const handleResumeSync = () => {
    setIsUserInteracting(false);
    if (userScrollTimeoutRef.current) {
      window.clearTimeout(userScrollTimeoutRef.current);
    }
    scrollToActive();
  };

  const handleLineClick = (line: LyricLine, idx: number) => {
    if (lyricsState.synced) {
      setIsUserInteracting(false);
      if (userScrollTimeoutRef.current) {
        window.clearTimeout(userScrollTimeoutRef.current);
      }
      onSeek(line.time);
      
      const container = scrollContainerRef.current;
      const targetEl = lineRefs.current[idx];
      if (container && targetEl) {
        const containerH = container.clientHeight;
        const targetScrollTop = targetEl.offsetTop - (containerH / 2) + (targetEl.offsetHeight / 2);
        smoothScrollTo(Math.max(0, targetScrollTop), 320);
      }
    }
  };

  const handleManualSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTitle.trim()) return;
    searchCandidates(searchArtist.trim(), searchTitle.trim());
  };

  // Real-time typography sizing based on container height
  const lyricFontSize = Math.max(16, Math.min(Math.round(containerHeight * 0.05), 32));

  return (
    <div ref={outerWrapperRef} className={`flex flex-col h-full w-full select-none relative overflow-hidden ${hideHeader ? "p-2 md:p-3" : "p-4 md:p-6"}`}>
      {/* Header (if not hidden by parent widget container) */}
      {!hideHeader && (
        <div className="flex items-center justify-between z-20 pb-3 border-b border-white/5 shrink-0">
          <div className="flex items-center space-x-2">
            <Mic2 className="w-4 h-4 text-primary" />
            <span className="text-xs uppercase tracking-wider font-semibold text-neutral-300">
              Lyrics
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {/* Source Indicator Pill */}
            {lyricsState.lines.length > 0 && (
              <span
                className={`flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-0.5 rounded-full border ${
                  lyricsState.synced
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-neutral-800/80 text-neutral-400 border-white/10"
                }`}
              >
                {lyricsState.synced && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                <span>{lyricsState.synced ? "Synced" : "Plain"}</span>
              </span>
            )}

            {/* Search / Refresh Online Lyrics Action */}
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

      {/* Manual Search & Candidate Matcher Drawer */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="z-20 py-3 border-b border-white/10 flex flex-col gap-2 shrink-0 bg-neutral-900/95 backdrop-blur-xl -mx-4 px-4 shadow-2xl"
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lyrics Scrollable Body with fluid responsive scaling */}
      <div
        ref={scrollContainerRef}
        onWheel={handleUserWheelOrTouch}
        onTouchStart={handleUserWheelOrTouch}
        className="flex-1 overflow-y-auto overflow-x-hidden px-2 space-y-6 relative no-scrollbar"
        style={{
          paddingTop: isCompact ? "1rem" : (lyricsState.synced ? `${Math.max(40, Math.round(containerHeight * 0.42))}px` : "1.5rem"),
          paddingBottom: isCompact ? "1rem" : (lyricsState.synced ? `${Math.max(40, Math.round(containerHeight * 0.42))}px` : "2rem")
        }}
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-400 space-y-3">
            <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-mono text-neutral-400">Loading lyrics...</p>
          </div>
        ) : lines.length > 0 ? (
          lines.map((line, idx) => {
            const isActive = lyricsState.synced && idx === activeIndex;
            const isPast = lyricsState.synced && idx < activeIndex;
            const isNext = lyricsState.synced && idx === activeIndex + 1;

            return (
              <div
                key={`${idx}-${line.time}`}
                ref={el => {
                  lineRefs.current[idx] = el;
                }}
                onClick={() => handleLineClick(line, idx)}
                className={`text-left rounded-2xl py-2 px-3 select-none transition-colors duration-200 ${
                  lyricsState.synced ? "cursor-pointer" : "cursor-default"
                }`}
              >
                <div
                  style={{ fontSize: `${lyricFontSize}px` }}
                  className={`leading-relaxed tracking-tight origin-left transition-all duration-300 ease-out ${
                    !lyricsState.synced
                      ? "text-neutral-300 font-medium opacity-80 hover:opacity-100"
                      : isActive
                      ? "text-white font-extrabold opacity-100 translate-x-2 scale-[1.02] drop-shadow-[0_0_18px_rgba(255,255,255,0.45)] drop-shadow-[0_0_30px_var(--primary-glow)]"
                      : isNext
                      ? "text-neutral-400 font-medium opacity-40 hover:opacity-75 translate-x-0"
                      : isPast
                      ? "text-neutral-500 font-medium opacity-30 hover:opacity-60 translate-x-0"
                      : "text-neutral-500 font-medium opacity-30 hover:opacity-60 translate-x-0"
                  }`}
                >
                  {line.text}
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
              <p className="text-sm font-bold text-white tracking-tight">Instrumental / Ambient Master</p>
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
      <AnimatePresence>
        {isUserInteracting && lyricsState.synced && activeIndex >= 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30"
          >
            <button
              onClick={handleResumeSync}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary text-white text-xs font-semibold shadow-[0_4px_20px_var(--primary-glow)] hover:scale-105 active:scale-95 transition-all border border-white/20"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Sync to Playhead</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Gradient Masks */}
      <div className={`lyrics-gradient-top pointer-events-none absolute left-0 right-0 ${hideHeader ? "h-10 top-0" : "h-14 top-12"} bg-gradient-to-b from-[#0e1017] via-[#0e1017]/70 to-transparent z-10 transition-all`} />
      <div className={`lyrics-gradient-bottom pointer-events-none absolute bottom-0 left-0 right-0 ${hideHeader ? "h-10" : "h-14"} bg-gradient-to-t from-[#0e1017] via-[#0e1017]/70 to-transparent z-10 transition-all`} />
    </div>
  );
});

export default LyricsDeck;
