import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic2, Music, Sparkles, AlertCircle } from "lucide-react";
import { Track, LyricLine } from "../types";

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
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [isSynced, setIsSynced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Fetch lyrics whenever track changes
  useEffect(() => {
    if (!currentTrack) {
      setLyrics([]);
      return;
    }

    setIsLoading(true);
    fetch(`/api/lyrics?path=${encodeURIComponent(currentTrack.filePath)}`)
      .then(res => res.json())
      .then(data => {
        setIsSynced(!!data.synced);
        setLyrics(data.lines || []);
      })
      .catch(err => {
        console.error("Failed to load lyrics:", err);
        setLyrics([]);
      })
      .finally(() => setIsLoading(false));
  }, [currentTrack]);

  // Find active line index based on currentTime
  let activeIndex = -1;
  if (lyrics.length > 0) {
    for (let i = 0; i < lyrics.length; i++) {
      if (currentTime >= lyrics[i].time) {
        if (i === lyrics.length - 1 || currentTime < lyrics[i + 1].time) {
          activeIndex = i;
          break;
        }
      }
    }
  }

  // Smooth scroll active line to center
  useEffect(() => {
    if (activeLineRef.current && scrollContainerRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }
  }, [activeIndex]);

  return (
    <div className="flex flex-col h-full w-full p-6 select-none relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between z-10 pb-4 border-b border-white/5">
        <div className="flex items-center space-x-2">
          <Mic2 className="w-4 h-4 text-primary" />
          <span className="text-xs uppercase tracking-wider font-semibold text-neutral-300">
            Karaoke Lyrics Deck
          </span>
        </div>
        {isSynced && (
          <span className="flex items-center gap-1.5 text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Time-Synced
          </span>
        )}
      </div>

      {/* Lyrics Scrollable Body */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden py-12 px-2 space-y-6 relative no-scrollbar"
        style={{ scrollBehavior: "smooth" }}
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-500 space-y-3">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-mono">Loading synchronized lyrics...</p>
          </div>
        ) : lyrics.length > 0 ? (
          lyrics.map((line, idx) => {
            const isActive = idx === activeIndex;
            const isPast = idx < activeIndex;
            const distance = Math.abs(idx - activeIndex);

            return (
              <motion.div
                key={`${idx}-${line.time}`}
                ref={isActive ? activeLineRef : null}
                onClick={() => onSeek(line.time)}
                initial={{ opacity: 0, y: 10 }}
                animate={{
                  opacity: isActive ? 1 : isPast ? 0.35 : Math.max(0.2, 0.6 - distance * 0.1),
                  scale: isActive ? 1.05 : 0.98,
                  filter: isActive ? "blur(0px)" : distance > 3 ? "blur(2px)" : "blur(0.5px)",
                  x: isActive ? 8 : 0
                }}
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
                className={`cursor-pointer transition-all duration-300 text-left rounded-2xl p-2.5 ${
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
            <div className="space-y-1">
              <p className="text-base font-semibold text-neutral-300">No Synced Lyrics Available</p>
              <p className="text-xs text-neutral-500 max-w-xs">
                Enjoy the instrumental journey or place a <code className="text-primary font-mono">.lrc</code> file in the album folder to sync lyrics automatically.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Floating Gradient Mask for top and bottom scroll fades */}
      <div className="pointer-events-none absolute top-14 left-0 right-0 h-16 bg-gradient-to-b from-[#0e1017] to-transparent z-10" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#0e1017] to-transparent z-10" />
    </div>
  );
};
