import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Disc3, Disc, Sparkles, Gauge, Volume2 } from "lucide-react";
import { Track, DeckMode } from "../types";

interface VinylDeckProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  deckMode: DeckMode;
  onSetDeckMode: (mode: DeckMode) => void;
  onSetSpeed: (rate: number) => void;
  onSeek: (time: number) => void;
}

export const VinylDeck: React.FC<VinylDeckProps> = ({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  deckMode,
  onSetDeckMode,
  onSetSpeed,
  onSeek
}) => {
  const [rotationAngle, setRotationAngle] = useState(0);
  const [isScratching, setIsScratching] = useState(false);
  const lastTimeRef = useRef<number>(performance.now());
  const scratchStartAngleRef = useRef<number>(0);
  const scratchCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const deckRef = useRef<HTMLDivElement>(null);

  // Smooth continuous rotation preserving angle on pause
  useEffect(() => {
    let animId: number;

    const tick = (now: number) => {
      const delta = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      if (isPlaying && !isScratching) {
        // 33.3 RPM is approx 200 deg/sec at 1.0x speed
        const speedMultiplier = playbackRate;
        const degPerSec = 200 * speedMultiplier;
        setRotationAngle(prev => (prev + degPerSec * delta) % 360);
      }

      animId = requestAnimationFrame(tick);
    };

    lastTimeRef.current = performance.now();
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, isScratching, playbackRate]);

  // Tone arm angle: 0deg = rested on cradle, 20deg to 38deg across the vinyl record surface
  const progressRatio = duration > 0 ? currentTime / duration : 0;
  const toneArmAngle = isPlaying ? 21 + progressRatio * 16 : 0;

  const coverUrl = currentTrack?.coverPath
    ? `/covers?path=${encodeURIComponent(currentTrack.coverPath)}`
    : `/covers`;

  // Handle vinyl scratch / touch rotation
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!deckRef.current) return;
    const rect = deckRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    scratchCenterRef.current = { x: centerX, y: centerY };

    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    scratchStartAngleRef.current = angle - rotationAngle;
    setIsScratching(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isScratching) return;
    const { x, y } = scratchCenterRef.current;
    const currentPointerAngle = Math.atan2(e.clientY - y, e.clientX - x) * (180 / Math.PI);
    const newAngle = currentPointerAngle - scratchStartAngleRef.current;
    const delta = newAngle - rotationAngle;
    setRotationAngle(newAngle);

    // Scrub audio slightly based on rotation delta
    if (duration > 0 && Math.abs(delta) > 1) {
      const scrubTime = currentTime + (delta / 360) * 2;
      onSeek(Math.max(0, Math.min(scrubTime, duration)));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isScratching) {
      setIsScratching(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-between h-full w-full p-5 select-none relative">
      {/* Top Deck Mode Selector Bar */}
      <div className="w-full flex items-center justify-between z-20 mb-2">
        <div className="flex items-center space-x-2">
          <span className="text-xs uppercase tracking-wider font-semibold text-neutral-400 flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-primary" />
            Analog Turntable
          </span>
          {currentTrack && (
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-white/10 text-white/90 border border-white/10">
              {currentTrack.format} {currentTrack.sampleRate ? `${(currentTrack.sampleRate / 1000).toFixed(1)}kHz` : "Hi-Res"}
            </span>
          )}
        </div>

        {/* Deck Mode Toggle Pills */}
        <div className="flex bg-black/40 p-1 rounded-full border border-white/10 backdrop-blur-md">
          <button
            onClick={() => onSetDeckMode("vinyl")}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-all ${
              deckMode === "vinyl" ? "bg-white/20 text-white shadow-sm" : "text-neutral-400 hover:text-white"
            }`}
          >
            Vinyl LP
          </button>
          <button
            onClick={() => onSetDeckMode("cd")}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-all ${
              deckMode === "cd" ? "bg-white/20 text-white shadow-sm" : "text-neutral-400 hover:text-white"
            }`}
          >
            Holo CD
          </button>
          <button
            onClick={() => onSetDeckMode("minimal")}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-all ${
              deckMode === "minimal" ? "bg-white/20 text-white shadow-sm" : "text-neutral-400 hover:text-white"
            }`}
          >
            Glass Minimal
          </button>
        </div>
      </div>

      {/* Main Turntable Platter Area */}
      <div
        ref={deckRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative w-full aspect-square max-w-[360px] flex items-center justify-center cursor-grab active:cursor-grabbing my-auto"
      >
        {/* Turntable Outer Chassis Plate */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-neutral-900 via-neutral-950 to-black p-3 shadow-2xl border border-white/10">
          <div className="w-full h-full rounded-full bg-neutral-950/80 border border-white/5 flex items-center justify-center relative overflow-hidden">
            {/* Platter Strobe Dots Rim */}
            <div className="absolute inset-2 rounded-full border border-dashed border-neutral-700/40" />

            {/* Mode 1: Spinning Vinyl Record */}
            {deckMode === "vinyl" && (
              <div
                style={{ transform: `rotate(${rotationAngle}deg)` }}
                className="w-[90%] h-[90%] rounded-full bg-[#0a0a0d] shadow-2xl relative flex items-center justify-center vinyl-grooves overflow-hidden border border-neutral-800"
              >
                {/* Conic Light Reflection Sheen */}
                <div className="absolute inset-0 rounded-full vinyl-sheen pointer-events-none opacity-85" />

                {/* Center Vinyl Label Sticker */}
                <div className="w-[38%] h-[38%] rounded-full p-1 bg-gradient-to-tr from-neutral-800 to-neutral-700 shadow-inner relative flex items-center justify-center z-10 border-2 border-neutral-900">
                  <div className="w-full h-full rounded-full overflow-hidden relative shadow-md">
                    <img
                      src={coverUrl}
                      alt={currentTrack?.album || "Cover"}
                      className="w-full h-full object-cover select-none pointer-events-none"
                    />
                    <div className="absolute inset-0 bg-black/20" />
                  </div>

                  {/* Center Spindle Hole */}
                  <div className="absolute w-5 h-5 rounded-full bg-neutral-950 border-2 border-neutral-400/60 shadow-inner flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-black" />
                  </div>
                </div>
              </div>
            )}

            {/* Mode 2: Holographic CD Jewel Disc */}
            {deckMode === "cd" && (
              <div
                style={{ transform: `rotate(${rotationAngle}deg)` }}
                className="w-[90%] h-[90%] rounded-full bg-gradient-to-tr from-neutral-700 via-neutral-300 to-neutral-600 shadow-2xl relative flex items-center justify-center overflow-hidden border border-neutral-400"
              >
                {/* Holographic Prismatic Rainbow Sheen */}
                <div className="absolute inset-0 rounded-full cd-hologram opacity-90 mix-blend-color-dodge" />
                <div className="absolute inset-0 rounded-full vinyl-sheen opacity-70" />

                {/* Center CD Clear Plastic Hub */}
                <div className="w-[36%] h-[36%] rounded-full bg-neutral-900/60 backdrop-blur-md p-1 border-2 border-white/40 shadow-inner relative flex items-center justify-center z-10">
                  <div className="w-[60%] h-[60%] rounded-full overflow-hidden relative border border-white/20">
                    <img
                      src={coverUrl}
                      alt={currentTrack?.album || "Cover"}
                      className="w-full h-full object-cover select-none pointer-events-none"
                    />
                  </div>
                  {/* Spindle hole */}
                  <div className="absolute w-6 h-6 rounded-full bg-neutral-950 border border-neutral-300 flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-neutral-900" />
                  </div>
                </div>
              </div>
            )}

            {/* Mode 3: Glass Minimal */}
            {deckMode === "minimal" && (
              <div className="w-[88%] h-[88%] rounded-3xl overflow-hidden shadow-2xl relative flex items-center justify-center border border-white/15 bg-black/40 backdrop-blur-2xl">
                <img
                  src={coverUrl}
                  alt={currentTrack?.album || "Cover"}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                {isPlaying && (
                  <div className="absolute bottom-4 left-4 flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-xs font-mono tracking-wider text-white uppercase font-bold">Live Deck</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Realistic Physical Tone-Arm (Only in Vinyl & CD mode) */}
        {deckMode !== "minimal" && (
          <div
            className="absolute top-2 right-4 w-28 h-64 pointer-events-none z-30 origin-top-right transition-transform duration-700 ease-out"
            style={{
              transform: `rotate(${toneArmAngle}deg)`,
              transformOrigin: "85% 15%"
            }}
          >
            {/* Tone-Arm Base Pivot Gimbal */}
            <div className="absolute top-4 right-3 w-10 h-10 rounded-full bg-gradient-to-b from-neutral-300 via-neutral-500 to-neutral-700 border border-white/40 shadow-xl flex items-center justify-center">
              <div className="w-5 h-5 rounded-full bg-neutral-900 border border-neutral-400" />
            </div>

            {/* Tone-Arm Metallic Tube Shaft */}
            <div className="absolute top-8 right-7 w-1.5 h-44 bg-gradient-to-r from-neutral-200 via-white to-neutral-400 rounded-full shadow-lg origin-top transform -rotate-12">
              {/* Cartridge Head Shell & Stylus Needle */}
              <div className="absolute -bottom-3 -left-2 w-5 h-8 bg-neutral-900 rounded-sm border border-neutral-400 shadow-md transform rotate-12 flex flex-col items-center justify-end pb-0.5">
                <div className="w-1 h-2 bg-red-500 rounded-full mb-0.5" />
                <div className="w-0.5 h-1.5 bg-neutral-200" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Turntable Bottom Deck Controls */}
      <div className="w-full flex items-center justify-between z-20 mt-2 px-1">
        {/* Speed / RPM Selector */}
        <div className="flex items-center space-x-1.5 bg-black/40 px-3 py-1.5 rounded-full border border-white/10">
          <span className="text-[11px] font-mono text-neutral-400 uppercase">RPM:</span>
          <button
            onClick={() => onSetSpeed(1.0)}
            className={`px-2 py-0.5 text-xs font-mono rounded-md font-bold transition-colors ${
              playbackRate === 1.0 ? "bg-white text-black" : "text-neutral-400 hover:text-white"
            }`}
          >
            33⅓
          </button>
          <button
            onClick={() => onSetSpeed(1.35)}
            className={`px-2 py-0.5 text-xs font-mono rounded-md font-bold transition-colors ${
              playbackRate === 1.35 ? "bg-white text-black" : "text-neutral-400 hover:text-white"
            }`}
          >
            45
          </button>
          <button
            onClick={() => onSetSpeed(0.85)}
            className={`px-2 py-0.5 text-xs font-mono rounded-md font-bold transition-colors ${
              playbackRate === 0.85 ? "bg-white text-black" : "text-neutral-400 hover:text-white"
            }`}
          >
            Slow
          </button>
        </div>

        {/* Scratch Drag Hint */}
        <div className="text-[11px] font-medium text-neutral-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
          <span>Interactive Vinyl Scratch</span>
        </div>
      </div>
    </div>
  );
};
