import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Zap, Cpu, Sparkles, Monitor, CheckCircle2,
  Volume2, RefreshCw, HardDrive, Settings2, Radio,
  User, Lock, Layout, Palette, Check, AlertCircle,
  LogOut, AlignLeft, ArrowDown, ArrowUp, Sun, Moon
} from "lucide-react";
import { THEME_PRESETS, buildCustomGradient, applyThemeColors } from "../utils/colorExtractor";
import { PlayerBarPosition, LibraryPosition, SidebarPosition, ThemeMode } from "../types";

export type PerformanceMode = "quality" | "balanced" | "performance" | "ultra-low";

export interface AppSettings {
  performanceMode: PerformanceMode;
  themeMode?: ThemeMode;
  enableAmbientGlow: boolean;
  enableGlassBlur: boolean;
  visualizerEnabled: boolean;
  dynamicTheme: boolean;
  autoScrobble: boolean;
  themePreset: string;
  accentColor: string;
  customGradientStart: string;
  customGradientEnd: string;
  customGradientAngle: number;
  glowIntensity: number;
  playerBarPosition: PlayerBarPosition;
  libraryPosition: LibraryPosition;
  sidebarPosition: SidebarPosition;
}

const DEFAULT_SETTINGS: AppSettings = {
  performanceMode: "balanced",
  themeMode: "dark",
  enableAmbientGlow: true,
  enableGlassBlur: true,
  visualizerEnabled: true,
  dynamicTheme: true,
  autoScrobble: false,
  themePreset: "graphite",
  accentColor: "#38bdf8",
  customGradientStart: "#0f172a",
  customGradientEnd: "#020617",
  customGradientAngle: 145,
  glowIntensity: 0.7,
  playerBarPosition: "bottom",
  libraryPosition: "left",
  sidebarPosition: "right"
};

