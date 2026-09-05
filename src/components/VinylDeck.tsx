import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Disc3, Disc, Sparkles, Image as ImageIcon, Shuffle, FolderOpen } from "lucide-react";
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
  tracks = [],
  onShufflePlay,
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
    <div className="flex flex-col items-center justify-between h-full w-full p-4 md:p-6 select-none relative overflow-hidden">
      {/* Top Deck Mode Apple-Style Segmented Control */}
      <div className="w-full grid grid-cols-3 items-center z-20 shrink-0 mb-3">
        <div className="flex items-center space-x-2">
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

        {/* Fluid Apple Segmented Pill Switcher Centered */}
        <div className="flex justify-center">
          <div className="flex bg-black/50 p-1 rounded-full border border-white/10 backdrop-blur-xl relative">
            {DECK_MODES.map(mode => {
              const isActive = deckMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => onSetDeckMode(mode.id)}
                  className={`relative px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 active:scale-95 ${
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

        <div className="flex items-center justify-end" />
      </div>

      {/* Main Deck Hero Surface */}
      <div className="flex-1 w-full flex items-center justify-center relative my-auto min-h-0">

        {/* Ambient Reactive Bloom / Underglow matching artwork colors */}
        <div 
          className={`absolute w-[320px] h-[320px] sm:w-[380px] sm:h-[380px] lg:w-[500px] lg:h-[500px] xl:w-[600px] xl:h-[600px] 2xl:w-[700px] 2xl:h-[700px] rounded-full pointer-events-none transition-all duration-700 blur-3xl transform-gpu ${
            isPlaying ? "opacity-60 scale-105" : "opacity-30 scale-95"
          }`}
          style={{
            background: "radial-gradient(circle, var(--primary-glow, rgba(255,255,255,0.25)) 0%, var(--secondary-glow, rgba(56,189,248,0.15)) 45%, transparent 72%)",
            filter: "blur(50px)",
            willChange: "transform, opacity",
          }}
        />

        {/* ─── MODE 1: SQUARE ALBUM COVER HERO OR WELCOME LAUNCHPAD ─── */}
        {deckMode === "cover" && (
          !currentTrack ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -12 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
              className="relative flex flex-col items-center justify-center max-w-[480px] w-full p-6 md:p-8 rounded-3xl bg-neutral-900/60 border border-white/10 shadow-2xl backdrop-blur-2xl text-center space-y-6"
            >
              {/* Pulsing Concentric Audio Rings */}
              <div className="relative flex items-center justify-center my-2">
                <div className="absolute w-24 h-24 rounded-full bg-primary/20 animate-ping opacity-30" />
                <div className="absolute w-20 h-20 rounded-full bg-primary/30 blur-md" />
                <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary to-sky-400 p-0.5 shadow-xl shadow-primary/30 flex items-center justify-center">
                  <div className="w-full h-full rounded-[14px] bg-neutral-950 flex items-center justify-center">
                    <Disc3 className="w-8 h-8 text-primary animate-spin" style={{ animationDuration: "8s" }} />
                  </div>
                </div>
              </div>

              {/* Welcome Title & Subtitle */}
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono uppercase tracking-widest text-primary font-semibold">
                  <Sparkles className="w-3 h-3 text-primary" />
                  <span>Studio Sound Engine v2.1</span>
                </div>
                <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
                  Welcome to Cadence
                </h2>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
                  High-fidelity audio reproduction, real-time synchronized karaoke lyrics, and studio master acoustics.
                </p>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs justify-center">
                {onShufflePlay && (
                  <button
                    onClick={onShufflePlay}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-primary to-sky-500 hover:from-primary/90 hover:to-sky-400 text-white text-xs font-bold shadow-lg shadow-primary/25 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <Shuffle className="w-4 h-4" />
                    <span>Shuffle All {tracks && tracks.length > 0 ? `(${tracks.length})` : ""}</span>
                  </button>
                )}

                {onOpenLibrary && (
                  <button
                    onClick={onOpenLibrary}
                    className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-semibold hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <FolderOpen className="w-4 h-4 text-neutral-300" />
                    <span>Explore Library</span>
                  </button>
                )}
              </div>

              {/* Feature Badges */}
              <div className="pt-2 border-t border-white/5 w-full flex flex-wrap items-center justify-center gap-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/5 text-neutral-400 border border-white/5">
                  32-Bit Floating DSP
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/5 text-neutral-400 border border-white/5">
                  Synced Lyrics
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/5 text-neutral-400 border border-white/5">
                  Analog Decks
                </span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="relative flex flex-col items-center justify-center max-w-[360px] md:max-w-[440px] lg:max-w-[520px] xl:max-w-[620px] 2xl:max-w-[700px] w-full aspect-square"
              onMouseMove={handleCoverMouseMove}
              onMouseLeave={handleCoverMouseLeave}
              style={{ perspective: 1000 }}
            >
              {/* Main Pristine Cover Card Frame */}
              <motion.div
                style={{
                  rotateX: tilt.y,
                  rotateY: tilt.x,
                  transformStyle: "preserve-3d"
                }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="w-full h-full rounded-3xl overflow-hidden shadow-2xl relative border border-white/15 bg-neutral-900 group"
              >
                <img
                  src={coverUrl}
                  alt={currentTrack?.album || "Cover"}
                  className="w-full h-full object-cover select-none pointer-events-none transition-transform duration-500 group-hover:scale-105"
                />

                {/* Glass sheen highlight */}
                <div className="absolute inset-0 bg-gradient-to-tr from-black/40 via-transparent to-white/10 pointer-events-none" />
              </motion.div>
            </motion.div>
          )
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
            className="relative w-full aspect-square max-w-[360px] md:max-w-[420px] lg:max-w-[480px] xl:max-w-[540px] 2xl:max-w-[620px] flex items-center justify-center cursor-grab active:cursor-grabbing my-auto"
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
            <div className="absolute inset-0 rounded-full bg-gradient-to-b from-neutral-900 via-neutral-950 to-black p-3 shadow-2xl border border-white/10">
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

            {/* Realistic Physical Tone-Arm (ONLY rendered in Vinyl mode!) */}
            <div
              className="absolute top-2 right-4 w-28 h-64 pointer-events-none z-30 origin-top-right transition-transform duration-700 ease-out"
              style={{
                transform: `rotate(${isScratching ? toneArmAngle + (smoothVelocityRef.current / 300) : toneArmAngle}deg)`,
                transformOrigin: "85% 15%",
                willChange: "transform"
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
          </motion.div>
        )}

        {/* ─── MODE 3: HOLOGRAPHIC COMPACT DISC (NO NEEDLE / NO TONEARM!) ─── */}
        {deckMode === "cd" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="relative w-full aspect-square max-w-[340px] md:max-w-[420px] lg:max-w-[500px] xl:max-w-[580px] 2xl:max-w-[660px] flex items-center justify-center my-auto"
          >
            {/* Jewel Case Crystal Tray */}
            <div className="w-full h-full rounded-3xl bg-white/[0.03] border border-white/15 p-4 shadow-2xl backdrop-blur-2xl flex items-center justify-center relative overflow-hidden">
              {/* Laser Optical Scan Beam Indicator */}
              {isPlaying && (
                <div className="absolute inset-x-8 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent blur-[1px] animate-pulse pointer-events-none" />
              )}

              {/* Holographic Spinning CD Disc */}
              <div
                ref={cdDiscRef}
                style={{ willChange: "transform" }}
                className="w-[92%] h-[92%] rounded-full bg-gradient-to-tr from-neutral-600 via-neutral-200 to-neutral-500 shadow-2xl relative flex items-center justify-center overflow-hidden border border-neutral-300"
              >
                {/* Holographic Prismatic Rainbow Sheen */}
                <div className="absolute inset-0 rounded-full cd-hologram opacity-90 mix-blend-color-dodge pointer-events-none" />
                <div className="absolute inset-0 rounded-full vinyl-sheen opacity-60 pointer-events-none" />

                {/* Center CD Clear Plastic Acrylic Hub */}
                <div className="w-[36%] h-[36%] rounded-full bg-black/60 backdrop-blur-md p-1 border-2 border-white/50 shadow-inner relative flex items-center justify-center z-10">
                  <div className="w-[62%] h-[62%] rounded-full overflow-hidden relative border border-white/30">
                    <img
                      src={coverUrl}
                      alt={currentTrack?.album || "Cover"}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover select-none pointer-events-none"
                    />
                  </div>
                  {/* Spindle hole */}
                  <div className="absolute w-5 h-5 rounded-full bg-neutral-950 border border-neutral-300 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-neutral-800" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── MODE 4: MINIMAL ZEN MODE ─── */}
        {deckMode === "minimal" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="w-full max-w-[420px] md:max-w-[500px] lg:max-w-[620px] flex flex-col items-center justify-center text-center p-6 space-y-4"
          >
            {/* Soft Ambient Album Aura */}
            <div className="relative w-44 h-44 rounded-3xl overflow-hidden shadow-2xl border border-white/20 bg-black/40 backdrop-blur-xl">
              <img
                src={coverUrl}
                alt={currentTrack?.album || "Cover"}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            </div>

            <div className="space-y-1 max-w-full">
              <h2 className="text-xl font-bold text-white tracking-tight truncate">
                {currentTrack ? currentTrack.title : "No Track Selected"}
              </h2>
              <p className="text-sm font-medium text-neutral-400 truncate">
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
