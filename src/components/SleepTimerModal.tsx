import React, { useState } from "react";
import { Moon, X } from "lucide-react";

interface SleepTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  timerRemaining: number | null; // seconds remaining or null if inactive
  onStartTimer: (minutes: number) => void;
  onCancelTimer: () => void;
}

const PRESETS = [15, 30, 45, 60, 90];

export const SleepTimerModal: React.FC<SleepTimerModalProps> = ({
  isOpen,
  onClose,
  timerRemaining,
  onStartTimer,
  onCancelTimer,
}) => {
  const [customMins, setCustomMins] = useState<string>("20");

  if (!isOpen) return null;

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md border border-white/10 bg-zinc-950 p-6 rounded-2xl shadow-2xl text-zinc-100">
        <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Moon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Sleep Timer</h2>
              <p className="text-xs text-zinc-400">Audio will gently fade out and pause</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {timerRemaining !== null ? (
          <div className="flex flex-col items-center py-6 bg-zinc-900/50 rounded-xl border border-white/5 mb-6">
            <span className="text-xs font-mono uppercase tracking-widest text-zinc-400 mb-1">
              Active Countdown
            </span>
            <span className="text-4xl font-mono font-bold text-indigo-400 tracking-wider">
              {formatCountdown(timerRemaining)}
            </span>
            <button
              onClick={onCancelTimer}
              className="mt-4 px-4 py-1.5 text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg transition"
            >
              Cancel Timer
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2.5 mb-5">
              {PRESETS.map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    onStartTimer(m);
                    onClose();
                  }}
                  className="flex flex-col items-center justify-center py-3 px-4 rounded-xl border border-white/10 bg-zinc-900/60 hover:bg-indigo-600/20 hover:border-indigo-500/40 transition active:scale-95"
                >
                  <span className="text-base font-bold text-zinc-100">{m}</span>
                  <span className="text-[10px] text-zinc-400 font-medium">Minutes</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 mb-6">
              <input
                type="number"
                min="1"
                max="360"
                value={customMins}
                onChange={(e) => setCustomMins(e.target.value)}
                placeholder="Custom min"
                className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => {
                  const val = parseInt(customMins, 10);
                  if (val > 0) {
                    onStartTimer(val);
                    onClose();
                  }
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shrink-0 transition"
              >
                Set
              </button>
            </div>
          </>
        )}

        <div className="text-[11px] text-zinc-500 text-center">
          Includes automatic 10-second exponential volume fade-out.
        </div>
      </div>
    </div>
  );
};
