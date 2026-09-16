import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Disc3,
  Play,
  Pause,
  Music2,
  ChevronDown
} from "lucide-react";
import type { Track } from "../types";
import type { DDJ400State } from "../services/midi/ddj400";

export interface DDJ400AddonProps {
  isOpen: boolean;
  onClose: () => void;
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  baseBpm: number;
  currentBpm: number;
  pitchPercent: number;
  pitchRange: 6 | 10 | 16 | 50;
  keyLock: boolean;
  colorFilter: number;
  hotCues: (number | null)[];
  beatLoop: { active: boolean; start: number; end: number; beats: number };
  eqGains: number[];
  volume: number;
  ddjState: DDJ400State;
  onPlayPause: () => void;
  onCue: () => void;
  onStartScratch: () => void;
  onScratch: (velocity: number, deltaAngle: number) => void;
  onEndScratch: (spinUpMs?: number) => void;
  onSetPitchPercent: (percent: number) => void;
  onSetPitchRange: (range: 6 | 10 | 16 | 50) => void;
  onSetKeyLock: (locked: boolean) => void;
  onNudgePitch: (delta: number) => void;
  onResetPitch: () => void;
  onSetColorFilter: (val: number) => void;
  onTriggerHotCue: (index: number) => void;
  onClearHotCue: (index: number) => void;
  onSetBeatLoop: (beats: number) => void;
  onExitLoop: () => void;
  onSetVolume: (vol: number) => void;
  onSetEqGains: (gains: number[]) => void;
  onSeek: (seconds: number) => void;
  getFrequencyData?: () => Uint8Array;
}

type PadMode = "hotcue" | "loop" | "jump" | "sampler";

