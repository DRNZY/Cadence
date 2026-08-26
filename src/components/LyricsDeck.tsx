import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic2, Music, Sparkles, Globe, RefreshCw, Search, Check, AlertCircle } from "lucide-react";
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

  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const fetchLyrics = (customArtist?: string, customTitle?: string) => {
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
  };

  // Fetch lyrics whenever track changes
  useEffect(() => {
    if (currentTrack) {
      setSearchArtist(currentTrack.artist || "");
      setSearchTitle(currentTrack.title || "");
      fetchLyrics();
    } else {
      setLyricsState({ synced: false, source: "none", lines: [] });
    }
  }, [currentTrack]);

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

  // Smooth scroll active line to center
  useEffect(() => {
    if (activeLineRef.current && scrollContainerRef.current && lyricsState.synced) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }
  }, [activeIndex, lyricsState.synced]);

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
            Karaoke Lyrics Deck
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
              {lyricsState.source === "online" && <Globe className="w-3 h-3 text-primary" />}
              <span>
                {lyricsState.synced
                  ? lyricsState.source === "online" || lyricsState.source === "cache"
                    ? "Time-Synced (LRCLIB)"
                    : "Time-Synced (Local)"
                  : "Plain Lyrics"}
              </span>
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
            title="Search or Refresh Online Synced Lyrics"
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => fetchLyrics()}
            disabled={isLoading}
            className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition-all disabled:opacity-50"
            title="Re-fetch Lyrics"
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
                placeholder="Artist name..."
                value={searchArtist}
                onChange={e => setSearchArtist(e.target.value)}
                className="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-primary"
              />
              <input
                type="text"
                placeholder="Song title..."
                value={searchTitle}
                onChange={e => setSearchTitle(e.target.value)}
                className="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-all shadow-md shadow-primary/20"
              >
                <Globe className="w-3 h-3" />
                <span>Fetch Online</span>
              </button>
            </div>
            <p className="text-[10px] text-neutral-400 font-mono">
              Powered by LRCLIB API. Fetches synchronized millisecond karaoke timestamps.
            </p>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Lyrics Scrollable Body */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden py-12 px-2 space-y-6 relative no-scrollbar"
        style={{ scrollBehavior: "smooth" }}
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-400 space-y-3">
            <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-mono text-neutral-300">Fetching synced lyrics from LRCLIB...</p>
          </div>
        ) : lines.length > 0 ? (
          lines.map((line, idx) => {
            const isActive = lyricsState.synced && idx === activeIndex;
            const isPast = lyricsState.synced && idx < activeIndex;
            const distance = Math.abs(idx - activeIndex);

            return (
              <motion.div
                key={`${idx}-${line.time}`}
                ref={isActive ? activeLineRef : null}
                onClick={() => lyricsState.synced && onSeek(line.time)}
                initial={{ opacity: 0, y: 10 }}
                animate={{
                  opacity: !lyricsState.synced
                    ? 0.75
                    : isActive
                    ? 1
                    : isPast
                    ? 0.35
                    : Math.max(0.2, 0.6 - distance * 0.1),
                  scale: isActive ? 1.05 : 0.98,
                  filter: !lyricsState.synced
                    ? "blur(0px)"
                    : isActive
                    ? "blur(0px)"
                    : distance > 3
                    ? "blur(2px)"
                    : "blur(0.5px)",
                  x: isActive ? 8 : 0
                }}
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
                className={`transition-all duration-300 text-left rounded-2xl p-2.5 ${
                  lyricsState.synced ? "cursor-pointer" : "cursor-default"
                } ${
                  isActive
                    ? "text-white font-bold text-2xl md:text-3xl leading-snug drop-shadow-[0_4px_16px_var(--primary-glow)]"
                    : "text-neutral-400 font-medium text-lg md:text-xl hover:text-neutral-200"
                }`}
              >
                {line.text}
              </motion.div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 px-6">
            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-neutral-500">
              <Music className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <p className="text-base font-semibold text-neutral-300">No Synced Lyrics Found</p>
              <p className="text-xs text-neutral-500 max-w-xs">
                Click the search icon above to query LRCLIB online with custom artist or track title.
              </p>
              <button
                onClick={() => setIsSearchOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/20 text-primary border border-primary/30 text-xs font-semibold hover:bg-primary/30 transition-all"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search LRCLIB Online</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Gradient Mask for top and bottom scroll fades */}
      <div className="pointer-events-none absolute top-12 left-0 right-0 h-16 bg-gradient-to-b from-[#0e1017] to-transparent z-10" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#0e1017] to-transparent z-10" />
    </div>
  );
};

export default LyricsDeck;
