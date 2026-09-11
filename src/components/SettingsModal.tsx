import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Zap, Cpu, Sparkles, Monitor, CheckCircle2,
  Volume2, RefreshCw, HardDrive, Radio,
  User, Lock, Layout, Palette, Check, AlertCircle,
  LogOut, AlignLeft, ArrowDown, ArrowUp, Sun, Moon,
  Dock
} from "lucide-react";
import { THEME_PRESETS, buildCustomGradient, applyThemeColors } from "../utils/colorExtractor";
import { PlayerBarPosition, PlayerBarStyle, LibraryPosition, SidebarPosition, ThemeMode } from "../types";

export type PerformanceMode = "quality" | "balanced" | "performance" | "ultra-low";

export interface AppSettings {
  performanceMode: PerformanceMode;
  themeMode?: ThemeMode;
  enableAmbientGlow: boolean;
  enableGlassBlur: boolean;
  enableMotionBlur: boolean;
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
  playerBarStyle?: PlayerBarStyle;
  libraryPosition: LibraryPosition;
  sidebarPosition: SidebarPosition;
}

const DEFAULT_SETTINGS: AppSettings = {
  performanceMode: "balanced",
  themeMode: "dark",
  enableAmbientGlow: true,
  enableGlassBlur: true,
  enableMotionBlur: true,
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
  playerBarStyle: "floating",
  libraryPosition: "left",
  sidebarPosition: "right"
};

const PERF_MODES: {
  id: PerformanceMode;
  label: string;
  summary: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "quality",
    label: "Cinematic",
    summary: "Full ambient glow, blur, and audio spectrum",
    icon: <Sparkles className="w-4 h-4 text-sky-400" />,
  },
  {
    id: "balanced",
    label: "Balanced",
    summary: "Standard glow and blur with efficient rendering",
    icon: <Monitor className="w-4 h-4 text-cyan-400" />,
  },
  {
    id: "performance",
    label: "Power Saver",
    summary: "Disables ambient glow and blur for lower power consumption",
    icon: <Cpu className="w-4 h-4 text-emerald-400" />,
  },
  {
    id: "ultra-low",
    label: "Audio Only",
    summary: "Minimal visual effects for background playback",
    icon: <Zap className="w-4 h-4 text-amber-400" />,
  },
];