export const DDJ400AddonDrawer: React.FC<DDJ400AddonProps> = ({
  isOpen,
  onClose,
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  baseBpm,
  currentBpm,
  pitchPercent,
  pitchRange,
  keyLock,
  colorFilter,
  hotCues,
  beatLoop,
  eqGains,
  volume,
  ddjState,
  onPlayPause,
  onCue,
  onStartScratch,
  onScratch,
  onEndScratch,
  onSetPitchPercent,
  onSetPitchRange,
  onSetKeyLock,
  onNudgePitch,
  onResetPitch,
  onSetColorFilter,
  onTriggerHotCue,
  onClearHotCue,
  onSetBeatLoop,
  onExitLoop,
  onSetVolume,
  onSetEqGains,
  onSeek,
  getFrequencyData
}) => {
  const [padMode, setPadMode] = useState<PadMode>("hotcue");
  const [isVinylMode, setIsVinylMode] = useState(true);
  const [crossfader, setCrossfader] = useState(0.5);
  const [deck1PlatterAngle, setDeck1PlatterAngle] = useState(0);
  const [isScratchingDeck1, setIsScratchingDeck1] = useState(false);
  const [vuLevels, setVuLevels] = useState<{ left: number; right: number }>({ left: 0, right: 0 });

  const deck1PlatterRef = useRef<HTMLDivElement | null>(null);
  const lastAngleRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const scratchCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // WebAudio Sample Generator for Sampler Pad Mode
  const playStudioSample = useCallback((padIndex: number) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      if (padIndex === 0) {
        // Airhorn
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(466.16, now); // Bb4
        osc.frequency.setValueAtTime(466.16, now + 0.12);
        osc.frequency.setValueAtTime(554.37, now + 0.13); // Db5
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.6);
      } else if (padIndex === 1) {
        // 808 Kick
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(38, now + 0.25);
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (padIndex === 2) {
        // Snare / Clap
        const bufferSize = ctx.sampleRate * 0.15;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 1000;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        whiteNoise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        whiteNoise.start(now);
      } else if (padIndex === 3) {
        // Open Hi-Hat
        const bufferSize = ctx.sampleRate * 0.25;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 8500;
        filter.Q.value = 5;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        whiteNoise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        whiteNoise.start(now);
      } else if (padIndex === 4) {
        // Sci-Fi Laser Sweep
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(2200, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.2);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (padIndex === 5) {
        // DJ Siren Sweep
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.linearRampToValueAtTime(1400, now + 0.15);
        osc.frequency.linearRampToValueAtTime(600, now + 0.3);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (padIndex === 6) {
        // Vinyl Scratch Click
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(80, now + 0.08);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
      } else {
        // Sub Drop
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.8);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.85);
      }
    } catch {}
  }, []);

  // Continuous Platter Rotation Loop
  useEffect(() => {
    if (!isPlaying) return;
    let animId: number;

    const tick = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      if (!isScratchingDeck1 && !ddjState.isJogTouching) {
        const degPerSec = 200 * playbackRate; // 33.3 RPM
        setDeck1PlatterAngle(prev => (prev + degPerSec * dt) % 360);
      }

      animId = requestAnimationFrame(tick);
    };

    lastTimeRef.current = performance.now();
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, playbackRate, isScratchingDeck1, ddjState.isJogTouching]);

  // VU Meter Audio Peak Tracking
  useEffect(() => {
    if (!isPlaying || !getFrequencyData) {
      setVuLevels({ left: 0, right: 0 });
      return;
    }

    let intervalId = setInterval(() => {
      const data = getFrequencyData();
      if (!data || data.length === 0) return;
      let sum = 0;
      const len = Math.min(32, data.length);
      for (let i = 0; i < len; i++) sum += data[i];
      const avg = sum / len / 255;
      const peakL = Math.min(10, Math.round(avg * 11));
      const peakR = Math.max(0, Math.min(10, Math.round(avg * 10.5 + (Math.random() * 1.2 - 0.6))));
      setVuLevels({ left: peakL, right: peakR });
    }, 60);

    return () => clearInterval(intervalId);
  }, [isPlaying, getFrequencyData]);

  // Mouse / Pointer Scratch Handlers for Left Jog Wheel
  const handlePlatterPointerDown = (e: React.PointerEvent) => {
    if (!deck1PlatterRef.current) return;
    const rect = deck1PlatterRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    scratchCenterRef.current = { x: centerX, y: centerY };

    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    lastAngleRef.current = angle;
    lastTimeRef.current = performance.now();

    setIsScratchingDeck1(true);
    onStartScratch();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePlatterPointerMove = (e: React.PointerEvent) => {
    if (!isScratchingDeck1) return;
    const now = performance.now();
    const dt = Math.max(0.005, (now - lastTimeRef.current) / 1000);
    lastTimeRef.current = now;

    const { x, y } = scratchCenterRef.current;
    const currentAngle = Math.atan2(e.clientY - y, e.clientX - x) * (180 / Math.PI);

    let delta = currentAngle - lastAngleRef.current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    lastAngleRef.current = currentAngle;

    const velocity = (delta / dt);
    setDeck1PlatterAngle(prev => (prev + delta) % 360);

    if (isVinylMode) {
      onScratch(velocity, delta);
    } else {
      // CDJ Pitch bend nudge
      onNudgePitch((delta / 360) * 2.0);
    }
  };

  const handlePlatterPointerUp = (_e: React.PointerEvent) => {
    if (isScratchingDeck1) {
      setIsScratchingDeck1(false);
      onEndScratch(80);
    }
  };

  // 3-Band EQ Knobs Mapping
  const lowGain = eqGains[1] || 0;
  const midGain = eqGains[5] || 0;
  const highGain = eqGains[8] || 0;

  const handleEqChange = (band: "low" | "mid" | "high", dbValue: number) => {
    const next = [...eqGains];
    if (band === "low") {
      next[0] = dbValue; next[1] = dbValue; next[2] = dbValue; next[3] = dbValue;
    } else if (band === "mid") {
      next[4] = dbValue; next[5] = dbValue; next[6] = dbValue;
    } else {
      next[7] = dbValue; next[8] = dbValue; next[9] = dbValue;
    }
    onSetEqGains(next);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-[#080809] border-t border-white/10 shadow-[0_-20px_50px_rgba(0,0,0,0.9)] max-h-[85vh] h-[580px] select-none text-neutral-300 font-sans">
      {/* Console Top Header Bar */}
      <div className="h-11 px-6 border-b border-white/10 bg-[#0c0c0e] flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded bg-white/5 border border-white/10 text-white font-mono text-[10px] tracking-widest uppercase font-bold">
            <Disc3 className="w-3.5 h-3.5 text-neutral-400" />
            <span>Pioneer DJ</span>
            <span className="text-neutral-500">•</span>
            <span className="text-neutral-300">DDJ-400</span>
          </div>

          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className={`w-2 h-2 rounded-full ${ddjState.isConnected ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-neutral-600"}`} />
            <span className={ddjState.isConnected ? "text-emerald-400 font-semibold" : "text-neutral-500"}>
              {ddjState.isConnected ? (ddjState.deviceName || "DDJ-400 MIDI 1 CONNECTED") : "STANDALONE SOFTWARE MODE"}
            </span>
          </div>
        </div>

        {/* Center Track / Deck Info */}
        <div className="hidden md:flex items-center space-x-3 text-xs font-mono">
          <span className="text-neutral-400 font-medium truncate max-w-sm">
            {currentTrack ? `${currentTrack.artist} — ${currentTrack.title}` : "NO TRACK LOADED"}
          </span>
          <span className="px-2 py-0.5 rounded bg-white/10 text-white font-bold">
            {currentBpm.toFixed(1)} BPM
            {baseBpm > 0 && Math.abs(currentBpm - baseBpm) > 0.05 && (
              <span className="ml-1.5 text-neutral-400 font-normal text-[10px]">
                (BASE {baseBpm.toFixed(1)})
              </span>
            )}
          </span>
        </div>

        {/* Right Controls */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => onResetPitch()}
            className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-mono text-neutral-300 transition-colors"
            title="Reset Tempo (0.0%)"
          >
            RESET TEMPO
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-neutral-400 hover:text-white transition-colors"
            title="Close DJ Console"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Console Layout (Deck 1 | Mixer | Deck 2) */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-0 bg-[#060607]">
        {/* ======================= LEFT: DECK 1 (Cols 1-5) ======================= */}
        <div className="col-span-5 p-4 border-r border-white/10 flex flex-col justify-between overflow-hidden">
          {/* Deck Top Header: Key Lock, Beat Sync, Loop Cutter */}
          <div className="flex items-center justify-between pb-3 border-b border-white/5 text-[10px] font-mono">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded bg-white/10 font-bold text-white text-xs">DECK 1</span>
              <button
                onClick={() => onSetKeyLock(!keyLock)}
                className={`px-2 py-1 rounded border transition-all ${
                  keyLock
                    ? "bg-blue-500/20 border-blue-400/40 text-blue-400 font-bold shadow-[0_0_10px_rgba(59,130,246,0.3)]"
                    : "bg-white/5 border-white/10 text-neutral-500 hover:text-neutral-300"
                }`}
              >
                MASTER TEMPO
              </button>
              <button
                onClick={() => setIsVinylMode(!isVinylMode)}
                className={`px-2 py-1 rounded border transition-all ${
                  isVinylMode
                    ? "bg-amber-500/20 border-amber-400/40 text-amber-400 font-bold shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                    : "bg-white/5 border-white/10 text-neutral-500"
                }`}
              >
                VINYL
              </button>
            </div>

            {/* Auto Beat Loop Selector */}
            <div className="flex items-center space-x-1 bg-black/50 p-1 rounded-lg border border-white/10">
              <span className="text-[9px] text-neutral-500 px-1">AUTO LOOP:</span>
              {[1, 2, 4, 8].map(b => (
                <button
                  key={b}
                  onClick={() => beatLoop.active && beatLoop.beats === b ? onExitLoop() : onSetBeatLoop(b)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                    beatLoop.active && beatLoop.beats === b
                      ? "bg-amber-400 text-black shadow-[0_0_8px_#f59e0b]"
                      : "text-neutral-400 hover:bg-white/10"
                  }`}
                >
                  {b}B
                </button>
              ))}
            </div>
          </div>

          {/* Jog Wheel & Tempo Section */}
          <div className="flex items-center justify-between py-2 space-x-6">
            {/* Tactile Pioneer Jog Wheel */}
            <div className="flex-1 flex flex-col items-center">
              <div
                ref={deck1PlatterRef}
                onPointerDown={handlePlatterPointerDown}
                onPointerMove={handlePlatterPointerMove}
                onPointerUp={handlePlatterPointerUp}
                onPointerCancel={handlePlatterPointerUp}
                className={`relative w-48 h-48 rounded-full cursor-grab active:cursor-grabbing touch-none flex items-center justify-center transition-shadow ${
                  isScratchingDeck1 || ddjState.isJogTouching
                    ? "ring-2 ring-amber-400 shadow-[0_0_24px_rgba(245,158,11,0.4)]"
                    : "shadow-[inset_0_2px_8px_rgba(255,255,255,0.15),0_10px_30px_rgba(0,0,0,0.8)]"
                }`}
                style={{
                  background: "radial-gradient(circle at center, #1a1a1e 0%, #0d0d0f 70%, #222226 100%)",
                  border: "4px solid #28282e"
                }}
              >
                {/* Outer Tactile Knurled Ring */}
                <div className="absolute inset-1 rounded-full border border-white/10 opacity-70 pointer-events-none" />

                {/* Vinyl Grooves Texture */}
                <div
                  className="absolute inset-3 rounded-full pointer-events-none opacity-40"
                  style={{
                    background: "repeating-radial-gradient(circle, #2a2a30 0, #141416 3px, #2a2a30 5px)"
                  }}
                />

                {/* Inner Rotating Platter Assembly */}
                <div
                  className="relative w-28 h-28 rounded-full bg-[#111114] border-2 border-white/20 flex items-center justify-center shadow-inner pointer-events-none"
                  style={{ transform: `rotate(${deck1PlatterAngle}deg)` }}
                >
                  {/* High-visibility White Needle Position Marker */}
                  <div className="absolute top-1.5 w-1.5 h-6 bg-white rounded-full shadow-[0_0_6px_#fff]" />
                  {/* Center Hub */}
                  <div className="w-8 h-8 rounded-full bg-black border border-white/20 flex items-center justify-center">
                    <div className={`w-3 h-3 rounded-full ${isScratchingDeck1 || ddjState.isJogTouching ? "bg-amber-400 animate-ping" : "bg-neutral-600"}`} />
                  </div>
                </div>
              </div>
              <div className="mt-1 text-[10px] font-mono text-neutral-500">
                {isScratchingDeck1 || ddjState.isJogTouching ? "VINYL SCRATCH ACTIVE" : "TOUCH PLATTER TO SCRUB"}
              </div>
            </div>

            {/* Precision Vertical Tempo / Pitch Slider */}
            <div className="w-24 flex flex-col items-center bg-black/40 p-2.5 rounded-xl border border-white/10">
              <div className="text-[10px] font-mono font-bold text-neutral-300 mb-1">TEMPO</div>
              <div className="text-[11px] font-mono text-emerald-400 font-extrabold mb-1">
                {pitchPercent > 0 ? `+${pitchPercent.toFixed(1)}%` : `${pitchPercent.toFixed(1)}%`}
              </div>

              {/* 0% Center Detent LED */}
              <div className="flex items-center space-x-1.5 mb-1">
                <span className={`w-1.5 h-1.5 rounded-full ${Math.abs(pitchPercent) < 0.2 ? "bg-amber-400 shadow-[0_0_6px_#f59e0b]" : "bg-neutral-700"}`} />
                <span className="text-[8px] font-mono text-neutral-500">±0%</span>
              </div>

              {/* Vertical Slider Track */}
              <div className="relative h-32 flex items-center justify-center">
                <input
                  type="range"
                  min={-pitchRange}
                  max={pitchRange}
                  step={0.1}
                  value={pitchPercent}
                  onChange={(e) => onSetPitchPercent(parseFloat(e.target.value))}
                  className="h-28 w-2 appearance-none bg-neutral-800 rounded-full cursor-ns-resize [writing-mode:vertical-lr] [direction:rtl]"
                />
              </div>

              {/* Nudge Buttons */}
              <div className="flex items-center space-x-1 mt-2">
                <button
                  onMouseDown={() => onNudgePitch(-1.0)}
                  onMouseUp={() => onResetPitch()}
                  className="w-6 h-6 rounded bg-white/5 hover:bg-white/15 border border-white/10 text-xs font-mono font-bold flex items-center justify-center"
                >
                  -
                </button>
                <button
                  onMouseDown={() => onNudgePitch(1.0)}
                  onMouseUp={() => onResetPitch()}
                  className="w-6 h-6 rounded bg-white/5 hover:bg-white/15 border border-white/10 text-xs font-mono font-bold flex items-center justify-center"
                >
                  +
                </button>
              </div>

              {/* Range Toggle */}
              <button
                onClick={() => {
                  const ranges: (6 | 10 | 16 | 50)[] = [6, 10, 16, 50];
                  const nextIdx = (ranges.indexOf(pitchRange) + 1) % ranges.length;
                  onSetPitchRange(ranges[nextIdx]);
                }}
                className="mt-1.5 px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-mono text-neutral-400 hover:text-white"
              >
                ±{pitchRange}%
              </button>
            </div>
          </div>

          {/* Performance Pads Section (8 Multi-Function Pads) */}
          <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-1">
                {(["hotcue", "loop", "jump", "sampler"] as PadMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setPadMode(mode)}
                    className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase transition-colors ${
                      padMode === mode
                        ? "bg-white text-black font-extrabold"
                        : "bg-white/5 text-neutral-400 hover:text-white"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <span className="text-[9px] font-mono text-neutral-500">RUBBER PADS 1-8</span>
            </div>

            {/* 8-Pad Grid */}
            <div className="grid grid-cols-4 gap-1.5">
              {Array.from({ length: 8 }).map((_, idx) => {
                const cueTime = hotCues[idx];
                const isCueSet = cueTime !== null;
                const isCurrentLoop = beatLoop.active && beatLoop.beats === (Math.pow(2, idx % 4));

                return (
                  <button
                    key={idx}
                    onClick={() => {
                      if (padMode === "hotcue") {
                        onTriggerHotCue(idx);
                      } else if (padMode === "loop") {
                        const beats = [0.25, 0.5, 1, 2, 4, 8, 16, 32][idx];
                        onSetBeatLoop(beats);
                      } else if (padMode === "jump") {
                        const jumpBeats = [-4, -2, -1, -0.5, 0.5, 1, 2, 4][idx];
                        const sec = (60 / currentBpm) * jumpBeats;
                        onSeek(Math.max(0, Math.min(duration, currentTime + sec)));
                      } else if (padMode === "sampler") {
                        playStudioSample(idx);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (padMode === "hotcue") onClearHotCue(idx);
                    }}
                    className={`h-9 rounded-lg border flex flex-col items-center justify-center transition-all active:scale-95 ${
                      padMode === "hotcue" && isCueSet
                        ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-300 font-bold shadow-[0_0_8px_rgba(52,211,153,0.3)]"
                        : padMode === "sampler"
                        ? "bg-rose-500/10 hover:bg-rose-500/25 border-rose-500/30 text-rose-300 font-semibold"
                        : padMode === "loop" && isCurrentLoop
                        ? "bg-amber-500/30 border-amber-400 text-amber-300 font-bold shadow-[0_0_10px_#f59e0b]"
                        : "bg-white/5 hover:bg-white/10 border-white/10 text-neutral-400"
                    }`}
                  >
                    <span className="text-[9px] font-mono">
                      {padMode === "hotcue"
                        ? isCueSet ? `${Math.floor(cueTime / 60)}:${Math.floor(cueTime % 60).toString().padStart(2, "0")}` : `CUE ${idx + 1}`
                        : padMode === "loop"
                        ? `${[0.25, 0.5, 1, 2, 4, 8, 16, 32][idx]}B`
                        : padMode === "jump"
                        ? `${[-4, -2, -1, -0.5, 0.5, 1, 2, 4][idx]}B`
                        : ["HORN", "KICK", "SNARE", "HIHAT", "LASER", "SIREN", "SCRATCH", "DROP"][idx]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pioneer Large Illuminated Circular Cue & Play Buttons */}
          <div className="flex items-center space-x-4 pt-2">
            <button
              onClick={onCue}
              className="w-14 h-14 rounded-full bg-[#1c1c20] hover:bg-[#25252c] border-2 border-amber-400/70 text-amber-400 font-mono font-bold text-xs flex flex-col items-center justify-center shadow-[0_0_12px_rgba(245,158,11,0.25)] active:scale-95 transition-all"
            >
              <span>CUE</span>
            </button>
            <button
              onClick={onPlayPause}
              className={`w-14 h-14 rounded-full border-2 font-mono font-bold text-xs flex flex-col items-center justify-center active:scale-95 transition-all ${
                isPlaying
                  ? "bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.4)]"
                  : "bg-[#1c1c20] hover:bg-[#25252c] border-emerald-500/40 text-emerald-500"
              }`}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>
          </div>
        </div>

        {/* ======================= CENTER: 2-CHANNEL MIXER (Cols 6-7) ======================= */}
        <div className="col-span-2 p-3 bg-[#0a0a0c] border-r border-white/10 flex flex-col justify-between items-center">
          <div className="text-[10px] font-mono tracking-wider font-extrabold text-neutral-400 uppercase">
            STUDIO MIXER
          </div>

          {/* Channel Strips (Rotary Knobs) */}
          <div className="w-full flex justify-around space-x-2 my-1">
            {/* Deck 1 Channel Strip */}
            <div className="flex-1 flex flex-col items-center space-y-2">
              <span className="text-[9px] font-mono text-neutral-500 font-bold">CH 1</span>

              {/* EQ HIGH */}
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-mono text-neutral-400">HI</span>
                <input
                  type="range"
                  min={-24}
                  max={6}
                  step={0.5}
                  value={highGain}
                  onChange={(e) => handleEqChange("high", parseFloat(e.target.value))}
                  className="w-12 h-1 appearance-none bg-neutral-800 rounded-full cursor-pointer"
                />
                <span className="text-[8px] font-mono text-neutral-500">{highGain > 0 ? `+${highGain}dB` : `${highGain}dB`}</span>
              </div>

              {/* EQ MID */}
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-mono text-neutral-400">MID</span>
                <input
                  type="range"
                  min={-24}
                  max={6}
                  step={0.5}
                  value={midGain}
                  onChange={(e) => handleEqChange("mid", parseFloat(e.target.value))}
                  className="w-12 h-1 appearance-none bg-neutral-800 rounded-full cursor-pointer"
                />
                <span className="text-[8px] font-mono text-neutral-500">{midGain > 0 ? `+${midGain}dB` : `${midGain}dB`}</span>
              </div>

              {/* EQ LOW */}
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-mono text-neutral-400">LOW</span>
                <input
                  type="range"
                  min={-24}
                  max={6}
                  step={0.5}
                  value={lowGain}
                  onChange={(e) => handleEqChange("low", parseFloat(e.target.value))}
                  className="w-12 h-1 appearance-none bg-neutral-800 rounded-full cursor-pointer"
                />
                <span className="text-[8px] font-mono text-neutral-500">{lowGain > 0 ? `+${lowGain}dB` : `${lowGain}dB`}</span>
              </div>

              {/* COLOR FX / FILTER */}
              <div className="flex flex-col items-center pt-1 border-t border-white/5 w-full">
                <span className="text-[8px] font-mono text-amber-400 font-bold">FILTER</span>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.02}
                  value={colorFilter}
                  onChange={(e) => onSetColorFilter(parseFloat(e.target.value))}
                  className="w-12 h-1 appearance-none bg-neutral-800 rounded-full cursor-pointer"
                />
                <span className="text-[8px] font-mono text-neutral-500">
                  {colorFilter < -0.05 ? "LPF" : colorFilter > 0.05 ? "HPF" : "OFF"}
                </span>
              </div>
            </div>

            {/* Dual Stereo LED VU Meter Bars */}
            <div className="flex space-x-1 py-1 items-end bg-black/60 px-1.5 rounded-md border border-white/5 h-44">
              <div className="flex flex-col-reverse space-y-0.5 space-y-reverse w-1.5 h-full">
                {Array.from({ length: 10 }).map((_, idx) => {
                  const isLit = idx < vuLevels.left;
                  const color = idx >= 9 ? "bg-rose-500 shadow-[0_0_4px_#f43f5e]" : idx >= 7 ? "bg-amber-400 shadow-[0_0_4px_#f59e0b]" : "bg-emerald-400 shadow-[0_0_4px_#34d399]";
                  return <div key={idx} className={`h-3 w-full rounded-xs transition-opacity ${isLit ? `${color} opacity-100` : "bg-neutral-800 opacity-30"}`} />;
                })}
              </div>
              <div className="flex flex-col-reverse space-y-0.5 space-y-reverse w-1.5 h-full">
                {Array.from({ length: 10 }).map((_, idx) => {
                  const isLit = idx < vuLevels.right;
                  const color = idx >= 9 ? "bg-rose-500 shadow-[0_0_4px_#f43f5e]" : idx >= 7 ? "bg-amber-400 shadow-[0_0_4px_#f59e0b]" : "bg-emerald-400 shadow-[0_0_4px_#34d399]";
                  return <div key={idx} className={`h-3 w-full rounded-xs transition-opacity ${isLit ? `${color} opacity-100` : "bg-neutral-800 opacity-30"}`} />;
                })}
              </div>
            </div>

            {/* Deck 2 Channel Strip Preview */}
            <div className="flex-1 flex flex-col items-center space-y-2 opacity-50">
              <span className="text-[9px] font-mono text-neutral-500 font-bold">CH 2</span>
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-mono text-neutral-400">HI</span>
                <div className="w-12 h-1 bg-neutral-800 rounded-full" />
                <span className="text-[8px] font-mono text-neutral-500">0dB</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-mono text-neutral-400">MID</span>
                <div className="w-12 h-1 bg-neutral-800 rounded-full" />
                <span className="text-[8px] font-mono text-neutral-500">0dB</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-mono text-neutral-400">LOW</span>
                <div className="w-12 h-1 bg-neutral-800 rounded-full" />
                <span className="text-[8px] font-mono text-neutral-500">0dB</span>
              </div>
              <div className="flex flex-col items-center pt-1 border-t border-white/5 w-full">
                <span className="text-[8px] font-mono text-neutral-400">FILTER</span>
                <div className="w-12 h-1 bg-neutral-800 rounded-full" />
                <span className="text-[8px] font-mono text-neutral-500">OFF</span>
              </div>
            </div>
          </div>

          {/* Channel Faders & Crossfader */}
          <div className="w-full flex flex-col items-center pt-2 border-t border-white/10 space-y-3">
            {/* Channel Level Faders */}
            <div className="flex justify-around w-full px-4">
              <div className="flex flex-col items-center">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(e) => onSetVolume(parseFloat(e.target.value))}
                  className="h-16 w-1.5 appearance-none bg-neutral-800 rounded-full cursor-pointer [writing-mode:vertical-lr] [direction:rtl]"
                />
                <span className="text-[8px] font-mono text-neutral-400 mt-1">VOL 1</span>
              </div>
              <div className="flex flex-col items-center opacity-40">
                <div className="h-16 w-1.5 bg-neutral-800 rounded-full" />
                <span className="text-[8px] font-mono text-neutral-400 mt-1">VOL 2</span>
              </div>
            </div>

            {/* Horizontal Crossfader */}
            <div className="w-full px-2 flex flex-col items-center">
              <span className="text-[8px] font-mono text-neutral-500 mb-0.5">CROSSFADER</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={crossfader}
                onChange={(e) => setCrossfader(parseFloat(e.target.value))}
                className="w-full h-1.5 appearance-none bg-neutral-800 rounded-full cursor-pointer accent-white"
              />
              <div className="flex justify-between w-full text-[7px] font-mono text-neutral-600 px-1 mt-0.5">
                <span>A</span>
                <span>▲</span>
                <span>B</span>
              </div>
            </div>
          </div>
        </div>

        {/* ======================= RIGHT: DECK 2 (Cols 8-12) ======================= */}
        <div className="col-span-5 p-4 flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between pb-3 border-b border-white/5 text-[10px] font-mono">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded bg-white/10 font-bold text-white text-xs">DECK 2</span>
              <span className="px-2 py-0.5 rounded bg-white/5 text-neutral-500">STANDBY / QUEUE</span>
            </div>
            <span className="text-[9px] font-mono text-neutral-600">AUXILIARY DECK</span>
          </div>

          {/* Deck 2 Jog Wheel Placeholder / Mirror */}
          <div className="flex items-center justify-center py-4">
            <div
              className="w-44 h-44 rounded-full flex items-center justify-center opacity-60 border-4 border-[#28282e]"
              style={{
                background: "radial-gradient(circle at center, #1a1a1e 0%, #0d0d0f 70%, #222226 100%)"
              }}
            >
              <div className="w-24 h-24 rounded-full bg-[#111114] border-2 border-white/10 flex items-center justify-center">
                <Music2 className="w-8 h-8 text-neutral-600" />
              </div>
            </div>
          </div>

          {/* Performance Pads Deck 2 Preview */}
          <div className="bg-black/30 p-2.5 rounded-xl border border-white/5 opacity-50">
            <div className="text-[9px] font-mono text-neutral-500 mb-2">HOT CUES (DECK 2)</div>
            <div className="grid grid-cols-4 gap-1.5">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div key={idx} className="h-8 rounded bg-white/5 border border-white/5 flex items-center justify-center text-[9px] font-mono text-neutral-600">
                  {idx + 1}
                </div>
              ))}
            </div>
          </div>

          {/* Deck 2 Transport Buttons */}
          <div className="flex items-center space-x-4 pt-2 opacity-50">
            <div className="w-14 h-14 rounded-full bg-[#1c1c20] border-2 border-neutral-600 text-neutral-600 font-mono font-bold text-xs flex items-center justify-center">
              CUE
            </div>
            <div className="w-14 h-14 rounded-full bg-[#1c1c20] border-2 border-neutral-600 text-neutral-600 font-mono font-bold text-xs flex items-center justify-center">
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
