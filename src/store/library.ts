import { create } from "zustand";
import type { LibraryData, ScanProgress, Track } from "../types";

interface LibraryState {
  tracks: Record<string, Track>;
  /** Insertion order of ids. */
  order: string[];
  folders: string[];
  scanning: boolean;
  progress: ScanProgress | null;
  hydrated: boolean;
  lastError: string | null;

  hydrate(): Promise<void>;
  scanFolder(): Promise<void>;
  rescanAll(): Promise<void>;
  removeFolder(folder: string): Promise<void>;
}

const byTitle = (a: Track, b: Track) =>
  (a.discNo ?? 1) - (b.discNo ?? 1) ||
  (a.trackNo ?? 0) - (b.trackNo ?? 0) ||
  a.title.localeCompare(b.title);

export const sortedTracks = (tracks: Record<string, Track>, order: string[]): Track[] => {
  const list = order.map((id) => tracks[id]).filter(Boolean);
  list.sort(
    (a, b) =>
      a.artist.localeCompare(b.artist) ||
      a.album.localeCompare(b.album) ||
      byTitle(a, b),
  );
  return list;
};

export const useLibrary = create<LibraryState>((set) => ({
  tracks: {},
  order: [],
  folders: [],
  scanning: false,
  progress: null,
  hydrated: false,
  lastError: null,

  hydrate: async () => {
    try {
      const data: LibraryData = await window.cadence.loadLibrary();
      const tracks: Record<string, Track> = {};
      for (const t of data.tracks) tracks[t.id] = t;
      set({
        tracks,
        order: data.tracks.map((t) => t.id),
        folders: data.folders,
        hydrated: true,
      });
    } catch (e) {
      set({ hydrated: true, lastError: String(e) });
    }
  },

  scanFolder: async () => {
    set({ scanning: true, progress: null });
    try {
      const result = await window.cadence.pickAndScanFolder();
      if (!result) return;
      await useLibrary.getState().hydrate();
    } catch (e) {
      set({ lastError: String(e) });
    } finally {
      set({ scanning: false, progress: null });
    }
  },

  rescanAll: async () => {
    set({ scanning: true, progress: null });
    try {
      await window.cadence.rescanAll();
      await useLibrary.getState().hydrate();
    } catch (e) {
      set({ lastError: String(e) });
    } finally {
      set({ scanning: false, progress: null });
    }
  },

  removeFolder: async (folder) => {
    try {
      await window.cadence.removeFolder(folder);
      await useLibrary.getState().hydrate();
    } catch (e) {
      set({ lastError: String(e) });
    }
  },
}));

window.cadence?.onScanProgress((p) => useLibrary.setState({ progress: p }));
