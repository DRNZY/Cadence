import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic2, Music, RefreshCw, Search, Sparkles } from "lucide-react";
import { Track, LyricLine, LyricsState } from "../types";

interface LyricsDeckProps {
  currentTrack: Track | null;
  currentTime: number;
  onSeek: (time: number) => void;
}

export const LyricsDeck: React.FC<LyricsDeckProps> = ({
  currentTrack,
  currentTime,
  onSeek
}) => {
  const [lyricsState, setLyricsState] = useState<LyricsState>({
    synced: false,
    source: "none",
    lines: []
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchArtist, setSearchArtist] = useState("");
  const [searchTitle, setSearchTitle] = useState("");
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);

  // Manual scroll lockout state
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const userScrollTimeoutRef = useRef<number | null>(null);

  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const fetchLyrics = useCallback((customArtist?: string, customTitle?: string) => {
    if (!currentTrack) {
      setLyricsState({ synced: false, source: "none", lines: [] });
      return;
    }

    setIsLoading(true);
    const artist = customArtist !== undefined ? customArtist : currentTrack.artist || "";
    const title = customTitle !== undefined ? customTitle : currentTrack.title || "";
    const album = currentTrack.album || "";
    const duration = currentTrack.duration || 0;
    const filePath = customArtist || customTitle ? "" : currentTrack.filePath || "";

    const params = new URLSearchParams({
      path: filePath,
      artist,
      title,
      album,
      duration: duration.toString()
    });

    fetch(`/api/lyrics?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        setLyricsState({
          synced: !!data.synced,
          source: data.source || "none",
          provider: data.provider || "LRCLIB",
          lines: data.lines || []
        });
      })
      .catch(err => {
        console.error("Failed to load lyrics:", err);
        setLyricsState({ synced: false, source: "none", lines: [] });
      })
      .finally(() => {
        setIsLoading(false);
        setIsSearchingOnline(false);
      });
  }, [currentTrack]);

  // Fetch lyrics whenever track changes
  useEffect(() => {
    setIsUserInteracting(false);
    lineRefs.current = [];
    if (userScrollTimeoutRef.current) {
      window.clearTimeout(userScrollTimeoutRef.current);
    }
    if (currentTrack) {
      setSearchArtist(currentTrack.artist || "");
      setSearchTitle(currentTrack.title || "");
      fetchLyrics();
    } else {
      setLyricsState({ synced: false, source: "none", lines: [] });
    }
  }, [currentTrack, fetchLyrics]);

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

  // Smoothly scroll active line to center
  const scrollToActive = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = scrollContainerRef.current;
    if (!container || activeIndex < 0) return;
    const targetEl = lineRefs.current[activeIndex];
    if (!targetEl) return;

    const containerHeight = container.clientHeight;
    const elementTop = targetEl.offsetTop;
    const elementHeight = targetEl.offsetHeight;

    // Calculate vertical position so active line is in the vertical center
    const targetScrollTop = elementTop - (containerHeight / 2) + (elementHeight / 2);

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior
    });
  }, [activeIndex]);

  // Trigger auto-scroll on activeIndex change if not in manual interaction
  useEffect(() => {
    if (!isUserInteracting && lyricsState.synced && activeIndex >= 0) {
      scrollToActive("smooth");
    }
  }, [activeIndex, isUserInteracting, lyricsState.synced, scrollToActive]);

  // Detect user manual scroll/drag
  const handleUserWheelOrTouch = () => {
    setIsUserInteracting(true);
    if (userScrollTimeoutRef.current) {
      window.clearTimeout(userScrollTimeoutRef.current);
    }
    // Auto-resume after 4 seconds of idle
    userScrollTimeoutRef.current = window.setTimeout(() => {
      setIsUserInteracting(false);
    }, 4000);
  };

  const handleResumeSync = () => {
    setIsUserInteracting(false);
    if (userScrollTimeoutRef.current) {
      window.clearTimeout(userScrollTimeoutRef.current);
    }
    scrollToActive("smooth");
  };

  const handleLineClick = (line: LyricLine, idx: number) => {
    if (lyricsState.synced) {
      setIsUserInteracting(false);
      if (userScrollTimeoutRef.current) {
        window.clearTimeout(userScrollTimeoutRef.current);
      }
      onSeek(line.time);
      
      // Instantly align
      const container = scrollContainerRef.current;
      const targetEl = lineRefs.current[idx];
      if (container && targetEl) {
        const containerHeight = container.clientHeight;
        const targetScrollTop = targetEl.offsetTop - (containerHeight / 2) + (targetEl.offsetHeight / 2);
        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: "smooth"
        });
      }
    }
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTitle.trim()) return;
    setIsSearchingOnline(true);
    fetchLyrics(searchArtist.trim(), searchTitle.trim());
    setIsSearchOpen(false);
  };

  return (
    <div className="flex flex-col h-full w-full p-4 md:p-6 select-none relative overflow-hidden">
      {/* Header */}
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
            title="Search lyrics"
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => fetchLyrics()}
            disabled={isLoading}
            className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition-all disabled:opacity-50"
            title="Refresh lyrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-primary" : ""}`} />
          </button>
        </div>
      </div>

      {/* Manual Search Drawer */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleManualSearch}
            className="z-20 py-3 border-b border-white/10 flex flex-col gap-2 shrink-0 bg-neutral-900/90 backdrop-blur-md -mx-4 px-4"
          >
            <div className="flex items-center gap-2">
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
                className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-all shadow-md shadow-primary/20"
              >
                <Search className="w-3 h-3" />
                <span>Search</span>
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Lyrics Scrollable Body with precision native scrolling & interaction listeners */}
      <div
        ref={scrollContainerRef}
        onWheel={handleUserWheelOrTouch}
        onTouchStart={handleUserWheelOrTouch}
        onPointerDown={handleUserWheelOrTouch}
        className="flex-1 overflow-y-auto overflow-x-hidden px-2 space-y-6 relative no-scrollbar"
        style={{
          paddingTop: "38vh",
          paddingBottom: "38vh"
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
            const distance = Math.abs(idx - activeIndex);

            return (
              <div
                key={`${idx}-${line.time}`}
                ref={el => {
                  lineRefs.current[idx] = el;
                }}
                onClick={() => handleLineClick(line, idx)}
                className={`transition-all duration-300 ease-out text-left rounded-2xl p-2.5 transform-gpu ${
                  lyricsState.synced ? "cursor-pointer" : "cursor-default"
                } ${
                  isActive
                    ? "text-white font-bold text-2xl md:text-3xl leading-snug scale-105 translate-x-2 drop-shadow-[0_4px_16px_var(--primary-glow)] opacity-100"
                    : isPast
                    ? "text-neutral-400 font-medium text-lg md:text-xl opacity-30 hover:opacity-60"
                    : distance > 3
                    ? "text-neutral-400 font-medium text-lg md:text-xl opacity-20 hover:opacity-50"
                    : "text-neutral-400 font-medium text-lg md:text-xl opacity-50 hover:opacity-80"
                }`}
              >
                {line.text}
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 px-6">
            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-neutral-500">
              <Music className="w-8 h-8" />
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold text-neutral-300">No synced lyrics</p>
              <button
                onClick={() => setIsSearchOpen(true)}
                disabled={isSearchingOnline}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/20 text-primary border border-primary/30 text-xs font-semibold hover:bg-primary/30 transition-all"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{isSearchingOnline ? "Searching..." : "Search Lyrics"}</span>
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
      <div className="pointer-events-none absolute top-12 left-0 right-0 h-16 bg-gradient-to-b from-[#0e1017] to-transparent z-10" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#0e1017] to-transparent z-10" />
    </div>
  );
};

export default LyricsDeck;
