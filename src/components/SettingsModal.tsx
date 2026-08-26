import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Zap, Cpu, Sparkles, Monitor, CheckCircle2,
  Volume2, RefreshCw, HardDrive, Settings2
} from "lucide-react";

export type PerformanceMode = "quality" | "balanced" | "performance" | "ultra-low";

export interface AppSettings {
  performanceMode: PerformanceMode;
  enableAmbientGlow: boolean;
  enableGlassBlur: boolean;
  visualizerEnabled: boolean;
  dynamicTheme: boolean;
  autoScrobble: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  performanceMode: "balanced",
  enableAmbientGlow: true,
  enableGlassBlur: true,
  visualizerEnabled: true,
  dynamicTheme: true,
  autoScrobble: false,
};

const PERF_MODES: {
  id: PerformanceMode;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  badge: string;
  details: string[];
}[] = [
  {
    id: "quality",
    label: "Cinematic",
    subtitle: "Max visual fidelity",
    icon: <Sparkles className="w-5 h-5" />,
    color: "from-violet-500 to-purple-600",
    badge: "~1.2 GB RAM",
    details: [
      "Full backdrop-filter blur (32px)",
      "Animated ambient glow orbs",
      "Motion animations on all components",
      "Full GPU rasterization",
      "Dynamic album gradient extraction",
    ],
  },
  {
    id: "balanced",
    label: "Balanced",
    subtitle: "Default — great for most systems",
    icon: <Monitor className="w-5 h-5" />,
    color: "from-blue-500 to-cyan-500",
    badge: "~750 MB RAM",
    details: [
      "Reduced blur (18px)",
      "CSS-only ambient glow",
      "GPU-accelerated transforms",
      "Lazy image decoding",
      "Visualizer throttled to 60fps",
    ],
  },
  {
    id: "performance",
    label: "Performance",
    subtitle: "Optimized for weaker hardware",
    icon: <Cpu className="w-5 h-5" />,
    color: "from-emerald-500 to-green-500",
    badge: "~450 MB RAM",
    details: [
      "No backdrop-filter blur",
      "Ambient glow disabled",
      "Static background color",
      "Visualizer at 30fps",
      "No Framer Motion animations",
    ],
  },
  {
    id: "ultra-low",
    label: "Ultra Low RAM",
    subtitle: "Bare minimum — audio-only focus",
    icon: <Zap className="w-5 h-5" />,
    color: "from-orange-500 to-red-500",
    badge: "~250 MB RAM",
    details: [
      "All visual effects off",
      "Visualizer fully disabled",
      "No dynamic theming",
      "Static flat background",
      "Minimal DOM — audio-only UI",
    ],
  },
];

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 py-3 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        {description && <p className="text-[11px] text-neutral-400 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`shrink-0 relative w-10 h-6 rounded-full transition-all duration-200 ${
          checked ? "bg-primary" : "bg-neutral-700"
        }`}
        role="switch"
        aria-checked={checked}
      >
        <div
          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSettingsChange: (s: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}) => {
  const [tab, setTab] = useState<"performance" | "audio" | "display">("performance");

  const set = <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    const updated = { ...settings, [key]: val };
    onSettingsChange(updated);
    try {
      localStorage.setItem("cadence_settings", JSON.stringify(updated));
    } catch {}
  };

  const isQuality = settings.performanceMode === "quality";
  const isUltraLow = settings.performanceMode === "ultra-low";
  const isPerf = settings.performanceMode === "performance";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl border border-white/10 overflow-hidden shadow-2xl"
            style={{ background: "rgba(13, 14, 20, 0.95)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary to-blue-500 flex items-center justify-center">
                  <Settings2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Settings</h2>
                  <p className="text-[10px] text-neutral-400 font-mono">Cadence Studio Engine</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Bar */}
            <div className="flex gap-1 px-6 pt-4 shrink-0">
              {(["performance", "display", "audio"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-all ${
                    tab === t
                      ? "bg-white/15 text-white border border-white/20"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 no-scrollbar">

              {/* ─── PERFORMANCE TAB ─── */}
              {tab === "performance" && (
                <div className="space-y-3">
                  <p className="text-xs text-neutral-400">
                    Choose how much GPU & RAM Cadence uses. Changes apply immediately — no restart needed.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {PERF_MODES.map(mode => {
                      const active = settings.performanceMode === mode.id;
                      return (
                        <button
                          key={mode.id}
                          onClick={() => {
                            set("performanceMode", mode.id);
                            // Auto-apply related toggles
                            if (mode.id === "quality") {
                              onSettingsChange({
                                ...settings,
                                performanceMode: "quality",
                                enableAmbientGlow: true,
                                enableGlassBlur: true,
                                visualizerEnabled: true,
                                dynamicTheme: true,
                              });
                            } else if (mode.id === "balanced") {
                              onSettingsChange({
                                ...settings,
                                performanceMode: "balanced",
                                enableAmbientGlow: true,
                                enableGlassBlur: true,
                                visualizerEnabled: true,
                                dynamicTheme: true,
                              });
                            } else if (mode.id === "performance") {
                              onSettingsChange({
                                ...settings,
                                performanceMode: "performance",
                                enableAmbientGlow: false,
                                enableGlassBlur: false,
                                visualizerEnabled: true,
                                dynamicTheme: false,
                              });
                            } else if (mode.id === "ultra-low") {
                              onSettingsChange({
                                ...settings,
                                performanceMode: "ultra-low",
                                enableAmbientGlow: false,
                                enableGlassBlur: false,
                                visualizerEnabled: false,
                                dynamicTheme: false,
                              });
                            }
                            try {
                              localStorage.setItem("cadence_settings", JSON.stringify({
                                ...settings, performanceMode: mode.id
                              }));
                            } catch {}
                          }}
                          className={`text-left p-4 rounded-2xl border transition-all relative overflow-hidden ${
                            active
                              ? "border-white/30 bg-white/10"
                              : "border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/15"
                          }`}
                        >
                          {/* Active indicator */}
                          {active && (
                            <div className="absolute top-3 right-3">
                              <CheckCircle2 className="w-4 h-4 text-primary" />
                            </div>
                          )}

                          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${mode.color} flex items-center justify-center mb-3 text-white`}>
                            {mode.icon}
                          </div>

                          <div className="mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white">{mode.label}</span>
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-gradient-to-r ${mode.color} text-white`}>
                                {mode.badge}
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-400 mt-0.5">{mode.subtitle}</p>
                          </div>

                          <ul className="space-y-1">
                            {mode.details.map((d, i) => (
                              <li key={i} className="text-[10px] text-neutral-500 flex items-start gap-1.5">
                                <span className="mt-0.5 w-1 h-1 rounded-full bg-neutral-500 shrink-0" />
                                {d}
                              </li>
                            ))}
                          </ul>
                        </button>
                      );
                    })}
                  </div>

                  {/* Fine-grain overrides */}
                  <div className="mt-2 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                    <p className="text-xs font-semibold text-neutral-300 mb-1">Fine-tune</p>
                    <p className="text-[10px] text-neutral-500 mb-3">Override individual settings after choosing a preset above.</p>
                    <div className="divide-y divide-white/5">
                      <Toggle
                        checked={settings.enableAmbientGlow}
                        onChange={v => set("enableAmbientGlow", v)}
                        label="Ambient Glow"
                        description="Dynamic album-color gradient backdrop"
                      />
                      <Toggle
                        checked={settings.enableGlassBlur}
                        onChange={v => set("enableGlassBlur", v)}
                        label="Glass Blur"
                        description="backdrop-filter on panels (GPU cost)"
                      />
                      <Toggle
                        checked={settings.visualizerEnabled}
                        onChange={v => set("visualizerEnabled", v)}
                        label="Spectrum Visualizer"
                        description="Canvas FFT analyzer (saves ~5% CPU when off)"
                      />
                      <Toggle
                        checked={settings.dynamicTheme}
                        onChange={v => set("dynamicTheme", v)}
                        label="Dynamic Album Theme"
                        description="Extract colors from cover art per-track"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ─── DISPLAY TAB ─── */}
              {tab === "display" && (
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 divide-y divide-white/5">
                    <Toggle
                      checked={settings.enableAmbientGlow}
                      onChange={v => set("enableAmbientGlow", v)}
                      label="Ambient Glow Backdrop"
                      description="Color-reactive background radial gradients"
                    />
                    <Toggle
                      checked={settings.enableGlassBlur}
                      onChange={v => set("enableGlassBlur", v)}
                      label="Glassmorphic Blur Panels"
                      description="Apply backdrop-filter blur to all UI panels"
                    />
                    <Toggle
                      checked={settings.visualizerEnabled}
                      onChange={v => set("visualizerEnabled", v)}
                      label="Spectrum Analyzer"
                      description="Show the FFT canvas visualizer in Studio Mix view"
                    />
                    <Toggle
                      checked={settings.dynamicTheme}
                      onChange={v => set("dynamicTheme", v)}
                      label="Dynamic Album Theme Colors"
                      description="Auto-extract palette from album art on each track change"
                    />
                  </div>

                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-2">
                    <p className="text-xs font-semibold text-neutral-300">Current Performance Mode</p>
                    <div className="flex items-center gap-3">
                      {(() => {
                        const mode = PERF_MODES.find(m => m.id === settings.performanceMode)!;
                        return (
                          <>
                            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${mode.color} flex items-center justify-center text-white`}>
                              {mode.icon}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">{mode.label}</p>
                              <p className="text-[10px] text-neutral-400">{mode.badge} · {mode.subtitle}</p>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    <button
                      onClick={() => setTab("performance")}
                      className="text-xs text-primary hover:underline mt-1"
                    >
                      Change performance mode →
                    </button>
                  </div>
                </div>
              )}

              {/* ─── AUDIO TAB ─── */}
              {tab === "audio" && (
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                    <p className="text-xs font-semibold text-neutral-300 mb-3">Audio Output</p>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-white/5">
                      <Volume2 className="w-4 h-4 text-primary shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-white">PipeWire / ALSA</p>
                        <p className="text-[10px] text-neutral-400">Linux system audio — routed via Web Audio API</p>
                      </div>
                      <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 divide-y divide-white/5">
                    <Toggle
                      checked={settings.autoScrobble}
                      onChange={v => set("autoScrobble", v)}
                      label="Last.fm Scrobbling"
                      description="Coming soon — auto-log tracks to Last.fm"
                      disabled
                    />
                  </div>

                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                    <p className="text-xs font-semibold text-neutral-300 mb-2">Library</p>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                      <HardDrive className="w-3.5 h-3.5" />
                      <span>Music directory: <code className="text-white font-mono">~/Music</code></span>
                    </div>
                    <button
                      onClick={() => window.location.reload()}
                      className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-neutral-300 hover:text-white transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Rescan Library
                    </button>
                  </div>

                  {/* About */}
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
                    <p className="text-xs font-semibold text-neutral-300">About</p>
                    <p className="text-[11px] text-neutral-400">Cadence Studio Hi-Fi Engine</p>
                    <p className="text-[10px] text-neutral-600 font-mono">v1.0.0 · Electron · React 19 · Web Audio API</p>
                    <a
                      href="https://github.com/DRNZY/Cadence"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-primary hover:underline font-mono"
                    >
                      github.com/DRNZY/Cadence
                    </a>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Load settings from localStorage with fallback
export function loadSettings(): AppSettings {
  try {
    const saved = localStorage.getItem("cadence_settings");
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_SETTINGS;
}
