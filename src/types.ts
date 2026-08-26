/** Shared contracts between Electron main, preload bridge, and renderer. */

export interface Track {
  /** Stable id: sha1 of absolute path. */
  id: string;
  path: string;
  fileName: string;
  title: string;
  artist: string;
  album: string;
  albumArtist?: string;
  year?: number;
  genre?: string;
  trackNo?: number;
  discNo?: number;
  durationSec: number;
  bitrateKbps?: number;
  sampleRateHz?: number;
  bitDepth?: number;
  /** e.g. "flac" | "mp3" | "ape" */
  codec: string;
  container: string;
  lossless: boolean;
  /** Small embedded cover (max ~256px) as data URL; undefined if none. */
  artThumbDataUrl?: string;
}

export interface ScanResult {
  added: number;
  updated: number;
  removed: number;
  total: number;
}

export interface LibraryData {
  folders: string[];
  tracks: Track[];
  lastScanAt?: number;
}

export interface ScanProgress {
  done: number;
  total: number;
  currentFile: string;
}

export type WindowAction = "close" | "minimize" | "toggle-maximize";

export interface DecodeRequest {
  path: string;
  /** Start offset in seconds (ffmpeg -ss). */
  seekSec: number;
}

export interface DecodeHandle {
  streamId: string;
  sampleRate: number;
  channels: number;
  durationSec: number;
}

/** Shape exposed on window.cadence via contextBridge. */
export interface CadenceApi {
  loadLibrary(): Promise<LibraryData>;
  pickAndScanFolder(): Promise<ScanResult | null>;
  rescanAll(): Promise<ScanResult>;
  removeFolder(folder: string): Promise<ScanResult>;
  /** Full-size art data URL for a track id, LRU-cached in main. */
  getArt(trackId: string): Promise<string | null>;
  onScanProgress(cb: (p: ScanProgress) => void): () => void;

  /**
   * Universal decode fallback: ffmpeg -> raw PCM s16le chunks pushed to renderer.
   * Only one stream is active at a time; starting a new one stops the previous.
   */
  decode(req: DecodeRequest): Promise<DecodeHandle | null>;
  stopDecode(): Promise<void>;
  /** Raw PCM s16le chunks for the active stream (48000 Hz, 2ch). */
  onDecodeChunk(cb: (streamId: string, chunk: ArrayBuffer) => void): () => void;
  /** Process exit for the active stream. */
  onDecodeEnd(cb: (streamId: string, code: number | null) => void): () => void;

  windowControl(action: WindowAction): void;
  isMaximized(): Promise<boolean>;
  onWindowStateChanged(cb: (maximized: boolean) => void): () => void;

  openPath(path: string): Promise<void>;
}

declare global {
  interface Window {
    cadence: CadenceApi;
  }
}
