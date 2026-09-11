import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Disc3, Disc, Sparkles, Image as ImageIcon } from "lucide-react";
import { Track, DeckMode } from "../types";
import { formatBitrate } from "../utils/formatters";

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
  onStartScratch?: () => void;
  onScratch?: (velocityDegPerSec: number, deltaAngle: number) => void;
  onEndScratch?: (spinUpMs?: number) => void;
  accentColor?: string;
  tracks?: Track[];
  onShufflePlay?: () => void;
  onOpenLibrary?: () => void;
}

const DECK_MODES: { id: DeckMode; label: string; icon: React.ReactNode }[] = [
  { id: "cover", label: "Cover", icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { id: "vinyl", label: "Vinyl", icon: <Disc3 className="w-3.5 h-3.5" /> },
  { id: "cd", label: "CD", icon: <Disc className="w-3.5 h-3.5" /> },
  { id: "minimal", label: "Zen", icon: <Sparkles className="w-3.5 h-3.5" /> },
];

export const VinylDeck: React.FC<VinylDeckProps> = React.memo(({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  deckMode,
  onSetDeckMode,
  onSetSpeed,
  onSeek,
  onStartScratch,
  onScratch,
  onEndScratch,
  accentColor,
  onOpenLibrary
}) => {
  const [isScratching, setIsScratching] = useState(false);
  const [scratchRpmDisplay, setScratchRpmDisplay] = useState<number>(0);
  const [tilt, setTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const platterRef = useRef<HTMLDivElement | null>(null);
  const cdDiscRef = useRef<HTMLDivElement | null>(null);
  const rotationAngleRef = useRef<number>(0);
  const cdAngleRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const scratchStartAngleRef = useRef<number>(0);
  const scratchCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const deckRef = useRef<HTMLDivElement>(null);

  // Scratch physics tracking
  const lastMoveTimeRef = useRef<number>(performance.now());
  const lastAngleRef = useRef<number>(0);
  const smoothVelocityRef = useRef<number>(0);
  const isScratchingRef = useRef<boolean>(false);

  // Real-time container dimensions observer for fluid dynamic scaling
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let rafId: number | null = null;
    const ro = new ResizeObserver(entries => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          const w = Math.round(width);
          const h = Math.round(height);
          if (w > 0 && h > 0) {
            setContainerSize(prev => {
              if (Math.abs(prev.width - w) < 3 && Math.abs(prev.height - h) < 3) return prev;
              return { width: w, height: h };
            });
          }
        }
      });
    });
    ro.observe(el);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  // High-performance DOM-level continuous rotation for Vinyl & CD (0 React re-renders while spinning!)
  useEffect(() => {
    let animId: number;

    const tick = (now: number) => {
      const delta = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      if (isPlaying && !isScratchingRef.current) {
        // 33.3 RPM is 200 deg/sec at 1.0x speed
        const speedMultiplier = playbackRate;
        const degPerSec = 200 * speedMultiplier;
        rotationAngleRef.current = (rotationAngleRef.current + degPerSec * delta) % 360;
        cdAngleRef.current = (cdAngleRef.current + (degPerSec * 1.5) * delta) % 360;

        if (platterRef.current) {
          platterRef.current.style.transform = `rotate(${rotationAngleRef.current}deg)`;
        }
        if (cdDiscRef.current) {
          cdDiscRef.current.style.transform = `rotate(${cdAngleRef.current}deg)`;
        }
      }

      animId = requestAnimationFrame(tick);
    };

    lastTimeRef.current = performance.now();
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, playbackRate]);

  // Tone arm angle for Vinyl only: 0deg = rested on cradle, 21deg to 37deg across the record
  const progressRatio = duration > 0 ? currentTime / duration : 0;
  const toneArmAngle = isPlaying ? 21 + progressRatio * 16 : 0;

  const coverUrl = currentTrack?.coverPath
    ? `/covers?path=${encodeURIComponent(currentTrack.coverPath)}`
    : currentTrack
    ? `/covers?artist=${encodeURIComponent(currentTrack.artist)}&album=${encodeURIComponent(currentTrack.album)}&title=${encodeURIComponent(currentTrack.title)}`
    : `/covers?accent=${encodeURIComponent(accentColor || "#38bdf8")}`;

  // Real-time dynamic dimensional scaling based on exact container dimensions
  const availableHeight = Math.max(containerSize.height - 270, 160);
  const availableWidth = Math.max(containerSize.width - 48, 160);

  // 1. Cover Mode (Album sleeve + peeking sliding vinyl assembly):
  const maxSleeveWidth = Math.floor(availableWidth / 1.44);
  const dynamicSleeveSize = Math.max(160, Math.min(availableHeight, maxSleeveWidth, 720));

  // 2. Vinyl Mode (Analog Turntable Platter):
  const dynamicPlatterSize = Math.max(200, Math.min(availableWidth * 0.94, availableHeight * 0.94, 720));

  // 3. CD Mode (Holographic Compact Disc Jewel Case):
  const dynamicCdSize = Math.max(180, Math.min(availableWidth / 1.45, availableHeight, 680));

  // 4. Zen Mode (Breathing Minimal Aura):
  const dynamicZenSize = Math.max(160, Math.min(availableWidth * 0.65, availableHeight * 0.65, 480));

  // 5. Responsive dynamic typography
  const titleFontSize = Math.max(16, Math.min(Math.round(containerSize.width * 0.032), 38));
  const subtitleFontSize = Math.max(11, Math.min(Math.round(containerSize.width * 0.015), 16));

  // Real-time DJ Vinyl Scratch handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (deckMode !== "vinyl") return;
    if (!deckRef.current) return;
    const rect = deckRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    scratchCenterRef.current = { x: centerX, y: centerY };

    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    scratchStartAngleRef.current = angle - rotationAngleRef.current;
    lastAngleRef.current = angle;
    lastMoveTimeRef.current = performance.now();
    smoothVelocityRef.current = 0;

    isScratchingRef.current = true;
    setIsScratching(true);
    setScratchRpmDisplay(0);
    onStartScratch?.();

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isScratchingRef.current) return;
    const now = performance.now();
    const dt = Math.max(0.005, (now - lastMoveTimeRef.current) / 1000);
    lastMoveTimeRef.current = now;

    const { x, y } = scratchCenterRef.current;
    const currentPointerAngle = Math.atan2(e.clientY - y, e.clientX - x) * (180 / Math.PI);

    let delta = currentPointerAngle - lastAngleRef.current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    lastAngleRef.current = currentPointerAngle;

    const instVelocity = delta / dt; // deg/sec
    smoothVelocityRef.current = smoothVelocityRef.current * 0.35 + instVelocity * 0.65;

    const currentRpm = Math.round(smoothVelocityRef.current / 6);
    setScratchRpmDisplay(currentRpm);

    const newRotAngle = rotationAngleRef.current + delta;
    rotationAngleRef.current = newRotAngle;

    if (platterRef.current) {
      platterRef.current.style.transform = `rotate(${newRotAngle}deg)`;
    }

    if (onScratch) {
      onScratch(smoothVelocityRef.current, delta);
    } else if (duration > 0 && Math.abs(delta) > 1) {
      const scrubTime = currentTime + (delta / 360) * 1.8;
      onSeek(Math.max(0, Math.min(scrubTime, duration)));
    }
  };

  const handlePointerUp = (_e: React.PointerEvent) => {
    if (isScratchingRef.current) {
      isScratchingRef.current = false;
      setIsScratching(false);
      setScratchRpmDisplay(0);
      onEndScratch?.(220);
    }
  };

  // 3D Card Hover for Cover mode
  const handleCoverMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: x * 12, y: -y * 12 });
  };

  const handleCoverMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  return (
    <div ref={containerRef} className="flex flex-col items-center justify-between h-full w-full p-4 md:p-6 select-none relative overflow-hidden">
      {/* Top Deck Mode Apple-Style Segmented Control */}
      <div className="w-full flex items-center justify-between z-20 shrink-0 mb-3 gap-3">
        <div className="flex items-center space-x-2 shrink-0">
          {currentTrack && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono text-neutral-300">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span>{currentTrack.format}</span>
              {currentTrack.sampleRate && (
                <span className="text-neutral-500 hidden sm:inline">• {(currentTrack.sampleRate / 1000).toFixed(1)}kHz</span>
              )}
            </div>
          )}
        </div>

        {/* Fluid Apple Segmented Pill Switcher */}
        <div className="flex items-center justify-end sm:justify-center shrink-0">
          <div className="flex bg-black/50 p-1 rounded-full border border-white/10 backdrop-blur-xl relative">
            {DECK_MODES.map(mode => {
              const isActive = deckMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => onSetDeckMode(mode.id)}
                  className={`relative px-3 sm:px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 active:scale-95 ${
                    isActive ? "text-white" : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-deck-pill"
                      transition={{ type: "spring", stiffness: 450, damping: 32 }}
                      className="absolute inset-0 rounded-full bg-white/20 border border-white/20 shadow-md backdrop-blur-md"
                    />
                  )}
                  <span className="relative z-10">{mode.icon}</span>
                  <span className="relative z-10">{mode.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Deck Hero Surface */}
      <div className="flex-1 w-full flex items-center justify-center relative my-auto min-h-0 overflow-hidden">

        {/* Dynamic Multi-Layer Full-Panel Ambient Canvas with Enhanced Dynamic Range */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
          <div 
            className={`absolute -top-1/4 -left-1/4 w-[90%] h-[90%] rounded-full blur-[160px] transform-gpu transition-all duration-1000 ${
              isPlaying ? "opacity-70 scale-110 animate-ambient-1" : "opacity-25 scale-95"
            }`}
            style={{
              background: "radial-gradient(circle, var(--ambient-1, var(--primary-glow)) 0%, transparent 70%)"
            }}
          />
          <div 
            className={`absolute -bottom-1/4 -right-1/4 w-[90%] h-[90%] rounded-full blur-[180px] transform-gpu transition-all duration-1000 ${
              isPlaying ? "opacity-65 scale-110 animate-ambient-2" : "opacity-25 scale-95"
            }`}
            style={{
              background: "radial-gradient(circle, var(--ambient-2, var(--secondary-glow)) 0%, transparent 70%)"
            }}
          />
          <div 
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-6xl h-[90%] rounded-full blur-[130px] transform-gpu transition-all duration-700 ${
              isPlaying ? "opacity-75 scale-105" : "opacity-30 scale-95"
            }`}
            style={{
              background: "radial-gradient(circle, var(--ambient-1, var(--primary-glow)) 0%, var(--ambient-2, var(--secondary-glow)) 45%, var(--ambient-3, transparent) 70%, transparent 85%)"
            }}
          />
        </div>

        {/* ─── MODE 1: SQUARE ALBUM COVER HERO ─── */}
        {deckMode === "cover" && currentTrack && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="relative flex flex-col items-center justify-center w-full max-w-5xl 2xl:max-w-6xl my-auto px-4 z-10 hero-surface"
          >
            {/* Sleeve + Peeking Vinyl Record Presentation (Fluid Dynamic Scaling & Centered Envelope) */}
            <div 
              className="relative flex items-center justify-center transition-all duration-300"
              onMouseMove={handleCoverMouseMove}
              onMouseLeave={handleCoverMouseLeave}
              style={{
                perspective: 1000,
                width: `${isPlaying ? Math.round(dynamicSleeveSize * 1.38) : dynamicSleeveSize}px`,
                height: `${dynamicSleeveSize}px`
              }}
            >
              {/* Vinyl Record that slides out smoothly from behind sleeve */}
              <div
                className={`absolute top-1/2 -translate-y-1/2 aspect-square rounded-full shadow-2xl z-0 pointer-events-none transition-all duration-700 ease-out ${
                  isPlaying 
                    ? "opacity-100 rotate-12" 
                    : "opacity-0 rotate-0"
                }`}
                style={{
                  width: `${Math.round(dynamicSleeveSize * 0.94)}px`,
                  height: `${Math.round(dynamicSleeveSize * 0.94)}px`,
                  right: isPlaying ? 0 : `${Math.round(dynamicSleeveSize * 0.03)}px`,
                  background: "radial-gradient(circle, #25252a 0%, #16161a 50%, #0a0a0c 100%)",
                  boxShadow: "0 25px 60px rgba(0,0,0,0.8), 0 0 35px rgba(0,0,0,0.6)",
                  border: "2px solid rgba(255,255,255,0.08)"
                }}
              >
                {/* Vinyl Grooves Texture */}
                <div className="absolute inset-0 rounded-full vinyl-grooves opacity-95" />
                {/* Dynamic Vinyl Sheen */}
                <div className="absolute inset-0 rounded-full vinyl-sheen opacity-80" />
                {/* Spinning Center Label with Album Artwork */}
                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[34%] aspect-square rounded-full overflow-hidden border-2 border-neutral-900 shadow-lg ${isPlaying ? "animate-spin-vinyl" : ""}`}>
                  <img src={coverUrl} alt="" className="w-full h-full object-cover select-none pointer-events-none" />
                  <div className="absolute inset-0 bg-black/15" />
                  {/* Spindle hole */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-neutral-950 border border-neutral-400/80 shadow-inner" />
                </div>
              </div>

              {/* Main Album Jacket Card Frame with 3D Tilt (Real-Time Proportional Size, 1:1 Square Lock) */}
              <motion.div
                style={{
                  width: `${dynamicSleeveSize}px`,
                  height: `${dynamicSleeveSize}px`,
                  rotateX: tilt.y,
                  rotateY: tilt.x,
                  transformStyle: "preserve-3d"
                }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className={`shrink-0 aspect-square rounded-3xl overflow-hidden shadow-2xl relative border border-white/15 bg-neutral-900 group z-10 transition-transform duration-700 ease-out ${
                  isPlaying ? "self-start" : ""
                }`}
              >
                <img
                  src={coverUrl}
                  alt={currentTrack?.album || "Cover"}
                  className="w-full h-full object-cover select-none pointer-events-none transition-transform duration-500 group-hover:scale-105"
                />
                {/* Glass sheen highlight */}
                <div className="absolute inset-0 bg-gradient-to-tr from-black/40 via-transparent to-white/10 pointer-events-none" />
              </motion.div>

              {/* Ambient Floor Shadow / Reflection */}
              <div 
                className={`absolute -bottom-8 left-1/2 -translate-x-1/2 h-14 rounded-full blur-2xl pointer-events-none transition-all duration-700 ${
                  isPlaying ? "opacity-80 scale-105" : "opacity-35 scale-95"
                }`}
                style={{
                  width: `${Math.round(dynamicSleeveSize * 1.1)}px`,
                  background: "radial-gradient(ellipse at center, var(--primary-glow, rgba(255,255,255,0.35)) 0%, rgba(0,0,0,0.9) 60%, transparent 80%)"
                }}
              />
            </div>

            {/* Prominent Studio Master Typography & Metadata (Fluid Dynamic Typography) */}
            <div className="mt-4 sm:mt-5 flex flex-col items-center text-center max-w-3xl w-full px-2 z-10 shrink-0">
                <h1 
                  style={{ fontSize: `${titleFontSize}px` }}
                  className="font-extrabold tracking-tight text-white drop-shadow-md truncate max-w-full leading-snug transition-all"
                >
                  {currentTrack.title}
                </h1>

                <div 
                  style={{ fontSize: `${subtitleFontSize}px` }}
                  className="flex items-center justify-center gap-2 mt-1.5 text-neutral-300 font-medium flex-wrap transition-all"
                >
                  <span 
                    onClick={onOpenLibrary}
                    className="hover:text-white transition-colors cursor-pointer"
                    title="View Artist in Library"
                  >
                    {currentTrack.artist || "Unknown Artist"}
                  </span>
                  {currentTrack.album && (
                    <>
                      <span className="text-neutral-500">•</span>
                      <span className="text-neutral-400 truncate max-w-[320px]">{currentTrack.album}</span>
                    </>
                  )}
                  {currentTrack.year && (
                    <>
                      <span className="text-neutral-500">•</span>
                      <span className="text-neutral-500 font-mono text-xs sm:text-sm">{currentTrack.year}</span>
                    </>
                  )}
                </div>

                {/* Studio Quality Specs Badges */}
                <div className="flex items-center justify-center gap-2 mt-3.5 flex-wrap">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-sm text-xs font-mono text-neutral-300">
                    <span className={`w-1.5 h-1.5 rounded-full ${isPlaying ? "bg-primary animate-pulse" : "bg-neutral-500"}`} />
                    <span className="font-bold text-white uppercase">{currentTrack.format || "FLAC"}</span>
                    {currentTrack.bitrate ? (
                      <>
                        <span className="text-neutral-600">•</span>
                        <span>{formatBitrate(currentTrack.bitrate)}</span>
                      </>
                    ) : null}
                    {currentTrack.sampleRate && (
                      <>
                        <span className="text-neutral-600">•</span>
                        <span>{(currentTrack.sampleRate / 1000).toFixed(1)} kHz</span>
                      </>
                    )}
                  </div>

                  {currentTrack.replayGain !== undefined && (
                    <div className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-neutral-400">
                      <span>{currentTrack.replayGain > 0 ? "+" : ""}{currentTrack.replayGain.toFixed(1)} dB</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
        )}

        {/* ─── MODE 2: ANALOG TURNTABLE (VINYL ONLY) ─── */}
        {deckMode === "vinyl" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            ref={deckRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              width: `${dynamicPlatterSize}px`,
              height: `${dynamicPlatterSize}px`
            }}
            className="relative aspect-square flex items-center justify-center cursor-grab active:cursor-grabbing my-auto transition-all duration-300"
          >
            {/* Real-time DJ Scratch HUD Indicator */}
            <AnimatePresence>
              {isScratching && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.85, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85, y: -10 }}
                  className="absolute -top-6 z-40 px-3.5 py-1 rounded-full bg-primary/95 text-white text-[11px] font-mono font-black tracking-wider flex items-center gap-1.5 shadow-2xl shadow-primary/50 border border-white/20 backdrop-blur-md"
                >
                  <span>
                    {scratchRpmDisplay === 0
                      ? "HOLD 0 RPM"
                      : scratchRpmDisplay > 0
                      ? `SCRATCH +${scratchRpmDisplay} RPM`
                      : `SCRATCH ${scratchRpmDisplay} RPM`}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Turntable Outer Chassis Plate */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-b from-neutral-900 via-neutral-950 to-black p-3.5 shadow-2xl border border-white/10">
              <div className="w-full h-full rounded-full bg-neutral-950/80 border border-white/5 flex items-center justify-center relative overflow-hidden">
                {/* Platter Strobe Dots Rim */}
                <div className="absolute inset-2 rounded-full border border-dashed border-neutral-700/40" />

                {/* Spinning Vinyl Record */}
                <div
                  ref={platterRef}
                  style={{
                    willChange: "transform",
                    transform: "rotate(0deg)"
                  }}
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
                        loading="lazy"
                        decoding="async"
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
              </div>
            </div>

            {/* Realistic Physical Tone-Arm (Proportionally scaled to platter) */}
            <div
              className="absolute pointer-events-none z-30 origin-top-right transition-transform duration-700 ease-out"
              style={{
                top: `${Math.round(dynamicPlatterSize * 0.015)}px`,
                right: `${Math.round(dynamicPlatterSize * 0.025)}px`,
                width: `${Math.round(dynamicPlatterSize * 0.28)}px`,
                height: `${Math.round(dynamicPlatterSize * 0.62)}px`,
                transform: `rotate(${isScratching ? toneArmAngle + (smoothVelocityRef.current / 300) : toneArmAngle}deg)`,
                transformOrigin: "85% 15%",
                willChange: "transform"
              }}
            >
              {/* Tone-Arm Base Pivot Gimbal */}
              <div 
                style={{
                  width: `${Math.max(28, Math.round(dynamicPlatterSize * 0.08))}px`,
                  height: `${Math.max(28, Math.round(dynamicPlatterSize * 0.08))}px`
                }}
                className="absolute top-4 right-3 rounded-full bg-gradient-to-b from-neutral-300 via-neutral-500 to-neutral-700 border border-white/40 shadow-xl flex items-center justify-center"
              >
                <div className="w-5 h-5 rounded-full bg-neutral-900 border border-neutral-400" />
              </div>

              {/* Tone-Arm Metallic Tube Shaft */}
              <div 
                style={{
                  height: `${Math.round(dynamicPlatterSize * 0.46)}px`
                }}
                className="absolute top-8 right-7 w-2 bg-gradient-to-r from-neutral-200 via-white to-neutral-400 rounded-full shadow-lg origin-top transform -rotate-12"
              >
                {/* Cartridge Head Shell & Stylus Needle */}
                <div className="absolute -bottom-3 -left-2 w-5 h-8 bg-neutral-900 rounded-sm border border-neutral-400 shadow-md transform rotate-12 flex flex-col items-center justify-end pb-0.5">
                  <div className="w-1 h-2 bg-red-500 rounded-full mb-0.5" />
                  <div className="w-0.5 h-1.5 bg-neutral-200" />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── MODE 3: HOLOGRAPHIC COMPACT DISC (NO NEEDLE / NO TONEARM!) ─── */}
        {deckMode === "cd" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            style={{
              width: `${dynamicCdSize}px`,
              height: `${dynamicCdSize}px`
            }}
            className="relative aspect-square flex items-center justify-center my-auto transition-all duration-300"
          >
            {/* Jewel Case Crystal Tray */}
            <div className="w-full h-full rounded-3xl bg-white/[0.03] border border-white/15 p-4 shadow-2xl backdrop-blur-2xl flex items-center justify-center relative overflow-hidden">
              {/* Laser Optical Scan Beam Indicator */}
              {isPlaying && (
                <div className="absolute inset-x-8 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent blur-[1px] animate-pulse pointer-events-none" />
              )}

              {/* Authentic Silver Optical Compact Disc */}
              <div
                ref={cdDiscRef}
                style={{ willChange: "transform", transform: "rotate(0deg)" }}
                className="w-[92%] h-[92%] rounded-full relative flex items-center justify-center cd-disc-surface cd-metallic-sheen overflow-hidden border border-white/40 shadow-2xl"
              >
                {/* Microgroove Data Tracks & Spiral Reflections */}
                <div className="absolute inset-2 rounded-full border border-slate-400/30 pointer-events-none" />
                <div className="absolute inset-6 rounded-full border border-slate-300/40 pointer-events-none" />
                <div className="absolute inset-10 rounded-full border border-slate-400/25 pointer-events-none" />
                <div className="absolute inset-14 rounded-full border border-slate-300/30 pointer-events-none" />
                <div className="absolute inset-20 rounded-full border border-slate-400/20 pointer-events-none" />

                {/* Anisotropic Light Sheen Layer */}
                <div className="absolute inset-0 rounded-full cd-hologram opacity-60 pointer-events-none" />

                {/* Transparent Inner Mirror Band / Stacking Ring (Clear Polycarbonate Area) */}
                <div className="w-[50%] h-[50%] rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/30 flex items-center justify-center shadow-inner relative">
                  {/* Outer Stacking Ring */}
                  <div className="absolute inset-2 rounded-full border border-white/20" />
                  
                  {/* Center Hub & Album Art Miniature */}
                  <div className="w-[66%] h-[66%] rounded-full p-1 bg-black/50 relative flex items-center justify-center border border-white/30 shadow-md">
                    <div className="w-full h-full rounded-full overflow-hidden relative shadow-sm">
                      <img
                        src={coverUrl}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/15" />
                    </div>

                    {/* Precision Center Spindle & Clamping Ring */}
                    <div className="absolute w-8 h-8 rounded-full bg-slate-900/90 border-2 border-white/60 flex items-center justify-center shadow-lg">
                      {/* Transparent Center Hole with Rim */}
                      <div className="w-3.5 h-3.5 rounded-full bg-neutral-950 border border-white/30 shadow-inner" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── MODE 4: ZEN MINIMAL (Fluid Scaling) ─── */}
        {deckMode === "minimal" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="w-full flex flex-col items-center justify-center text-center p-4 space-y-5 my-auto"
          >
            {/* Soft Ambient Album Aura */}
            <div 
              style={{
                width: `${dynamicZenSize}px`,
                height: `${dynamicZenSize}px`
              }}
              className="relative rounded-3xl overflow-hidden shadow-2xl border border-white/20 bg-black/40 backdrop-blur-xl transition-all duration-300"
            >
              <img
                src={coverUrl}
                alt={currentTrack?.album || "Cover"}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            </div>

            <div className="space-y-1.5 max-w-full">
              <h2 
                style={{ fontSize: `${Math.min(titleFontSize, 32)}px` }}
                className="font-extrabold text-white tracking-tight truncate transition-all"
              >
                {currentTrack ? currentTrack.title : "No Track Selected"}
              </h2>
              <p 
                style={{ fontSize: `${subtitleFontSize}px` }}
                className="font-medium text-neutral-300 truncate transition-all"
              >
                {currentTrack ? `${currentTrack.artist} • ${currentTrack.album}` : "Choose music from your library"}
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Bottom Pitch / Speed Controls (Only for Vinyl mode) */}
      <div className="w-full flex items-center justify-center z-20 shrink-0 mt-2">
        {deckMode === "vinyl" ? (
          <div className="flex items-center space-x-1.5 bg-black/50 px-3 py-1 rounded-full border border-white/10 backdrop-blur-md">
            <span className="text-[10px] font-mono text-neutral-400 uppercase">RPM</span>
            <button
              onClick={() => onSetSpeed(1.0)}
              className={`px-2 py-0.5 text-xs font-mono rounded-md font-bold transition-all active:scale-95 ${
                playbackRate === 1.0 ? "bg-white text-black shadow-sm" : "text-neutral-400 hover:text-white"
              }`}
            >
              33⅓
            </button>
            <button
              onClick={() => onSetSpeed(1.35)}
              className={`px-2 py-0.5 text-xs font-mono rounded-md font-bold transition-all active:scale-95 ${
                playbackRate === 1.35 ? "bg-white text-black shadow-sm" : "text-neutral-400 hover:text-white"
              }`}
            >
              45
            </button>
            <button
              onClick={() => onSetSpeed(0.85)}
              className={`px-2 py-0.5 text-xs font-mono rounded-md font-bold transition-all active:scale-95 ${
                playbackRate === 0.85 ? "bg-white text-black shadow-sm" : "text-neutral-400 hover:text-white"
              }`}
            >
              Slow
            </button>
          </div>
        ) : (
          <div className="h-6" />
        )}
      </div>
    </div>
  );
});
