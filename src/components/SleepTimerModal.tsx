import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, X, Clock, Plus, RotateCcw } from "lucide-react";

interface SleepTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  timerRemaining: number | null; // seconds remaining or null if inactive
  totalDurationSeconds?: number;
  onStartTimer: (minutes: number) => void;
  onExtendTimer?: (additionalMinutes: number) => void;
  onCancelTimer: () => void;
}

const PRESETS = [
  { mins: 5, label: "5m" },
  { mins: 15, label: "15m" },
  { mins: 30, label: "30m" },
  { mins: 45, label: "45m" },
  { mins: 60, label: "1h" },
  { mins: 90, label: "1.5h" }
];

export const SleepTimerModal: React.FC<SleepTimerModalProps> = ({
  isOpen,
  onClose,
  timerRemaining,
  totalDurationSeconds,
  onStartTimer,
  onExtendTimer,
  onCancelTimer,
}) => {
  const [customMins, setCustomMins] = useState<string>("20");

  if (!isOpen) return null;

  const formatCountdown = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
      return `${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
    }
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const progressPercent = totalDurationSeconds && timerRemaining !== null
    ? Math.max(0, Math.min(100, (1 - timerRemaining / totalDurationSeconds) * 100))
    : 0;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 14 }}
          transition={{ type: "spring", stiffness: 450, damping: 32 }}
          className="relative w-full max-w-md bg-neutral-900/95 border border-white/10 rounded-3xl p-6 shadow-2xl text-neutral-100 space-y-5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-white shadow-md">
                <Moon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-bold tracking-tight text-white">Sleep Timer</h2>
                <p className="text-xs text-neutral-400">Gentle volume fade-out & pause</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors active:scale-95"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Active Timer View */}
          {timerRemaining !== null ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center py-6 px-4 bg-black/40 rounded-2xl border border-white/5 relative overflow-hidden">
                {/* Progress Bar Line */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
                  <div
                    className="h-full bg-primary transition-all duration-1000"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-neutral-400 mb-2">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  <span>Remaining Time</span>
                </div>

                <span className="text-5xl font-mono font-bold text-white tracking-wider my-1">
                  {formatCountdown(timerRemaining)}
                </span>

                <span className="text-[11px] text-neutral-400 mt-1">
                  {timerRemaining <= 10 ? "Fading out audio..." : "Playback active"}
                </span>

                {/* Quick Extend Buttons */}
                {onExtendTimer && (
                  <div className="flex items-center gap-2 mt-4">
                    <button
                      onClick={() => onExtendTimer(5)}
                      className="px-3 py-1.5 text-xs font-semibold bg-white/5 hover:bg-white/15 border border-white/10 rounded-xl text-neutral-200 hover:text-white flex items-center gap-1 transition active:scale-95"
                    >
                      <Plus className="w-3 h-3" /> +5m
                    </button>
                    <button
                      onClick={() => onExtendTimer(15)}
                      className="px-3 py-1.5 text-xs font-semibold bg-white/5 hover:bg-white/15 border border-white/10 rounded-xl text-neutral-200 hover:text-white flex items-center gap-1 transition active:scale-95"
                    >
                      <Plus className="w-3 h-3" /> +15m
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => {
                    onCancelTimer();
                  }}
                  className="w-full py-2.5 px-4 text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Cancel Sleep Timer</span>
                </button>
              </div>
            </div>
          ) : (
            /* Set New Timer View */
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-neutral-300 mb-2.5">Preset Duration</p>
                <div className="grid grid-cols-3 gap-2.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.mins}
                      onClick={() => {
                        onStartTimer(p.mins);
                        onClose();
                      }}
                      className="flex flex-col items-center justify-center py-3 px-3 rounded-2xl border border-white/5 bg-black/40 hover:bg-white/10 hover:border-white/20 transition-all active:scale-95 group"
                    >
                      <span className="text-base font-bold text-white group-hover:text-primary transition-colors">
                        {p.label}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-medium">Minutes</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-neutral-300 mb-2">Custom Duration</p>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="1"
                      max="360"
                      value={customMins}
                      onChange={(e) => setCustomMins(e.target.value)}
                      placeholder="Minutes"
                      className="w-full bg-black/40 border border-white/10 rounded-2xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-primary transition-colors font-mono"
                    />
                    <span className="absolute right-3.5 top-3 text-[11px] text-neutral-500 font-medium pointer-events-none">
                      min
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      const val = parseInt(customMins, 10);
                      if (val > 0) {
                        onStartTimer(val);
                        onClose();
                      }
                    }}
                    className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-2xl shrink-0 transition-all active:scale-95 shadow-md"
                  >
                    Start
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="text-[11px] text-neutral-500 text-center pt-1 border-t border-white/5">
            Automatic 10-second exponential audio fade-out before playback stops.
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
