import { useState, useEffect, useRef, useCallback } from "react";
import type { Track, DspSettings } from "../types";

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

interface AudioEngineOptions {
  onTrackEnd?: () => void;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
}

export function useAudioEngine(options?: AudioEngineOptions | (() => void)) {
  const optsRef = useRef<AudioEngineOptions>({});
  if (typeof options === "function") {
    optsRef.current = { onTrackEnd: options };
  } else if (options) {
    optsRef.current = options;
  }

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const gainNodeRef = useRef<GainNode | null>(null);
  const replayGainNodeRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const isNodesConnectedRef = useRef<boolean>(false);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [eqGains, setEqGains] = useState<number[]>(new Array(10).fill(0));
  const [isLoading, setIsLoading] = useState(false);

  // DSP Settings State
  const [dspSettings, setDspSettings] = useState<DspSettings>(() => {
    try {
      const saved = localStorage.getItem("cadence_dsp_settings") || localStorage.getItem("auradeck_dsp_settings");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      gaplessEnabled: true,
      crossfadeSeconds: 0, // 0 = gapless, 1-10s = crossfade
      replayGainEnabled: true,
      replayGainMode: "track",
      preampGain: 0
    };
  });

  // Save DSP Settings
  useEffect(() => {
    try {
      localStorage.setItem("cadence_dsp_settings", JSON.stringify(dspSettings));
    } catch {}
  }, [dspSettings]);

  // Apply ReplayGain calculation to replayGainNode
  const updateReplayGain = useCallback((track: Track | null, settings: DspSettings) => {
    if (!replayGainNodeRef.current || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const now = ctx.currentTime;

    if (!settings.replayGainEnabled || !track || track.replayGain === undefined) {
      // Normal preamp without track gain
      const targetGain = Math.pow(10, (settings.preampGain || 0) / 20);
      replayGainNodeRef.current.gain.cancelScheduledValues(now);
      replayGainNodeRef.current.gain.linearRampToValueAtTime(targetGain, now + 0.1);
      return;
    }

    const totalGainDb = track.replayGain + (settings.preampGain || 0);
    // Limit gain compensation to prevent extreme distortion (-15dB to +12dB)
    const clampedGainDb = Math.max(-15, Math.min(12, totalGainDb));
    const linearGain = Math.pow(10, clampedGainDb / 20);

    replayGainNodeRef.current.gain.cancelScheduledValues(now);
    replayGainNodeRef.current.gain.linearRampToValueAtTime(linearGain, now + 0.15);
  }, []);

  // Initialize Web Audio Context & Graph
  const initAudioNodes = useCallback(() => {
    if (isNodesConnectedRef.current || !audioRef.current) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;

      // 1. Analyser Node for 128-band FFT Spectrum
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;
      analyserRef.current = analyser;

      // 2. Master Gain Node (Volume & Mute)
      const gain = ctx.createGain();
      gain.gain.value = isMuted ? 0 : volume;
      gainNodeRef.current = gain;

      // 3. ReplayGain & Preamp Node
      const replayGainNode = ctx.createGain();
      replayGainNode.gain.value = 1.0;
      replayGainNodeRef.current = replayGainNode;

      // 4. Studio Peak Limiter (Soft-Knee Compressor to prevent clipping during high gain EQ/ReplayGain)
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -0.5; // -0.5 dB
      compressor.knee.value = 4;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.15;
      compressorRef.current = compressor;

      // 5. 10-Band Biquad Graphic Equalizer Filters
      const filters = EQ_FREQUENCIES.map((freq, idx) => {
        const filter = ctx.createBiquadFilter();
        if (idx === 0) {
          filter.type = "lowshelf";
        } else if (idx === EQ_FREQUENCIES.length - 1) {
          filter.type = "highshelf";
        } else {
          filter.type = "peaking";
          filter.Q.value = 1.4;
        }
        filter.frequency.value = freq;
        filter.gain.value = eqGains[idx] || 0;
        return filter;
      });
      filtersRef.current = filters;

      if (!sourceNodeRef.current && audioRef.current) {
        const source = ctx.createMediaElementSource(audioRef.current);
        sourceNodeRef.current = source;

        // Audio Chain: Source -> ReplayGain -> EQ Filters -> Analyser -> Master Gain -> Limiter -> Destination
        let prevNode: AudioNode = source;
        prevNode.connect(replayGainNode);
        prevNode = replayGainNode;

        for (const f of filters) {
          prevNode.connect(f);
          prevNode = f;
        }
        prevNode.connect(analyser);
        analyser.connect(gain);
        gain.connect(compressor);
        compressor.connect(ctx.destination);

        isNodesConnectedRef.current = true;
      }
    } catch (e) {
      console.warn("Web Audio API initialization notice:", e);
    }
  }, [volume, isMuted, eqGains]);

  // Handle HTML5 Audio element setup
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    audio.volume = volume;
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);

      // MediaSession position sync
      if ("mediaSession" in navigator && audio.duration && !isNaN(audio.duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate || 1.0,
            position: Math.min(audio.currentTime, audio.duration)
          });
        } catch {}
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      setIsLoading(false);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
      }
    };

    const handlePause = () => {
      setIsPlaying(false);
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
      }
    };

    const handleWaiting = () => setIsLoading(true);
    const handlePlaying = () => setIsLoading(false);
    const handleEnded = () => {
      setIsPlaying(false);
      if (optsRef.current.onTrackEnd) optsRef.current.onTrackEnd();
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  // Update ReplayGain on track or DSP settings change
  useEffect(() => {
    updateReplayGain(currentTrack, dspSettings);
  }, [currentTrack, dspSettings, updateReplayGain]);

  // Play Track with Optional Crossfade
  const playTrack = useCallback(async (track: Track) => {
    initAudioNodes();
    if (audioCtxRef.current?.state === "suspended") {
      await audioCtxRef.current.resume();
    }

    if (!audioRef.current) return;

    setCurrentTrack(track);
    setIsLoading(true);
    const streamUrl = `/stream?path=${encodeURIComponent(track.filePath)}`;

    const crossfade = dspSettings.crossfadeSeconds;
    const ctx = audioCtxRef.current;

    // If crossfade active and already playing, smooth fade out/in
    if (crossfade > 0 && isPlaying && gainNodeRef.current && ctx) {
      const now = ctx.currentTime;
      const originalGain = isMuted ? 0 : volume;
      
      // Fade out
      gainNodeRef.current.gain.cancelScheduledValues(now);
      gainNodeRef.current.gain.setValueAtTime(gainNodeRef.current.gain.value, now);
      gainNodeRef.current.gain.linearRampToValueAtTime(0, now + (crossfade / 2));

      setTimeout(async () => {
        if (!audioRef.current) return;
        audioRef.current.src = streamUrl;
        audioRef.current.playbackRate = playbackRate;
        try {
          await audioRef.current.play();
          setIsPlaying(true);
          // Fade in
          if (gainNodeRef.current && audioCtxRef.current) {
            const inTime = audioCtxRef.current.currentTime;
            gainNodeRef.current.gain.cancelScheduledValues(inTime);
            gainNodeRef.current.gain.setValueAtTime(0, inTime);
            gainNodeRef.current.gain.linearRampToValueAtTime(originalGain, inTime + (crossfade / 2));
          }
        } catch (err) {
          console.error("Playback error:", err);
          setIsPlaying(false);
        }
      }, (crossfade / 2) * 1000);
    } else {
      audioRef.current.src = streamUrl;
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.volume = isMuted ? 0 : volume;

      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        console.error("Playback error:", err);
        setIsPlaying(false);
      }
    }

    // Update MediaSession Metadata & Desktop Notifications
    if ("mediaSession" in navigator) {
      const coverUrl = track.coverPath
        ? `/covers?path=${encodeURIComponent(track.coverPath)}`
        : `/covers`;

      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: [
          { src: coverUrl, sizes: "96x96", type: "image/jpeg" },
          { src: coverUrl, sizes: "128x128", type: "image/jpeg" },
          { src: coverUrl, sizes: "256x256", type: "image/jpeg" },
          { src: coverUrl, sizes: "512x512", type: "image/jpeg" }
        ]
      });
    }

    // Send to Electron Main Process for desktop notifications
    if ((window as any).electronAPI?.sendTrackChange) {
      (window as any).electronAPI.sendTrackChange({
        title: track.title,
        artist: track.artist,
        album: track.album,
        format: track.format
      });
    }
  }, [initAudioNodes, playbackRate, isMuted, volume, isPlaying, dspSettings.crossfadeSeconds]);

  const togglePlayPause = useCallback(async () => {
    if (!audioRef.current) return;
    initAudioNodes();

    if (audioCtxRef.current?.state === "suspended") {
      await audioCtxRef.current.resume();
    }

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  }, [isPlaying, initAudioNodes]);

  const seek = useCallback((timeInSeconds: number) => {
    if (!audioRef.current) return;
    const target = Math.max(0, Math.min(timeInSeconds, duration));
    audioRef.current.currentTime = target;
    setCurrentTime(target);
  }, [duration]);

  const setAudioVolume = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(val, 1));
    setVolume(clamped);
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : clamped;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : clamped;
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      if (audioRef.current) {
        audioRef.current.volume = next ? 0 : volume;
      }
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = next ? 0 : volume;
      }
      return next;
    });
  }, [volume]);

  const setSpeed = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, []);

  const setEqGain = useCallback((bandIndex: number, gainValue: number) => {
    setEqGains(prev => {
      const next = [...prev];
      next[bandIndex] = gainValue;
      if (filtersRef.current[bandIndex]) {
        filtersRef.current[bandIndex].gain.value = gainValue;
      }
      return next;
    });
  }, []);

  const setAllEqGains = useCallback((newGains: number[]) => {
    setEqGains(newGains);
    newGains.forEach((gain, idx) => {
      if (filtersRef.current[idx]) {
        filtersRef.current[idx].gain.value = gain;
      }
    });
  }, []);

  const updateDspSettings = useCallback((newSettings: Partial<DspSettings>) => {
    setDspSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  // Register HTML5 MediaSession MPRIS Action Handlers
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler("play", () => {
        if (!isPlaying) togglePlayPause();
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        if (isPlaying) togglePlayPause();
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        if (optsRef.current.onPreviousTrack) {
          optsRef.current.onPreviousTrack();
        } else {
          seek(0);
        }
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        if (optsRef.current.onNextTrack) {
          optsRef.current.onNextTrack();
        } else if (optsRef.current.onTrackEnd) {
          optsRef.current.onTrackEnd();
        }
      });
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined && details.seekTime !== null) {
          seek(details.seekTime);
        }
      });
      navigator.mediaSession.setActionHandler("seekbackward", (details) => {
        const offset = details.seekOffset || 10;
        seek(currentTime - offset);
      });
      navigator.mediaSession.setActionHandler("seekforward", (details) => {
        const offset = details.seekOffset || 10;
        seek(currentTime + offset);
      });
      navigator.mediaSession.setActionHandler("stop", () => {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
      });
    } catch (e) {
      console.warn("MediaSession action handler notice:", e);
    }
  }, [isPlaying, togglePlayPause, seek, currentTime]);

  const getFrequencyData = useCallback((): Uint8Array => {
    if (!analyserRef.current) return new Uint8Array(0);
    const buffer = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(buffer);
    return buffer;
  }, []);

  const getTimeDomainData = useCallback((): Uint8Array => {
    if (!analyserRef.current) return new Uint8Array(0);
    const buffer = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteTimeDomainData(buffer);
    return buffer;
  }, []);

  return {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    playbackRate,
    eqGains,
    dspSettings,
    isLoading,
    playTrack,
    togglePlayPause,
    seek,
    setVolume: setAudioVolume,
    toggleMute,
    setSpeed,
    setEqGain,
    setAllEqGains,
    updateDspSettings,
    getFrequencyData,
    getTimeDomainData
  };
}
