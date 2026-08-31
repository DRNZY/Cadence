import { create } from "zustand";
import type { Track } from "../types";
import { engine } from "../audio/engine";
import { useLibrary } from "./library";

export type RepeatMode = "off" | "all" | "one";

interface PlayerState {
  status: "stopped" | "loading" | "playing" | "paused";
  trackId: string | null;
  queue: string[];
  /** Index into queue of the playing track. */
  queueIndex: number;
  positionSec: number;
  durationSec: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;

  playTrack(id: string, queue?: string[]): Promise<void>;
  toggle(): void;
  next(): void;
  prev(): void;
  seek(sec: number): void;
  setVolume(v: number): void;
  toggleMute(): void;
  cycleRepeat(): void;
  toggleShuffle(): void;
}

const stored = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(`cadence.${key}`);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
};

const persist = (key: string, value: unknown) => {
  try {
    localStorage.setItem(`cadence.${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
};

/** Shuffle that keeps the currently playing item first. */
const shuffledFrom = (queue: string[], currentId: string | null): string[] => {
  if (!currentId || !queue.includes(currentId)) return [...queue].sort(() => Math.random() - 0.5);
  const rest = queue.filter((id) => id !== currentId);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [currentId, ...rest];
};

let rafId: number | null = null;
let lastTick = 0;

export const usePlayer = create<PlayerState>((set, get) => {
  const stopLoop = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  };
  const tick = (t: number) => {
    if (t - lastTick > 200) {
      lastTick = t;
      set({ positionSec: engine.positionSec });
    }
    rafId = requestAnimationFrame(tick);
  };

  const effectiveQueue = (): string[] =>
    get().shuffle ? shuffledFrom(get().queue, get().trackId) : get().queue;

  const playAt = async (queue: string[], index: number) => {
    const lib = (await import("./library")).useLibrary.getState();
    const id = queue[index];
    const track: Track | undefined = lib.tracks[id];
    if (!track) return;
    set({ status: "loading", trackId: id, queueIndex: index, positionSec: 0, durationSec: track.durationSec });
    try {
      await engine.load(track);
      await engine.play();
      set({ status: "playing" });
      stopLoop();
      rafId = requestAnimationFrame(tick);
    } catch (e) {
      console.warn("playback failed", e);
      set({ status: "stopped" });
    }
  };

  return {
    status: "stopped",
    trackId: null,
    queue: [],
    queueIndex: -1,
    positionSec: 0,
    durationSec: 0,
    volume: stored("volume", 0.85),
    muted: false,
    shuffle: stored("shuffle", false),
    repeat: stored("repeat", "off"),

    playTrack: async (id, queue) => {
      const q = queue ?? [id];
      await playAt(q, q.indexOf(id));
    },

    toggle: () => {
      const s = get();
      if (s.status === "playing") {
        engine.pause();
        set({ status: "paused" });
        stopLoop();
      } else if (s.status === "paused") {
        void engine.play().then(() => {
          set({ status: "playing" });
          stopLoop();
          rafId = requestAnimationFrame(tick);
        });
      } else if (s.trackId) {
        void s.playTrack(s.trackId, s.queue);
      }
    },

    next: () => {
      const s = get();
      const q = s.shuffle ? effectiveQueue() : s.queue;
      const idx = q.indexOf(s.trackId ?? "");
      const atEnd = idx + 1 >= q.length;
      if (atEnd && s.repeat === "all") return void playAt(q, 0);
      if (atEnd) {
        engine.stop();
        set({ status: "stopped", positionSec: 0 });
        stopLoop();
        return;
      }
      void playAt(q, idx + 1);
    },

    prev: () => {
      const s = get();
      if (engine.positionSec > 3) return engine.seek(0);
      const q = s.shuffle ? effectiveQueue() : s.queue;
      const idx = q.indexOf(s.trackId ?? "");
      if (idx > 0) void playAt(q, idx - 1);
      else engine.seek(0);
    },

    seek: (sec) => {
      engine.seek(sec);
      set({ positionSec: sec });
    },

    setVolume: (v) => {
      const clamped = Math.min(1, Math.max(0, v));
      engine.setVolume(get().muted ? 0 : clamped);
      persist("volume", clamped);
      set({ volume: clamped });
    },

    toggleMute: () => {
      const muted = !get().muted;
      engine.setVolume(muted ? 0 : get().volume);
      set({ muted });
    },

    cycleRepeat: () => {
      const order: RepeatMode[] = ["off", "all", "one"];
      const next = order[(order.indexOf(get().repeat) + 1) % order.length];
      persist("repeat", next);
      set({ repeat: next });
    },

    toggleShuffle: () => {
      const shuffle = !get().shuffle;
      persist("shuffle", shuffle);
      set({ shuffle });
    },
  };
});

// Engine events -> store
engine.onEnded(() => {
  const s = usePlayer.getState();
  if (s.repeat === "one" && s.trackId) {
    engine.seek(0);
    void engine.play();
  } else {
    s.next();
  }
});

export const useCurrentTrack = (): Track | null => {
  const trackId = usePlayer((s) => s.trackId);
  return useLibrary((l) => (trackId ? l.tracks[trackId] ?? null : null));
};
