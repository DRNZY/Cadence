import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sliders, X, RotateCcw, Volume2, Sparkles, Disc, Radio, Zap } from "lucide-react";
import { EQ_FREQUENCIES } from "../hooks/useAudioEngine";
import { PRESETS, DspSettings } from "../types";

interface EqualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  eqGains: number[];
  dspSettings: DspSettings;
  onSetGain: (bandIndex: number, gain: number) => void;
  onSetAllGains: (gains: number[]) => void;
  onUpdateDspSettings: (settings: Partial<DspSettings>) => void;
}

export const EqualizerModal: React.FC<EqualizerModalProps> = ({
  isOpen,
  onClose,
  eqGains,
  dspSettings,
  onSetGain,
  onSetAllGains,
  onUpdateDspSettings
}) => {
  const [activeTab, setActiveTab] = useState<"eq" | "dsp">("eq");

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xl"
    >
      <motion.div
        initial={{ scale: 0.94, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 20 }}
        className="w-full max-w-2xl bg-neutral-900/95 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/30">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                DSP & Studio Audio Suite
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                  Web Audio 64-bit
                </span>
              </h2>
              <p className="text-xs text-neutral-400">10-Band Graphic EQ, ReplayGain & Gapless Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Switcher Tabs */}
            <div className="flex bg-black/50 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setActiveTab("eq")}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === "eq" ? "bg-white/20 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                }`}
              >
                Graphic EQ
              </button>
              <button
                onClick={() => setActiveTab("dsp")}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === "dsp" ? "bg-primary/30 text-primary shadow-sm" : "text-neutral-400 hover:text-white"
                }`}
              >
                DSP & Crossfade
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab 1: 10-Band Graphic EQ */}
        {activeTab === "eq" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <span className="text-[11px] font-mono uppercase text-neutral-400 shrink-0">Presets:</span>
              {PRESETS.map(p => (
                <button
                  key={p.name}
                  onClick={() => onSetAllGains(p.gains)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/5 hover:bg-white/15 border border-white/5 hover:border-white/20 text-neutral-300 hover:text-white transition-all shrink-0"
                >
                  {p.name}
                </button>
              ))}
              <button
                onClick={() => onSetAllGains(new Array(10).fill(0))}
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 flex items-center gap-1 shrink-0 ml-auto"
              >
                <RotateCcw className="w-3 h-3" /> Flat
              </button>
            </div>

            <div className="grid grid-cols-10 gap-2.5 py-4 px-3 bg-black/40 rounded-2xl border border-white/5 items-center">
              {EQ_FREQUENCIES.map((freq, idx) => {
                const gain = eqGains[idx] || 0;
                const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;

                return (
                  <div key={freq} className="flex flex-col items-center space-y-2 h-56 justify-between">
                    <span className="text-[10px] font-mono text-neutral-400 font-medium">
                      {gain > 0 ? `+${gain.toFixed(0)}` : gain.toFixed(0)}dB
                    </span>

                    <div className="relative flex-1 flex items-center justify-center w-full">
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="0.5"
                        value={gain}
                        onChange={e => onSetGain(idx, parseFloat(e.target.value))}
                        className="h-36 w-1.5 accent-primary bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                        style={{
                          writingMode: "vertical-lr",
                          direction: "rtl"
                        }}
                      />
                    </div>

                    <span className="text-[11px] font-mono font-bold text-neutral-300">
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: DSP & Crossfade Settings */}
        {activeTab === "dsp" && (
          <div className="space-y-4 py-2">
            {/* ReplayGain & EBU R128 Card */}
            <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">ReplayGain / EBU R128 Normalization</h3>
                    <p className="text-[11px] text-neutral-400">Auto-match loudness across mixed FLAC & MP3 albums without volume jumps</p>
                  </div>
                </div>

                <button
                  onClick={() => onUpdateDspSettings({ replayGainEnabled: !dspSettings.replayGainEnabled })}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                    dspSettings.replayGainEnabled
                      ? "bg-primary text-black"
                      : "bg-white/10 text-neutral-400 hover:text-white"
                  }`}
                >
                  {dspSettings.replayGainEnabled ? "ENABLED" : "DISABLED"}
                </button>
              </div>

              {dspSettings.replayGainEnabled && (
                <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-neutral-300">Preamp Boost / Cut:</span>
                    <p className="text-[10px] text-neutral-500">Fine-tune master target loudness headroom</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="-6"
                      max="6"
                      step="0.5"
                      value={dspSettings.preampGain}
                      onChange={e => onUpdateDspSettings({ preampGain: parseFloat(e.target.value) })}
                      className="w-28 accent-primary bg-neutral-800 rounded-lg cursor-pointer"
                    />
                    <span className="text-xs font-mono font-bold text-primary w-10 text-right">
                      {dspSettings.preampGain > 0 ? `+${dspSettings.preampGain}` : dspSettings.preampGain} dB
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Gapless & Crossfade Card */}
            <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                    <Radio className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Track Transition Engine</h3>
                    <p className="text-[11px] text-neutral-400">
                      {dspSettings.crossfadeSeconds === 0
                        ? "Pure Gapless Mode — Instant zero-latency live concert transitions"
                        : `DJ Smooth Crossfade — ${dspSettings.crossfadeSeconds}s overlapping fade`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onUpdateDspSettings({ crossfadeSeconds: 0 })}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                      dspSettings.crossfadeSeconds === 0
                        ? "bg-purple-500 text-white"
                        : "bg-white/10 text-neutral-400 hover:text-white"
                    }`}
                  >
                    Gapless (0s)
                  </button>
                  <button
                    onClick={() => onUpdateDspSettings({ crossfadeSeconds: 3 })}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                      dspSettings.crossfadeSeconds === 3
                        ? "bg-purple-500 text-white"
                        : "bg-white/10 text-neutral-400 hover:text-white"
                    }`}
                  >
                    3s Mix
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-neutral-300">Crossfade Duration:</span>
                  <p className="text-[10px] text-neutral-500">Smooth volume blending duration between tracks</p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.5"
                    value={dspSettings.crossfadeSeconds}
                    onChange={e => onUpdateDspSettings({ crossfadeSeconds: parseFloat(e.target.value) })}
                    className="w-32 accent-purple-500 bg-neutral-800 rounded-lg cursor-pointer"
                  />
                  <span className="text-xs font-mono font-bold text-purple-400 w-10 text-right">
                    {dspSettings.crossfadeSeconds === 0 ? "Off" : `${dspSettings.crossfadeSeconds}s`}
                  </span>
                </div>
              </div>
            </div>

            {/* Peak Limiter Info */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/5 border border-white/5 text-[11px] text-neutral-400">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Soft-Knee Peak Limiter active (-0.5 dBFS headroom ceiling)
              </span>
              <span className="font-mono text-emerald-400">Active</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-full bg-white text-black font-bold text-sm hover:bg-neutral-200 transition-colors shadow-md"
          >
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
