export interface LyricLine {
  time: number;
  text: string;
}

export interface LyricsState {
  synced: boolean;
  source: "local" | "online" | "cache" | "none";
  provider?: string;
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
  replayGain?: number; // In dB (e.g. -6.5 or +2.1)
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
  gaplessEnabled: boolean;
  crossfadeSeconds: number; // 0 = pure gapless, 1-10s = smooth crossfade
  replayGainEnabled: boolean;
  replayGainMode: "track" | "album";
  preampGain: number; // -6dB to +6dB
}

export type DeckMode = "vinyl" | "cd" | "minimal";
export type VisualizerMode = "bars" | "wave" | "radial" | "oscilloscope";
export type LayoutMode = "panoramic" | "studio" | "stage" | "browser";

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