// Apple Inset Grouped Switch Toggle with High-Contrast Affordance
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
    <div
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={`flex items-center justify-between gap-4 py-3 px-4 cursor-pointer select-none transition-colors hover:bg-white/[0.02] ${
        disabled ? "opacity-40 pointer-events-none" : ""
      }`}
    >
      <div className="min-w-0 flex-1 pr-2">
        <p className="text-xs font-semibold text-white tracking-tight">{label}</p>
        {description && <p className="text-[11px] text-neutral-400 mt-0.5 leading-normal">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={e => {
          e.stopPropagation();
          onChange(!checked);
        }}
        className={`shrink-0 relative w-[46px] h-[28px] rounded-full p-[2px] transition-colors duration-200 outline-none active:scale-[0.96] ${
          checked
            ? "bg-[#34c759] border border-[#34c759]"
            : "bg-white/15 border border-white/20 hover:bg-white/20"
        }`}
      >
        <div
          className={`w-[22px] h-[22px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.35)] transition-transform duration-200 ${
            checked ? "translate-x-[18px]" : "translate-x-0"
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
    currentVersion: "3.0.0",
    latestVersion: "3.0.0",
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
        currentVersion: data.currentVersion || "3.0.0",
        latestVersion: data.latestVersion || "3.0.0",
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

  const persistDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootUpdateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafThemeRef = useRef<number | null>(null);

  const [localColors, setLocalColors] = useState({
    accentColor: settings.accentColor || "#38bdf8",
    customGradientStart: settings.customGradientStart || "#0f172a",
    customGradientEnd: settings.customGradientEnd || "#020617",
  });

  useEffect(() => {
    setLocalColors({
      accentColor: settings.accentColor || "#38bdf8",
      customGradientStart: settings.customGradientStart || "#0f172a",
      customGradientEnd: settings.customGradientEnd || "#020617",
    });
  }, [settings.accentColor, settings.customGradientStart, settings.customGradientEnd]);

  const persistSettings = useCallback((updated: AppSettings, immediate = false) => {
    try {
      localStorage.setItem("cadence_settings", JSON.stringify(updated));
    } catch {}

    if (immediate) {
      if (persistDebounceRef.current) clearTimeout(persistDebounceRef.current);
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      }).catch(() => {});
      return;
    }

    if (persistDebounceRef.current) clearTimeout(persistDebounceRef.current);
    persistDebounceRef.current = setTimeout(() => {
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      }).catch(() => {});
    }, 300);
  }, []);

  const set = <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    const updated = { ...settings, [key]: val };
    onSettingsChange(updated);
    persistSettings(updated, true);
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
    persistSettings(updated, true);

    const customTheme = buildCustomGradient(preset.startColor, preset.endColor, preset.angle, preset.accent);
    applyThemeColors(customTheme);
  };

  const handleCustomThemeChange = (
    key: "accentColor" | "customGradientStart" | "customGradientEnd",
    val: string
  ) => {
    const nextColors = {
      ...localColors,
      [key]: val
    };
    setLocalColors(nextColors);

    if (rafThemeRef.current) cancelAnimationFrame(rafThemeRef.current);
    rafThemeRef.current = requestAnimationFrame(() => {
      const customTheme = buildCustomGradient(
        nextColors.customGradientStart,
        nextColors.customGradientEnd,
        settings.customGradientAngle || 145,
        nextColors.accentColor
      );
      applyThemeColors(customTheme);
    });

    if (rootUpdateDebounceRef.current) clearTimeout(rootUpdateDebounceRef.current);
    rootUpdateDebounceRef.current = setTimeout(() => {
      const updated: AppSettings = {
        ...settings,
        themePreset: "custom",
        dynamicTheme: false,
        [key]: val
      };
      onSettingsChange(updated);
      persistSettings(updated, false);
    }, 150);
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
      setAuthError("Enter your Last.fm username and password.");
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
        setAuthSuccess(`Connected as @${data.username}`);
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

  const navItems = [
    { id: "layout", label: "Layout & Dock", icon: <Layout className="w-4 h-4" /> },
    { id: "theme", label: "Appearance", icon: <Palette className="w-4 h-4" /> },
    { id: "performance", label: "Performance", icon: <Cpu className="w-4 h-4" /> },
    { id: "audio", label: "Audio Output", icon: <Volume2 className="w-4 h-4" /> },
    { id: "lastfm", label: "Scrobbling", icon: <Radio className="w-4 h-4" /> },
    { id: "updates", label: "Updates", icon: <RefreshCw className="w-4 h-4" /> }
  ] as const;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />

          {/* Apple macOS-Style Settings Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: "spring", stiffness: 450, damping: 32 }}
            className="settings-modal-dialog relative w-full max-w-3xl h-[620px] max-h-[90vh] flex rounded-3xl border border-white/10 overflow-hidden shadow-2xl transition-colors duration-200"
            style={{
              background: settings.themeMode === "light" ? "rgba(255, 255, 255, 0.98)" : "rgba(13, 14, 20, 0.97)"
            }}
          >
            {/* ─── LEFT SIDEBAR NAVIGATION ─── */}
            <div className="w-52 shrink-0 border-r border-white/5 p-4 flex flex-col justify-between bg-black/30 select-none">
              <div className="space-y-1">
                <div className="px-3 py-2 mb-2">
                  <h2 className="text-sm font-bold text-white tracking-tight">Settings</h2>
                </div>

                {navItems.map(item => {
                  const active = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setTab(item.id)}
                      className={`w-full px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-3 transition-colors active:scale-[0.98] ${
                        active
                          ? "bg-white/15 text-white font-semibold shadow-sm"
                          : "text-neutral-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <span className={active ? "text-primary" : "text-neutral-400"}>
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="px-3 py-2 border-t border-white/5">
                <p className="text-[10px] font-mono text-neutral-500">Cadence v{updateInfo.currentVersion}</p>
              </div>
            </div>

            {/* ─── RIGHT CONTENT PANE ─── */}
            <div className="flex-1 flex flex-col min-w-0 bg-neutral-950/40">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0 select-none">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                  {navItems.find(n => n.id === tab)?.label}
                </h3>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-colors active:scale-95"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Content Body with Apple Inset Grouped Cards */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 no-scrollbar">

                {/* ─── 1. LAYOUT & DOCK TAB ─── */}
                {tab === "layout" && (
                  <div className="space-y-4">
                    {/* Bottom Bar Themes */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-neutral-300 px-1">Player Bar Theme</p>
                      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 grid grid-cols-3 gap-2.5">
                        {([
                          { id: "floating", label: "Floating Pill", icon: <Dock className="w-3.5 h-3.5" /> },
                          { id: "full", label: "Full Dock", icon: <ArrowDown className="w-3.5 h-3.5" /> },
                          { id: "minimal", label: "Minimal", icon: <AlignLeft className="w-3.5 h-3.5" /> },
                        ] as const).map(theme => {
                          const active = (settings.playerBarStyle || "floating") === theme.id;
                          return (
                            <button
                              key={theme.id}
                              onClick={() => set("playerBarStyle", theme.id)}
                              className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-medium active:scale-95 ${
                                active
                                  ? "bg-white/15 border-white/30 text-white shadow-sm font-bold"
                                  : "bg-black/30 border-white/5 text-neutral-400 hover:text-white hover:border-white/15"
                              }`}
                            >
                              {theme.icon}
                              <span>{theme.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Bar Position */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-neutral-300 px-1">Bar Position</p>
                      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 grid grid-cols-3 gap-2.5">
                        {([
                          { id: "bottom", label: "Bottom", icon: <ArrowDown className="w-3.5 h-3.5" /> },
                          { id: "top", label: "Top", icon: <ArrowUp className="w-3.5 h-3.5" /> },
                          { id: "left", label: "Left Sidebar", icon: <AlignLeft className="w-3.5 h-3.5" /> },
                        ] as const).map(pos => {
                          const active = settings.playerBarPosition === pos.id;
                          return (
                            <button
                              key={pos.id}
                              onClick={() => set("playerBarPosition", pos.id)}
                              className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-medium active:scale-95 ${
                                active
                                  ? "bg-white/15 border-white/30 text-white shadow-sm font-bold"
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

                    {/* Panels Arrangement */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-neutral-300 px-1">Side Panel Placement</p>
                      <div className="rounded-2xl bg-white/[0.03] border border-white/10 divide-y divide-white/5 overflow-hidden">
                        <div className="p-3.5 flex items-center justify-between">
                          <span className="text-xs font-medium text-white">Music Library</span>
                          <div className="flex bg-black/40 p-1 rounded-xl border border-white/10">
                            <button
                              onClick={() => set("libraryPosition", "left")}
                              className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                                settings.libraryPosition === "left" ? "bg-white/20 text-white font-semibold" : "text-neutral-400 hover:text-white"
                              }`}
                            >
                              Left
                            </button>
                            <button
                              onClick={() => set("libraryPosition", "right")}
                              className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                                settings.libraryPosition === "right" ? "bg-white/20 text-white font-semibold" : "text-neutral-400 hover:text-white"
                              }`}
                            >
                              Right
                            </button>
                          </div>
                        </div>

                        <div className="p-3.5 flex items-center justify-between">
                          <span className="text-xs font-medium text-white">Lyrics & Widgets</span>
                          <div className="flex bg-black/40 p-1 rounded-xl border border-white/10">
                            <button
                              onClick={() => set("sidebarPosition", "right")}
                              className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                                settings.sidebarPosition === "right" ? "bg-white/20 text-white font-semibold" : "text-neutral-400 hover:text-white"
                              }`}
                            >
                              Right
                            </button>
                            <button
                              onClick={() => set("sidebarPosition", "left")}
                              className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                                settings.sidebarPosition === "left" ? "bg-white/20 text-white font-semibold" : "text-neutral-400 hover:text-white"
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

                {/* ─── 2. APPEARANCE TAB ─── */}
                {tab === "theme" && (
                  <div className="space-y-4">
                    {/* Appearance Mode */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-neutral-300 px-1">Appearance</p>
                      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 grid grid-cols-2 gap-3">
                        <button
                          onClick={() => set("themeMode", "dark")}
                          className={`p-3 rounded-xl border flex items-center gap-3 transition-all active:scale-95 ${
                            (settings.themeMode || "dark") === "dark"
                              ? "border-primary bg-primary/20 text-white shadow-sm"
                              : "border-white/5 bg-black/40 text-neutral-400 hover:text-white"
                          }`}
                        >
                          <Moon className="w-4 h-4 text-primary" />
                          <div className="text-left">
                            <div className="text-xs font-bold text-white">Dark</div>
                            <div className="text-[10px] text-neutral-400">Obsidian glass</div>
                          </div>
                        </button>

                        <button
                          onClick={() => set("themeMode", "light")}
                          className={`p-3 rounded-xl border flex items-center gap-3 transition-all active:scale-95 ${
                            settings.themeMode === "light"
                              ? "border-amber-400 bg-amber-400/20 text-white shadow-sm"
                              : "border-white/5 bg-black/40 text-neutral-400 hover:text-white"
                          }`}
                        >
                          <Sun className="w-4 h-4 text-amber-400" />
                          <div className="text-left">
                            <div className="text-xs font-bold text-white">Light</div>
                            <div className="text-[10px] text-neutral-400">Daylight frosted</div>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Dynamic Hue Extraction */}
                    <div className="rounded-2xl bg-white/[0.03] border border-white/10 overflow-hidden">
                      <Toggle
                        checked={settings.dynamicTheme}
                        onChange={v => {
                          set("dynamicTheme", v);
                          if (!v) handleApplyThemePreset(settings.themePreset || "graphite");
                        }}
                        label="Dynamic Album Art Glow"
                        description="Derives accent colors directly from active album artwork."
                      />
                    </div>

                    {/* Curated Presets */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-neutral-300 px-1">Color Presets</p>
                      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {THEME_PRESETS.map(preset => {
                          const active = !settings.dynamicTheme && settings.themePreset === preset.id;
                          return (
                            <button
                              key={preset.id}
                              onClick={() => handleApplyThemePreset(preset.id)}
                              className={`p-2.5 rounded-xl border flex flex-col items-start gap-2 transition-all text-left active:scale-95 ${
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
                                <span className="text-xs font-semibold text-white">{preset.name}</span>
                              </div>
                              <div
                                className="w-full h-2.5 rounded-md border border-white/10"
                                style={{ background: `linear-gradient(${preset.angle}deg, ${preset.startColor}, ${preset.endColor})` }}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Custom Accent Swatches */}
                    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 space-y-3">
                      <p className="text-xs font-semibold text-white">Accent Palette</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {[
                          { name: "Sky", color: "#38bdf8" },
                          { name: "Emerald", color: "#10b981" },
                          { name: "Amber", color: "#f59e0b" },
                          { name: "Violet", color: "#8b5cf6" },
                          { name: "Pink", color: "#ec4899" },
                          { name: "Cyan", color: "#06b6d4" },
                          { name: "Rose", color: "#f43f5e" },
                          { name: "Arctic", color: "#f8fafc" },
                        ].map(swatch => {
                          const isCurrent = localColors.accentColor.toLowerCase() === swatch.color.toLowerCase();
                          return (
                            <button
                              key={swatch.name}
                              type="button"
                              title={swatch.name}
                              onClick={() => handleCustomThemeChange("accentColor", swatch.color)}
                              className={`w-6 h-6 rounded-full transition-transform flex items-center justify-center ${
                                isCurrent ? "ring-2 ring-white scale-110 shadow-md" : "opacity-80 hover:opacity-100 hover:scale-105"
                              }`}
                              style={{ backgroundColor: swatch.color }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── 3. PERFORMANCE TAB (CLEAN - ZERO FAKE RAM BADGES) ─── */}
                {tab === "performance" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-neutral-300 px-1">Performance Mode</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                              className={`text-left p-3.5 rounded-2xl border transition-all relative active:scale-[0.98] ${
                                active
                                  ? "border-white/30 bg-white/10 shadow-sm"
                                  : "border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/15"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 mb-1.5">
                                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
                                  {mode.icon}
                                </div>
                                <span className="text-xs font-bold text-white">{mode.label}</span>
                                {active && <CheckCircle2 className="w-3.5 h-3.5 text-primary ml-auto" />}
                              </div>
                              <p className="text-[11px] text-neutral-400 leading-normal">{mode.summary}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-neutral-300 px-1">Visual Effects</p>
                      <div className="rounded-2xl bg-white/[0.03] border border-white/10 divide-y divide-white/5 overflow-hidden">
                        <Toggle
                          checked={settings.enableAmbientGlow}
                          onChange={v => set("enableAmbientGlow", v)}
                          label="Ambient Glow"
                          description="Reflective background illumination matching the active album art."
                        />
                        <Toggle
                          checked={settings.enableGlassBlur}
                          onChange={v => set("enableGlassBlur", v)}
                          label="Background Blur"
                          description="Frosted glass translucent backdrop filtering."
                        />
                        <Toggle
                          checked={settings.enableMotionBlur}
                          onChange={v => set("enableMotionBlur", v)}
                          label="Motion Blur"
                          description="Directional velocity blur during window resizing and divider dragging."
                        />
                        <Toggle
                          checked={settings.visualizerEnabled}
                          onChange={v => set("visualizerEnabled", v)}
                          label="Audio Spectrum"
                          description="Real-time frequency visualizer canvas."
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── 4. AUDIO OUTPUT TAB ─── */}
                {tab === "audio" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-neutral-300 px-1">Audio Device</p>
                      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-primary shrink-0">
                            <Volume2 className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">System Audio Engine</p>
                            <p className="text-[11px] text-neutral-400">Direct ALSA / PipeWire 32-bit float audio pipeline</p>
                          </div>
                          <span className="ml-auto flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Active
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-neutral-300 px-1">Local Library</p>
                      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 space-y-3">
                        <div className="flex items-center gap-2 text-xs text-neutral-300">
                          <HardDrive className="w-4 h-4 text-neutral-400 shrink-0" />
                          <span>Path: <code className="text-white font-mono bg-white/5 px-2 py-0.5 rounded">~/Music</code></span>
                        </div>
                        <button
                          onClick={() => window.location.reload()}
                          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition-colors active:scale-95"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Rescan Library</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── 5. SCROBBLING TAB ─── */}
                {tab === "lastfm" && (
                  <div className="space-y-4">
                    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center shadow-lg text-white font-bold text-sm font-mono shrink-0">
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
                                ? `@${lastFmConfig.username}`
                                : "Sync listening history and Now Playing status to your Last.fm account."}
                            </p>
                          </div>
                        </div>

                        {lastFmConfig.hasSession && (
                          <button
                            onClick={handleLastFmDisconnect}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-neutral-300 hover:text-red-400 border border-white/10 text-xs font-medium transition-colors"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Disconnect</span>
                          </button>
                        )}
                      </div>

                      {lastFmConfig.hasSession && (
                        <div className="pt-2 border-t border-white/5">
                          <Toggle
                            checked={lastFmConfig.enabled}
                            onChange={handleLastFmToggle}
                            label="Now Playing & Scrobbling"
                            description="Automatically scrobbles tracks played past 50% duration."
                          />
                        </div>
                      )}
                    </div>

                    {!lastFmConfig.hasSession && (
                      <form onSubmit={handleLastFmConnect} className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 space-y-3">
                        <p className="text-xs font-semibold text-white">Connect Account</p>

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

                        <div className="space-y-2">
                          <div className="relative">
                            <User className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3" />
                            <input
                              type="text"
                              placeholder="Username"
                              value={usernameInput}
                              onChange={e => setUsernameInput(e.target.value)}
                              className="w-full pl-10 pr-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500/60 transition-colors"
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
                              className="w-full pl-10 pr-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500/60 transition-colors"
                              required
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={authLoading}
                          className="w-full py-2 px-4 rounded-xl bg-red-600 hover:bg-red-500 active:scale-[0.98] text-white text-xs font-semibold shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {authLoading ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Connecting...</span>
                            </>
                          ) : (
                            <span>Log In to Last.fm</span>
                          )}
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {/* ─── 6. UPDATES TAB ─── */}
                {tab === "updates" && (
                  <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-6 space-y-4 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary">
                      <RefreshCw className={`w-6 h-6 ${updateInfo.checking ? "animate-spin" : ""}`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Cadence</h3>
                      <p className="text-xs text-neutral-400 mt-0.5">Version {updateInfo.currentVersion}</p>
                    </div>

                    <div className="flex justify-center">
                      <button
                        onClick={checkUpdates}
                        disabled={updateInfo.checking}
                        className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${updateInfo.checking ? "animate-spin" : ""}`} />
                        <span>{updateInfo.checking ? "Checking..." : "Check for Updates"}</span>
                      </button>
                    </div>

                    {updateInfo.checked && (
                      <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-xs text-neutral-300">
                        {updateInfo.updateAvailable ? (
                          <div className="text-emerald-400 font-semibold">Update available: v{updateInfo.latestVersion}</div>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5 text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Cadence is up to date (v{updateInfo.currentVersion})</span>
                          </div>
                        )}
                        {updateInfo.releaseNotes && (
                          <p className="text-[11px] text-neutral-400 mt-2 font-mono">{updateInfo.releaseNotes}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
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