const PERF_MODES: {
  id: PerformanceMode;
  label: string;
  summary: string;
  icon: React.ReactNode;
  color: string;
  badge: string;
}[] = [
  {
    id: "quality",
    label: "Cinematic",
    summary: "Full visual fidelity & dynamic glow",
    icon: <Sparkles className="w-4 h-4" />,
    color: "from-blue-500 to-indigo-600",
    badge: "~1.2 GB",
  },
  {
    id: "balanced",
    label: "Balanced",
    summary: "Balanced visuals & responsiveness",
    icon: <Monitor className="w-4 h-4" />,
    color: "from-cyan-500 to-blue-500",
    badge: "~750 MB",
  },
  {
    id: "performance",
    label: "Performance",
    summary: "Reduced effects for efficiency",
    icon: <Cpu className="w-4 h-4" />,
    color: "from-emerald-500 to-teal-500",
    badge: "~450 MB",
  },
  {
    id: "ultra-low",
    label: "Ultra Low",
    summary: "Minimal audio-only focus",
    icon: <Zap className="w-4 h-4" />,
    color: "from-amber-500 to-orange-500",
    badge: "~250 MB",
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
        <p className="text-xs font-semibold text-white">{label}</p>
        {description && <p className="text-[11px] text-neutral-400 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`shrink-0 relative w-10 h-6 rounded-full transition-all duration-200 ${
          checked ? "bg-primary" : "bg-neutral-800"
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
  const [tab, setTab] = useState<"layout" | "theme" | "performance" | "audio" | "lastfm" | "updates">("layout");

  // Update Checker State
  const [updateInfo, setUpdateInfo] = useState<{
    checking: boolean;
    checked: boolean;
    currentVersion: string;
    latestVersion: string;
    updateAvailable: boolean;
    releaseNotes?: string;
  }>({
    checking: false,
    checked: false,
    currentVersion: "2.1.0",
    latestVersion: "2.1.0",
    updateAvailable: false,
  });

  const checkUpdates = async () => {
    setUpdateInfo(prev => ({ ...prev, checking: true }));
    try {
      const res = await fetch("/api/update-check");
      const data = await res.json();
      setUpdateInfo({
        checking: false,
        checked: true,
        currentVersion: data.currentVersion || "2.1.0",
        latestVersion: data.latestVersion || "2.1.0",
        updateAvailable: Boolean(data.updateAvailable),
        releaseNotes: data.releaseNotes
      });
    } catch {
      setUpdateInfo(prev => ({ ...prev, checking: false, checked: true }));
    }
  };

  // Last.fm State
  const [lastFmConfig, setLastFmConfig] = useState<{
    enabled: boolean;
    username: string | null;
    hasSession: boolean;
    apiKey?: string;
  }>({
    enabled: false,
    username: null,
    hasSession: false,
  });

  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  const fetchLastFmConfig = useCallback(() => {
    fetch("/api/lastfm/config")
      .then(r => r.json())
      .then(data => {
        setLastFmConfig({
          enabled: Boolean(data.enabled),
          username: data.username || null,
          hasSession: Boolean(data.hasSession),
          apiKey: data.apiKey || "",
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchLastFmConfig();
    }
  }, [isOpen, fetchLastFmConfig]);

  const persistSettings = (updated: AppSettings) => {
    try {
      localStorage.setItem("cadence_settings", JSON.stringify(updated));
    } catch {}
    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated)
    }).catch(() => {});
  };

  const set = <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    const updated = { ...settings, [key]: val };
    onSettingsChange(updated);
    persistSettings(updated);
  };

  const handleApplyThemePreset = (presetId: string) => {
    const preset = THEME_PRESETS.find(p => p.id === presetId);
    if (!preset) return;

    const updated: AppSettings = {
      ...settings,
      themePreset: preset.id,
      dynamicTheme: false,
      accentColor: preset.accent,
      customGradientStart: preset.startColor,
      customGradientEnd: preset.endColor,
      customGradientAngle: preset.angle
    };

    onSettingsChange(updated);
    persistSettings(updated);

    const customTheme = buildCustomGradient(preset.startColor, preset.endColor, preset.angle, preset.accent);
    applyThemeColors(customTheme);
  };

  const handleCustomThemeChange = (key: "accentColor" | "customGradientStart" | "customGradientEnd" | "customGradientAngle", val: any) => {
    const updated: AppSettings = {
      ...settings,
      themePreset: "custom",
      dynamicTheme: false,
      [key]: val
    };

    onSettingsChange(updated);
    persistSettings(updated);

    const customTheme = buildCustomGradient(
      key === "customGradientStart" ? val : updated.customGradientStart,
      key === "customGradientEnd" ? val : updated.customGradientEnd,
      key === "customGradientAngle" ? val : updated.customGradientAngle,
      key === "accentColor" ? val : updated.accentColor
    );
    applyThemeColors(customTheme);
  };

  const handleLastFmToggle = async (enabled: boolean) => {
    try {
      const res = await fetch("/api/lastfm/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled })
      });
      const data = await res.json();
      if (data.success) {
        setLastFmConfig(prev => ({ ...prev, enabled }));
        set("autoScrobble", enabled);
      }
    } catch {}
  };

  const handleLastFmConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim() || !passwordInput.trim()) {
      setAuthError("Please enter your Last.fm username and password.");
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccess(null);

    try {
      const res = await fetch("/api/lastfm/auth/mobile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: usernameInput.trim(),
          password: passwordInput.trim()
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAuthSuccess(`Successfully connected as @${data.username}!`);
        setPasswordInput("");
        fetchLastFmConfig();
        set("autoScrobble", true);
      } else {
        setAuthError(data.error || "Failed to authenticate with Last.fm");
      }
    } catch (err: any) {
      setAuthError(err.message || "Network error connecting to Last.fm");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLastFmDisconnect = async () => {
    try {
      await fetch("/api/lastfm/disconnect", { method: "POST" });
      fetchLastFmConfig();
      set("autoScrobble", false);
      setAuthSuccess(null);
      setAuthError(null);
    } catch {}
  };

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
          <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="settings-modal-dialog relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl border overflow-hidden shadow-2xl transition-colors duration-200"
            style={{
              background: settings.themeMode === "light" ? "rgba(255, 255, 255, 0.97)" : "rgba(10, 11, 16, 0.96)",
              borderColor: settings.themeMode === "light" ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.1)"
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
                  <Settings2 className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-sm font-bold text-white tracking-tight">Studio Settings</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-white/10 text-neutral-400 hover:text-white transition-colors active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Bar with Apple Spring Pills */}
            <div className="flex gap-1.5 px-6 pt-4 shrink-0 overflow-x-auto no-scrollbar">
              {([
                { id: "layout", label: "Layout & Ergonomics", icon: <Layout className="w-3.5 h-3.5" /> },
                { id: "theme", label: "Colors & Themes", icon: <Palette className="w-3.5 h-3.5" /> },
                { id: "performance", label: "Performance", icon: <Cpu className="w-3.5 h-3.5" /> },
                { id: "audio", label: "Audio & Library", icon: <Volume2 className="w-3.5 h-3.5" /> },
                { id: "lastfm", label: "Last.fm", icon: <Radio className="w-3.5 h-3.5" /> },
                { id: "updates", label: "Updates", icon: <RefreshCw className="w-3.5 h-3.5" /> }
              ] as const).map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold capitalize transition-all shrink-0 flex items-center gap-1.5 active:scale-95 ${
                    tab === t.id
                      ? "bg-white/20 text-white border border-white/20 shadow-sm"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 no-scrollbar">

              {/* ─── 1. LAYOUT & ERGONOMICS TAB ─── */}
              {tab === "layout" && (
                <div className="space-y-4">
                  {/* Player Bar Position */}
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-white">Player Bar Position</p>
                      <p className="text-[11px] text-neutral-400">Position the audio control bar to suit your screen layout.</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                      {([
                        { id: "bottom", label: "Bottom Dock", icon: <ArrowDown className="w-3.5 h-3.5" /> },
                        { id: "top", label: "Top Header", icon: <ArrowUp className="w-3.5 h-3.5" /> },
                        { id: "left", label: "Left Sidebar", icon: <AlignLeft className="w-3.5 h-3.5" /> },
                      ] as const).map(pos => {
                        const active = settings.playerBarPosition === pos.id;
                        return (
                          <button
                            key={pos.id}
                            onClick={() => set("playerBarPosition", pos.id)}
                            className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-medium ${
                              active
                                ? "bg-white/15 border-white/30 text-white shadow-sm"
                                : "bg-black/30 border-white/5 text-neutral-400 hover:text-white hover:border-white/15"
                            }`}
                          >
                            {pos.icon}
                            <span>{pos.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Panel Arrangements */}
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
                    <p className="text-xs font-semibold text-white">Panel Placement</p>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[11px] text-neutral-400 mb-1.5">Music Library</p>
                        <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                          <button
                            onClick={() => set("libraryPosition", "left")}
                            className={`flex-1 py-1 text-xs rounded-lg font-medium transition-all ${
                              settings.libraryPosition === "left" ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white"
                            }`}
                          >
                            Left
                          </button>
                          <button
                            onClick={() => set("libraryPosition", "right")}
                            className={`flex-1 py-1 text-xs rounded-lg font-medium transition-all ${
                              settings.libraryPosition === "right" ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white"
                            }`}
                          >
                            Right
                          </button>
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] text-neutral-400 mb-1.5">Lyrics & Visualizer Stack</p>
                        <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                          <button
                            onClick={() => set("sidebarPosition", "right")}
                            className={`flex-1 py-1 text-xs rounded-lg font-medium transition-all ${
                              settings.sidebarPosition === "right" ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white"
                            }`}
                          >
                            Right
                          </button>
                          <button
                            onClick={() => set("sidebarPosition", "left")}
                            className={`flex-1 py-1 text-xs rounded-lg font-medium transition-all ${
                              settings.sidebarPosition === "left" ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white"
                            }`}
                          >
                            Left
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── 2. THEMES & COLORS TAB ─── */}
              {tab === "theme" && (
                <div className="space-y-4">
                  {/* Appearance Mode: Dark vs Light */}
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-white">Appearance & Mode</p>
                      <p className="text-[11px] text-neutral-400">Choose between Apple obsidian dark glass or clean daylight frosted glass.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => set("themeMode", "dark")}
                        className={`p-3 rounded-xl border flex items-center gap-3 transition-all ${
                          (settings.themeMode || "dark") === "dark"
                            ? "border-primary bg-primary/20 text-white shadow-md shadow-primary/10"
                            : "border-white/5 bg-black/40 text-neutral-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <Moon className="w-4 h-4 text-primary" />
                        <div className="text-left">
                          <div className="text-xs font-bold text-white">Dark Mode</div>
                          <div className="text-[10px] text-neutral-400">Obsidian & neon glow</div>
                        </div>
                      </button>

                      <button
                        onClick={() => set("themeMode", "light")}
                        className={`p-3 rounded-xl border flex items-center gap-3 transition-all ${
                          settings.themeMode === "light"
                            ? "border-amber-400 bg-amber-400/20 text-white shadow-md shadow-amber-400/10"
                            : "border-white/5 bg-black/40 text-neutral-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <Sun className="w-4 h-4 text-amber-400" />
                        <div className="text-left">
                          <div className="text-xs font-bold text-white">Light Mode</div>
                          <div className="text-[10px] text-neutral-400">Frosted daylight & contrast</div>
                        </div>
                      </button>
                    </div>
                  </div>
                  {/* Dynamic Album Art Theme Switch */}
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                    <Toggle
                      checked={settings.dynamicTheme}
                      onChange={v => {
                        set("dynamicTheme", v);
                        if (!v) handleApplyThemePreset(settings.themePreset || "graphite");
                      }}
                      label="Dynamic Album Art Glow"
                      description="Extracts dominant ambient hues from current playing album cover."
                    />
                  </div>

                  {/* Preset Palettes */}
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
                    <p className="text-xs font-semibold text-white">Curated Themes</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {THEME_PRESETS.map(preset => {
                        const active = !settings.dynamicTheme && settings.themePreset === preset.id;
                        return (
                          <button
                            key={preset.id}
                            onClick={() => handleApplyThemePreset(preset.id)}
                            className={`p-3 rounded-xl border flex flex-col items-start gap-2 transition-all relative overflow-hidden text-left ${
                              active
                                ? "border-white/40 bg-white/15 shadow-sm"
                                : "border-white/5 bg-black/40 hover:border-white/20 hover:bg-white/5"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm"
                                style={{ backgroundColor: preset.accent }}
                              />
                              <span className="text-xs font-bold text-white">{preset.name}</span>
                            </div>
                            <div
                              className="w-full h-3 rounded-md border border-white/10"
                              style={{ background: `linear-gradient(${preset.angle}deg, ${preset.startColor}, ${preset.endColor})` }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom Dual Gradient & Accent Customizer */}
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3.5">
                    <p className="text-xs font-semibold text-white">Custom Gradient & Accent</p>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[11px] text-neutral-400 block mb-1">Accent Color</label>
                        <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-xl border border-white/10">
                          <input
                            type="color"
                            value={settings.accentColor}
                            onChange={e => handleCustomThemeChange("accentColor", e.target.value)}
                            className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0"
                          />
                          <span className="text-xs font-mono text-white">{settings.accentColor}</span>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] text-neutral-400 block mb-1">Gradient Start</label>
                        <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-xl border border-white/10">
                          <input
                            type="color"
                            value={settings.customGradientStart}
                            onChange={e => handleCustomThemeChange("customGradientStart", e.target.value)}
                            className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0"
                          />
                          <span className="text-xs font-mono text-white">{settings.customGradientStart}</span>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] text-neutral-400 block mb-1">Gradient End</label>
                        <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-xl border border-white/10">
                          <input
                            type="color"
                            value={settings.customGradientEnd}
                            onChange={e => handleCustomThemeChange("customGradientEnd", e.target.value)}
                            className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0"
                          />
                          <span className="text-xs font-mono text-white">{settings.customGradientEnd}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── 3. PERFORMANCE TAB ─── */}
              {tab === "performance" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {PERF_MODES.map(mode => {
                      const active = settings.performanceMode === mode.id;
                      return (
                        <button
                          key={mode.id}
                          onClick={() => {
                            set("performanceMode", mode.id);
                            if (mode.id === "quality" || mode.id === "balanced") {
                              onSettingsChange({
                                ...settings,
                                performanceMode: mode.id,
                                enableAmbientGlow: true,
                                enableGlassBlur: true,
                                visualizerEnabled: true,
                              });
                            } else if (mode.id === "performance") {
                              onSettingsChange({
                                ...settings,
                                performanceMode: "performance",
                                enableAmbientGlow: false,
                                enableGlassBlur: false,
                                visualizerEnabled: true,
                              });
                            } else if (mode.id === "ultra-low") {
                              onSettingsChange({
                                ...settings,
                                performanceMode: "ultra-low",
                                enableAmbientGlow: false,
                                enableGlassBlur: false,
                                visualizerEnabled: false,
                              });
                            }
                          }}
                          className={`text-left p-4 rounded-2xl border transition-all relative overflow-hidden ${
                            active
                              ? "border-white/30 bg-white/10"
                              : "border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/15"
                          }`}
                        >
                          {active && (
                            <div className="absolute top-3 right-3">
                              <CheckCircle2 className="w-4 h-4 text-primary" />
                            </div>
                          )}

                          <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${mode.color} flex items-center justify-center mb-3 text-white`}>
                            {mode.icon}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-white">{mode.label}</span>
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-gradient-to-r ${mode.color} text-white`}>
                                {mode.badge}
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-400">{mode.summary}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-2 p-4 rounded-2xl bg-white/[0.03] border border-white/5 divide-y divide-white/5">
                    <Toggle
                      checked={settings.enableAmbientGlow}
                      onChange={v => set("enableAmbientGlow", v)}
                      label="Ambient Aura Glow"
                    />
                    <Toggle
                      checked={settings.enableGlassBlur}
                      onChange={v => set("enableGlassBlur", v)}
                      label="Hardware Frosted Glass Blur"
                    />
                    <Toggle
                      checked={settings.visualizerEnabled}
                      onChange={v => set("visualizerEnabled", v)}
                      label="128-Band FFT Spectrum Visualizer"
                    />
                  </div>
                </div>
              )}

              {/* ─── 4. AUDIO TAB ─── */}
              {tab === "audio" && (
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                    <p className="text-xs font-semibold text-neutral-300 mb-3">Audio Output</p>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-white/5">
                      <Volume2 className="w-4 h-4 text-primary shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-white">PipeWire / ALSA Hi-Res</p>
                        <p className="text-[10px] text-neutral-400">Lossless 24-bit / 96kHz Output Engine</p>
                      </div>
                      <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                    <p className="text-xs font-semibold text-neutral-300 mb-2">Music Library</p>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                      <HardDrive className="w-3.5 h-3.5" />
                      <span>Local directory: <code className="text-white font-mono">~/Music</code></span>
                    </div>
                    <button
                      onClick={() => window.location.reload()}
                      className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-neutral-300 hover:text-white transition-colors active:scale-95"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Rescan Library
                    </button>
                  </div>
                </div>
              )}

              {/* ─── 5. LAST.FM TAB ─── */}
              {tab === "lastfm" && (
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-red-950/40 via-neutral-900/60 to-black/80 border border-red-500/20 relative overflow-hidden">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center shadow-lg text-white font-bold text-sm font-mono">
                          as
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-xs font-bold text-white">Last.fm Scrobbler</h3>
                            {lastFmConfig.hasSession && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Connected
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-neutral-400 mt-0.5">
                            {lastFmConfig.hasSession
                              ? `Logged in as @${lastFmConfig.username}`
                              : "Automatically sync your Cadence listening history & Now Playing status."}
                          </p>
                        </div>
                      </div>

                      {lastFmConfig.hasSession && (
                        <button
                          onClick={handleLastFmDisconnect}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-neutral-300 hover:text-red-400 border border-white/10 text-xs font-medium transition-colors"
                          title="Disconnect Account"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Disconnect</span>
                        </button>
                      )}
                    </div>

                    {lastFmConfig.hasSession && (
                      <div className="mt-4 pt-4 border-t border-white/10">
                        <Toggle
                          checked={lastFmConfig.enabled}
                          onChange={handleLastFmToggle}
                          label="Live Scrobbling & Now Playing"
                          description="Sends Now Playing updates and scrobbles tracks played over 50% (max 4 mins)."
                        />
                      </div>
                    )}
                  </div>

                  {!lastFmConfig.hasSession && (
                    <form onSubmit={handleLastFmConnect} className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3.5">
                      <p className="text-xs font-semibold text-neutral-300">Account Credentials</p>

                      {authError && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{authError}</span>
                        </div>
                      )}

                      {authSuccess && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
                          <Check className="w-4 h-4 shrink-0" />
                          <span>{authSuccess}</span>
                        </div>
                      )}

                      <div className="space-y-2.5">
                        <div className="relative">
                          <User className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3" />
                          <input
                            type="text"
                            placeholder="Last.fm Username"
                            value={usernameInput}
                            onChange={e => setUsernameInput(e.target.value)}
                            className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500/60 transition-colors"
                            required
                          />
                        </div>

                        <div className="relative">
                          <Lock className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3" />
                          <input
                            type="password"
                            placeholder="Password"
                            value={passwordInput}
                            onChange={e => setPasswordInput(e.target.value)}
                            className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500/60 transition-colors"
                            required
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 active:scale-[0.99] text-white text-xs font-semibold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {authLoading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Authenticating with Last.fm...</span>
                          </>
                        ) : (
                          <>
                            <Radio className="w-3.5 h-3.5" />
                            <span>Connect with Last.fm</span>
                          </>
                        )}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* ─── 6. UPDATES TAB ─── */}
              {tab === "updates" && (
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-4 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary">
                      <RefreshCw className={`w-6 h-6 ${updateInfo.checking ? "animate-spin" : ""}`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Cadence Music Player</h3>
                      <p className="text-xs text-neutral-400 mt-0.5">Version {updateInfo.currentVersion} • Stable Channel</p>
                    </div>

                    <div className="flex justify-center">
                      <button
                        onClick={checkUpdates}
                        disabled={updateInfo.checking}
                        className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${updateInfo.checking ? "animate-spin" : ""}`} />
                        <span>{updateInfo.checking ? "Checking for Updates..." : "Check for Updates"}</span>
                      </button>
                    </div>

                    {updateInfo.checked && (
                      <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-xs text-neutral-300">
                        {updateInfo.updateAvailable ? (
                          <div className="text-emerald-400 font-semibold">A new update is available ({updateInfo.latestVersion})!</div>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5 text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Cadence is up to date! (v{updateInfo.currentVersion})</span>
                          </div>
                        )}
                        {updateInfo.releaseNotes && (
                          <p className="text-[11px] text-neutral-400 mt-2 font-mono">{updateInfo.releaseNotes}</p>
                        )}
                      </div>
                    )}
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
