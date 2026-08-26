import type { Track } from "../types";

class AudioEngine {
  private audio: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private endedCallbacks: Array<() => void> = [];
  private currentTrack: Track | null = null;

  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = "anonymous";
    this.audio.preload = "auto";

    this.audio.addEventListener("ended", () => {
      for (const cb of this.endedCallbacks) {
        try { cb(); } catch (e) { console.error(e); }
      }
    });

    this.audio.addEventListener("play", () => {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
      }
    });

    this.audio.addEventListener("pause", () => {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
      }
    });

    this.audio.addEventListener("timeupdate", () => {
      if ("mediaSession" in navigator && this.audio.duration && !isNaN(this.audio.duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: this.audio.duration,
            playbackRate: this.audio.playbackRate || 1.0,
            position: Math.min(this.audio.currentTime, this.audio.duration)
          });
        } catch {}
      }
    });
  }

  private initContext() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.85;

      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = this.audio.volume;

      this.sourceNode = this.ctx.createMediaElementSource(this.audio);
      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);
    } catch (e) {
      console.warn("Could not create Web Audio graph for Cadence:", e);
    }
  }

  get current(): Track | null {
    return this.currentTrack;
  }

  get positionSec(): number {
    return this.audio.currentTime || 0;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  async load(track: Track): Promise<void> {
    this.initContext();
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    this.currentTrack = track;
    // In Electron with custom local protocol or file URL:
    const fileSrc = track.path.startsWith("http") || track.path.startsWith("cadence://") || track.path.startsWith("file://")
      ? track.path
      : `cadence://${encodeURIComponent(track.path)}`;

    this.audio.src = fileSrc;

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.artThumbDataUrl
          ? [{ src: track.artThumbDataUrl, sizes: "256x256", type: "image/jpeg" }]
          : []
      });
    }
  }

  async play(): Promise<void> {
    this.initContext();
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    return this.audio.play();
  }

  pause(): void {
    this.audio.pause();
  }

  stop(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  seek(sec: number): void {
    if (!isNaN(sec)) {
      this.audio.currentTime = Math.max(0, sec);
    }
  }

  setVolume(v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    this.audio.volume = clamped;
    if (this.gainNode) {
      this.gainNode.gain.value = clamped;
    }
  }

  onEnded(cb: () => void): void {
    this.endedCallbacks.push(cb);
  }
}

export const engine = new AudioEngine();
