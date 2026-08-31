import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Sliders,
  Disc3
} from "lucide-react";
import { Track, PlayerBarPosition } from "../types";

interface ControlBarProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isShuffle: boolean;
  repeatMode: "off" | "all" | "one";
  isEqualizerOpen: boolean;
  position?: PlayerBarPosition;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onSetVolume: (vol: number) => void;
  onToggleMute: () => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onToggleEqualizer: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  isShuffle,
  repeatMode,
  isEqualizerOpen,
  position = "bottom",
  onTogglePlay,
  onPrevious,
  onNext,
  onSeek,
  onSetVolume,
  onToggleMute,
  onToggleShuffle,
  onToggleRepeat,
  onToggleEqualizer
}) => {
  const [hoverSeekTime, setHoverSeekTime] = useState<number | null>(null);

  const formatSeconds = (sec: number) => {
    if (isNaN(sec) || sec < 0) return "0:00";
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}:${s.toString().padStart(2, "0")}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * duration);
  };

  const handleTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    setHoverSeekTime(ratio * duration);
  };

  const coverUrl = currentTrack?.coverPath
    ? `/covers?path=${encodeURIComponent(currentTrack.coverPath)}`
    : `/covers`;

  // ─── LEFT SIDEBAR POSITION ───
  if (position === "left") {
    return (
      <div className="h-full w-20 flex flex-col items-center justify-between py-4 px-2 bg-neutral-950/90 border-r border-white/10 backdrop-blur-2xl z-30 shrink-0 select-none">
        {/* Top: Mini Art */}
        <div className="relative w-12 h-12 rounded-2xl overflow-hidden bg-black/60 border border-white/15 shadow-md">
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
          {isPlaying && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <Disc3 className="w-5 h-5 text-white animate-spin" />
            </div>
          )}
        </div>

        {/* Center: Playback Controls */}
        <div className="flex flex-col items-center space-y-3">
          <button
            onClick={onToggleShuffle}
            className={`p-2 rounded-full transition-colors ${
              isShuffle ? "text-primary bg-white/15" : "text-neutral-400 hover:text-white"
            }`}
            title="Shuffle"
          >
            <Shuffle className="w-4 h-4" />
          </button>

          <button
            onClick={onPrevious}
            className="p-2 rounded-full text-neutral-300 hover:text-white active:scale-90 transition-all"
            title="Previous"
          >
            <SkipBack className="w-4 h-4 fill-current" />
          </button>

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onTogglePlay}
            className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-black" />
            ) : (
              <Play className="w-4 h-4 fill-black ml-0.5" />
            )}
          </motion.button>

          <button
            onClick={onNext}
            className="p-2 rounded-full text-neutral-300 hover:text-white active:scale-90 transition-all"
            title="Next"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>

          <button
            onClick={onToggleRepeat}
            className={`p-2 rounded-full transition-colors ${
              repeatMode !== "off" ? "text-primary bg-white/15" : "text-neutral-400 hover:text-white"
            }`}
            title="Repeat"
          >
            {repeatMode === "one" ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
          </button>
        </div>

        {/* Bottom: EQ & Volume */}
        <div className="flex flex-col items-center space-y-2">
          <button
            onClick={onToggleEqualizer}
            className={`p-2 rounded-full border transition-all ${
              isEqualizerOpen
                ? "bg-white/20 text-white border-white/30"
                : "bg-white/5 text-neutral-400 hover:text-white border-white/10"
            }`}
            title="Equalizer"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onToggleMute}
            className="p-2 rounded-full text-neutral-400 hover:text-white transition-colors"
            title={isMuted || volume === 0 ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    );
  }

  // ─── HORIZONTAL (BOTTOM OR TOP) POSITION ───
  return (
    <div className={`w-full max-w-7xl mx-auto px-4 md:px-6 ${position === "top" ? "pt-1 pb-3" : "py-3"} z-30 select-none`}>
      <div className="glass-panel rounded-full px-5 py-2.5 md:py-3 flex items-center justify-between shadow-2xl border border-white/10 bg-neutral-950/80 backdrop-blur-2xl">
        {/* Left: Track Info & Mini Art */}
        <div className="flex items-center space-x-3 w-64 md:w-72 min-w-0">
          <div className="relative w-11 h-11 rounded-2xl overflow-hidden bg-black/40 border border-white/10 shrink-0 shadow-md">
            <img src={coverUrl} alt="" className="w-full h-full object-cover" />
            {isPlaying && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <Disc3 className="w-5 h-5 text-white animate-spin" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs md:text-sm font-bold text-white tracking-tight truncate">
                {currentTrack?.title || "No track selected"}
              </h4>
              {currentTrack && (
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-white/90 border border-white/10 uppercase font-semibold shrink-0">
                  {currentTrack.format}
                </span>
              )}
            </div>
            <p className="text-[11px] text-neutral-400 tracking-tight truncate">
              {currentTrack ? `${currentTrack.artist} — ${currentTrack.album}` : "Select music to play"}
            </p>
          </div>
        </div>

        {/* Center: Playback Controls & Progress Scrubber */}
        <div className="flex-1 max-w-2xl px-4 md:px-6 flex flex-col items-center space-y-1">
          {/* Action Buttons */}
          <div className="flex items-center space-x-3 md:space-x-4">
            <button
              onClick={onToggleShuffle}
              className={`p-1.5 rounded-full transition-colors active:scale-90 ${
                isShuffle ? "text-primary bg-white/15" : "text-neutral-400 hover:text-white"
              }`}
              title="Shuffle"
            >
              <Shuffle className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onPrevious}
              className="p-1.5 rounded-full text-neutral-300 hover:text-white hover:bg-white/10 active:scale-90 transition-all"
              title="Previous"
            >
              <SkipBack className="w-4 h-4 md:w-5 md:h-5 fill-current" />
            </button>

            {/* Play/Pause Main Button with Apple Tactile Spring */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={onTogglePlay}
              className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 md:w-5 md:h-5 fill-black" />
              ) : (
                <Play className="w-4 h-4 md:w-5 md:h-5 fill-black ml-0.5" />
              )}
            </motion.button>

            <button
              onClick={onNext}
              className="p-1.5 rounded-full text-neutral-300 hover:text-white hover:bg-white/10 active:scale-90 transition-all"
              title="Next"
            >
              <SkipForward className="w-4 h-4 md:w-5 md:h-5 fill-current" />
            </button>

            <button
              onClick={onToggleRepeat}
              className={`p-1.5 rounded-full transition-colors active:scale-90 ${
                repeatMode !== "off" ? "text-primary bg-white/15" : "text-neutral-400 hover:text-white"
              }`}
              title="Repeat"
            >
              {repeatMode === "one" ? <Repeat1 className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Timeline Scrubber */}
          <div className="w-full flex items-center space-x-2.5 text-[10px] md:text-[11px] font-mono text-neutral-400">
            <span className="w-9 text-right">{formatSeconds(currentTime)}</span>

            <div
              onClick={handleTimelineClick}
              onMouseMove={handleTimelineMouseMove}
              onMouseLeave={() => setHoverSeekTime(null)}
              className="relative flex-1 h-2 rounded-full bg-white/10 cursor-pointer group flex items-center"
            >
              {/* Progress bar */}
              <div
                style={{ width: `${progressPercent}%` }}
                className="h-full rounded-full bg-gradient-to-r from-primary to-neutral-200 relative"
              >
                {/* Scrub handle dot */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              {/* Hover tooltip */}
              {hoverSeekTime !== null && (
                <div
                  style={{
                    left: `${(hoverSeekTime / (duration || 1)) * 100}%`
                  }}
                  className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded bg-black/90 text-[10px] font-mono text-white border border-white/20 pointer-events-none shadow-md backdrop-blur-md"
                >
                  {formatSeconds(hoverSeekTime)}
                </div>
              )}
            </div>

            <span className="w-9 text-left">{formatSeconds(duration)}</span>
          </div>
        </div>

        {/* Right: Volume & DSP Equalizer */}
        <div className="flex items-center space-x-2.5 w-64 md:w-72 justify-end">
          {/* Equalizer Toggle */}
          <button
            onClick={onToggleEqualizer}
            className={`p-2 rounded-full border transition-all active:scale-95 ${
              isEqualizerOpen
                ? "bg-white/20 text-white border-white/30"
                : "bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white border-white/10"
            }`}
            title="Equalizer"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>

          {/* Volume Slider */}
          <div className="flex items-center space-x-2 bg-black/40 px-2.5 py-1 rounded-full border border-white/10">
            <button
              onClick={onToggleMute}
              className="text-neutral-400 hover:text-white transition-colors"
              title={isMuted || volume === 0 ? "Unmute" : "Mute"}
            >
              {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={e => onSetVolume(parseFloat(e.target.value))}
              className="w-16 md:w-20 h-1 accent-white bg-neutral-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
