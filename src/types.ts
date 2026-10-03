export interface LyricWord {
  start: number;
  end?: number;
  text: string;
}

export interface LyricLine {
  time: number;
  text: string;
  words?: LyricWord[];
}

export interface LyricsState {
  synced: boolean;
  source: "local" | "online" | "cache" | "none";
  provider?: string;
  isInstrumental?: boolean;
  hasWordSync?: boolean;
  lines: LyricLine[];
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  year?: string;
  trackNumber?: number;
  duration: number;
  format: string;
  bitrate?: number;
  sampleRate?: number;
  filePath: string;
  coverPath?: string;
  hasLyrics: boolean;
  size: number;
  /** REPLAYGAIN_TRACK_GAIN in dB, when the tag exists. */
  replayGainTrack?: number;
  /** REPLAYGAIN_ALBUM_GAIN in dB, when the tag exists. */
  replayGainAlbum?: number;
  /** Legacy alias, track-then-album. Prefer the two fields above. */
  replayGain?: number;
  bitsPerSample?: number;
  /**
   * ALBUMARTIST, separate from the track artist. Present on most well-tagged
   * files and the field that identifies a release when tracks carry individual
   * credits.
   */
  albumArtist?: string;
  /** Disc number, when the file carries one. Multi-disc sets order by this. */
  discNumber?: number;
  /** True when the file is flagged as part of a compilation. */
  compilation?: boolean;
  /**
   * Stable identity of the release, computed once by the server. MusicBrainz ID
   * when tagged, otherwise a normalised album-artist + album + disc key.
   *
   * Optional only so cached libraries written by an older server still
   * deserialise; `albumGroupKey` in LibraryBrowser falls back to the name pair
   * when it is absent.
   */
  albumId?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
  coverPath?: string;
}

export interface DspSettings {
  /**
   * Seconds of equal-power crossfade between tracks. 0 disables the crossfade
   * rather than enabling sample-accurate gapless: the decoder is an
   * HTMLMediaElement, so a source change restarts it and cannot be scheduled
   * to the sample. Do not label 0 as "gapless" in the UI.
   */
  crossfadeSeconds: number;
  replayGainEnabled: boolean;
  replayGainMode: "track" | "album";
  preampGain: number; // -6dB to +6dB
  /**
   * Attenuates the whole EQ by the largest positive band boost so a boosted
   * curve cannot push the sum past 0 dBFS. This is what separates a
   * parametric EQ from a toy one: without it, +6 dB on three bands means the
   * limiter, and a limiter means the EQ is lying about what it did.
   */
  eqHeadroomCompensation: boolean;
  /** Engages the convolution room. Only meaningful once an IR is loaded. */
  convolutionEnabled: boolean;
  /** Name of the loaded impulse response, for display. */
  convolutionName?: string;
  /** Ceiling for the output safety limiter, in dBFS. */
  ceilingDb: number;
}

export type DeckMode = "cover" | "vinyl" | "cd" | "minimal";
export type VisualizerMode = "bars" | "wave" | "radial" | "oscilloscope";
export type LayoutMode = "studio" | "stage" | "browser";
export type ThemeMode = "dark" | "light";
export type PlayerBarPosition = "bottom" | "top" | "left";
export type PlayerBarStyle = "floating" | "full" | "minimal";
export type LibraryPosition = "left" | "right";
export type SidebarPosition = "right" | "left";

export type WidgetId = "visualizer" | "lyrics" | "queue" | "trackDetails";

export interface WidgetConfig {
  id: WidgetId;
  title: string;
  enabled: boolean;
}

export interface ThemeConfig {
  accentColor: string;
  bgMode: "dynamic" | "custom" | "obsidian" | "graphite" | "sunset" | "nordic" | "emerald";
  customGradientStart: string;
  customGradientEnd: string;
  customGradientAngle: number;
  glowIntensity: number; // 0.0 to 1.0
  glassBlur: number; // 0 to 40 px
}

export interface EqualizerPreset {
  name: string;
  gains: number[];
}

export const PRESETS: EqualizerPreset[] = [
  { name: "Flat", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: "Bass Boost", gains: [7, 6, 4, 1, 0, 0, 1, 2, 3, 3] },
  { name: "Vinyl Warmth", gains: [4, 5, 4, 3, 2, 1, 0, -1, -2, -3] },
  { name: "Vocal Clarity", gains: [-3, -2, 0, 2, 5, 4, 3, 2, 1, 0] },
  { name: "Electronic", gains: [6, 7, 3, 0, -2, 2, 4, 5, 6, 5] },
  { name: "Hip-Hop 808", gains: [8, 7, 4, 1, -1, 0, 1, 3, 4, 4] },
  { name: "Acoustic", gains: [2, 3, 2, 1, 2, 3, 4, 4, 3, 2] },
  { name: "Club Punch", gains: [5, 6, 2, 0, 0, 2, 3, 4, 5, 3] }
];
