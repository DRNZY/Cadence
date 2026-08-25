import React from "react";
import { motion } from "framer-motion";
import { Sliders, X, RotateCcw } from "lucide-react";
import { EQ_FREQUENCIES } from "../hooks/useAudioEngine";
import { PRESETS } from "../types";

interface EqualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  eqGains: number[];
  onSetGain: (bandIndex: number, gain: number) => void;
  onSetAllGains: (gains: number[]) => void;
}

export const EqualizerModal: React.FC<EqualizerModalProps> = ({
  isOpen,
  onClose,
  eqGains,
  onSetGain,
  onSetAllGains
}) => {
  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl"
    >
      <motion.div
        initial={{ scale: 0.94, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 20 }}
        className="w-full max-w-2xl bg-neutral-900/90 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-6"
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-2xl bg-primary/20 flex items-center justify-center text-primary">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">10-Band Graphic Studio Equalizer</h2>
              <p className="text-xs text-neutral-400">High-Fidelity Parametric DSP Filter Chain</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <span className="text-xs font-mono uppercase text-neutral-400 shrink-0">Presets:</span>
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
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>

        <div className="grid grid-cols-10 gap-3 py-4 px-2 bg-black/40 rounded-2xl border border-white/5 items-center">
          {EQ_FREQUENCIES.map((freq, idx) => {
            const gain = eqGains[idx] || 0;
            const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;

            return (
              <div key={freq} className="flex flex-col items-center space-y-2.5 h-64 justify-between">
                <span className="text-[10px] font-mono text-neutral-400">
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
                    className="h-44 w-1.5 accent-primary bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                    style={{
                      writingMode: "vertical-lr",
                      direction: "rtl"
                    }}
                  />
                </div>

                <span className="text-xs font-mono font-bold text-neutral-300">
                  {label}
                </span>
              </div>
            );
          })}
        </div>

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
