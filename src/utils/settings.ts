import { PlayerBarPosition, PlayerBarStyle, LibraryPosition, SidebarPosition, ThemeMode } from "../types";

export type PerformanceMode = "quality" | "balanced" | "performance" | "ultra-low";

export type UiDensity = "comfortable" | "compact" | "spacious";

export interface AppSettings {
  performanceMode: PerformanceMode;
  themeMode?: ThemeMode;
  uiDensity?: UiDensity;
  enableAmbientGlow: boolean;
  enableGlassBlur: boolean;
  visualizerEnabled: boolean;
  dynamicTheme: boolean;
  autoScrobble: boolean;
  lyricsProvider: "lrclib";
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

export const DEFAULT_SETTINGS: AppSettings = {
  performanceMode: "balanced",
  themeMode: "dark",
  uiDensity: "comfortable",
  enableAmbientGlow: true,
  enableGlassBlur: true,
  visualizerEnabled: true,
  dynamicTheme: true,
  autoScrobble: false,
  lyricsProvider: "lrclib",
  themePreset: "tokyo-night",
  accentColor: "#7aa2f7",
  customGradientStart: "#1f2335",
  customGradientEnd: "#13141c",
  customGradientAngle: 145,
  glowIntensity: 0.7,
  playerBarPosition: "bottom",
  playerBarStyle: "floating",
  libraryPosition: "left",
  sidebarPosition: "right"
};

export function loadSettings(): AppSettings {
  try {
    const saved = localStorage.getItem("cadence_settings");
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_SETTINGS;
}