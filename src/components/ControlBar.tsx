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
  Mic2,
  Maximize2,
  Minimize2,
  Disc3,
  ListMusic
} from "lucide-react";
import { Track } from "../types";

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

  return (
    <div className="w-full max-w-7xl mx-auto px-6 py-3">
      <div className="glass-panel rounded-full px-6 py-3 flex items-center justify-between shadow-2xl border border-white/10 bg-neutral-950/80 backdrop-blur-2xl">
        {/* Left: Track Info & Mini Art */}
        <div className="flex items-center space-x-3.5 w-72 min-w-0">
          <div className="relative w-12 h-12 rounded-2xl overflow-hidden bg-black/40 border border-white/10 shrink-0 shadow-md">
            <img src={coverUrl} alt="" className="w-full h-full object-cover" />
            {isPlaying && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <Disc3 className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-bold text-white truncate">{currentTrack?.title || "No track selected"}</h4>
              {currentTrack && (
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-primary/20 text-primary border border-primary/30 uppercase font-bold shrink-0">
                  {currentTrack.format}
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-400 truncate">
              {currentTrack ? `${currentTrack.artist} — ${currentTrack.album}` : "Select a track to play"}
            </p>
          </div>
        </div>

        {/* Center: Playback Controls & Progress Scrubber */}
        <div className="flex-1 max-w-2xl px-6 flex flex-col items-center space-y-1.5">
          {/* Action Buttons */}
          <div className="flex items-center space-x-4">
            <button
              onClick={onToggleShuffle}
              className={`p-2 rounded-full transition-colors ${
                isShuffle ? "text-primary bg-primary/15" : "text-neutral-400 hover:text-white"
              }`}
              title="Shuffle"
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              onClick={onPrevious}
              className="p-2 rounded-full text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
              title="Previous Track"
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>

            {/* Play/Pause Main Button */}
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={onTogglePlay}
              className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-black" />
              ) : (
                <Play className="w-5 h-5 fill-black ml-0.5" />
              )}
            </motion.button>

            <button
              onClick={onNext}
              className="p-2 rounded-full text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
              title="Next Track"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>

            <button
              onClick={onToggleRepeat}
              className={`p-2 rounded-full transition-colors ${
                repeatMode !== "off" ? "text-primary bg-primary/15" : "text-neutral-400 hover:text-white"
              }`}
              title={`Repeat: ${repeatMode}`}
            >
              {repeatMode === "one" ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
            </button>
          </div>

          {/* Timeline Scrubber */}
          <div className="w-full flex items-center space-x-3 text-[11px] font-mono text-neutral-400">
            <span className="w-10 text-right">{formatSeconds(currentTime)}</span>

            <div
              onClick={handleTimelineClick}
              onMouseMove={handleTimelineMouseMove}
              onMouseLeave={() => setHoverSeekTime(null)}
              className="relative flex-1 h-2 rounded-full bg-white/10 cursor-pointer group flex items-center"
            >
              {/* Progress bar */}
              <div
                style={{ width: `${progressPercent}%` }}
                className="h-full rounded-full bg-gradient-to-r from-primary to-blue-400 relative"
              >
                {/* Scrub handle dot */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              {/* Hover tooltip */}
              {hoverSeekTime !== null && (
                <div
                  style={{
                    left: `${(hoverSeekTime / (duration || 1)) * 100}%`
                  }}
                  className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white border border-white/20 pointer-events-none"
                >
                  {formatSeconds(hoverSeekTime)}
                </div>
              )}
            </div>

            <span className="w-10 text-left">{formatSeconds(duration)}</span>
          </div>
        </div>

        {/* Right: Volume & DSP Equalizer */}
        <div className="flex items-center space-x-3 w-72 justify-end">
          {/* Equalizer Toggle */}
          <button
            onClick={onToggleEqualizer}
            className={`p-2.5 rounded-full border transition-all ${
              isEqualizerOpen
                ? "bg-primary/20 text-primary border-primary/40"
                : "bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white border-white/10"
            }`}
            title="10-Band Graphic Studio Equalizer"
          >
            <Sliders className="w-4 h-4" />
          </button>

          {/* Volume Slider */}
          <div className="flex items-center space-x-2 bg-black/40 px-3 py-1.5 rounded-full border border-white/10">
            <button
              onClick={onToggleMute}
              className="text-neutral-400 hover:text-white transition-colors"
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={e => onSetVolume(parseFloat(e.target.value))}
              className="w-20 h-1.5 accent-primary bg-neutral-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
