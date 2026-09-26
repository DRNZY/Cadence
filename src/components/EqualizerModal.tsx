import React, { useState } from "react";
import { motion } from "framer-motion";
import { Sliders, X, RotateCcw, Sparkles, Radio } from "lucide-react";
import { EQ_FREQUENCIES } from "../hooks/useAudioEngine";
import { PRESETS, DspSettings } from "../types";

interface EqualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  gains?: number[];
  eqGains?: number[];
  dspSettings?: DspSettings;
  onSetGain: (bandIndex: number, gain: number) => void;
  onApplyPreset?: (gains: number[]) => void;
  onSetAllGains?: (gains: number[]) => void;
  onUpdateDspSettings?: (settings: Partial<DspSettings>) => void;
}

export const EqualizerModal: React.FC<EqualizerModalProps> = ({
  isOpen,
  onClose,
  gains,
  eqGains,
  dspSettings,
  onSetGain,
  onApplyPreset,
  onSetAllGains,
  onUpdateDspSettings
}) => {
  const [activeTab, setActiveTab] = useState<"eq" | "dsp">("eq");

  if (!isOpen) return null;

  const currentGains = Array.isArray(gains) ? gains : Array.isArray(eqGains) ? eqGains : new Array(10).fill(0);
  const applyPresetHandler = onApplyPreset || onSetAllGains || (() => {});
  const safeDsp: DspSettings = dspSettings || {
    gaplessEnabled: true,
    crossfadeSeconds: 0,
    replayGainEnabled: true,
    replayGainMode: "track",
    preampGain: 0,
    spatial3D: false,
    bassBoost: false,
    compressor: false,
    limiter: false,
    tubeWarmth: false,
    mono: false,
    stereoWidth: 100
  };
  const updateDspHandler = onUpdateDspSettings || (() => {});

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xl"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
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
            <h2 className="text-base font-bold text-white tracking-wide">Equalizer & DSP</h2>
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
                Equalizer
              </button>
              <button
                onClick={() => setActiveTab("dsp")}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === "dsp" ? "bg-primary/30 text-primary shadow-sm" : "text-neutral-400 hover:text-white"
                }`}
              >
                DSP
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
              {PRESETS.map(p => {
                const isMatch = p.gains.every((g, i) => Math.abs(g - (currentGains[i] ?? 0)) < 0.2);
                return (
                  <button
                    key={p.name}
                    onClick={() => applyPresetHandler(p.gains)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all shrink-0 active:scale-95 ${
                      isMatch
                        ? "bg-white/20 border-white/40 text-white shadow-sm font-bold"
                        : "bg-white/5 hover:bg-white/15 border-white/5 hover:border-white/20 text-neutral-300 hover:text-white"
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
              <button
                onClick={() => applyPresetHandler(new Array(10).fill(0))}
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center gap-1 shrink-0 ml-auto transition-colors active:scale-95"
              >
                <RotateCcw className="w-3 h-3" /> Flat
              </button>
            </div>

            <div className="grid grid-cols-10 gap-2.5 py-4 px-3 bg-black/40 rounded-2xl border border-white/5 items-center">
              {EQ_FREQUENCIES.map((freq, idx) => {
                const gain = currentGains[idx] ?? 0;
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

                    <span className="text-[10px] font-mono text-neutral-300 font-bold uppercase">
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: WebAudio DSP Sound Stage */}
        {activeTab === "dsp" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* ReplayGain Normalization */}
              <div className="bg-black/40 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
                    <Radio className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">ReplayGain Normalization</h3>
                    <p className="text-[11px] text-neutral-400">Auto loudness leveling from tags</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={safeDsp.replayGainEnabled}
                  onChange={e => updateDspHandler({ replayGainEnabled: e.target.checked })}
                  className="w-4 h-4 accent-primary rounded cursor-pointer"
                />
              </div>

              {/* Bit-Perfect Studio Mode */}
              <div className="bg-black/40 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">32-Bit Studio Processing</h3>
                    <p className="text-[11px] text-neutral-400">Lossless floating-point signal path</p>
                  </div>
                </div>
                <div className="text-[11px] font-mono text-emerald-400 font-bold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                  ACTIVE
                </div>
              </div>
            </div>

            {/* Preamp Gain & Crossfade Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-white">Preamp Gain</span>
                  <span className="font-mono text-primary font-bold">
                    {(safeDsp.preampGain || 0) > 0 ? `+${safeDsp.preampGain}` : safeDsp.preampGain || 0} dB
                  </span>
                </div>
                <input
                  type="range"
                  min="-6"
                  max="6"
                  step="0.5"
                  value={safeDsp.preampGain || 0}
                  onChange={e => updateDspHandler({ preampGain: parseFloat(e.target.value) })}
                  className="w-full accent-primary bg-neutral-800 rounded-lg cursor-pointer"
                />
              </div>

              <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-white">Track Crossfade</span>
                  <span className="font-mono text-primary font-bold">
                    {safeDsp.crossfadeSeconds === 0 ? "Gapless (0s)" : `${safeDsp.crossfadeSeconds}s`}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="1"
                  value={safeDsp.crossfadeSeconds || 0}
                  onChange={e => updateDspHandler({ crossfadeSeconds: parseInt(e.target.value, 10) })}
                  className="w-full accent-primary bg-neutral-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};
