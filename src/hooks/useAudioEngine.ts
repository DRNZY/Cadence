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
  const scratchNoiseGainRef = useRef<GainNode | null>(null);
  const scratchFilterRef = useRef<BiquadFilterNode | null>(null);
  const wasPlayingBeforeScratchRef = useRef<boolean>(false);
  const scratchAnimFrameRef = useRef<number | null>(null);

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
      audioRef.current.load();

      try {
        if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
          await audioCtxRef.current.resume();
        }
        await audioRef.current.play();
        setIsPlaying(true);
        console.log("[Cadence AudioEngine] Playback started successfully for:", track.title);
      } catch (err: any) {
        console.error("[Cadence AudioEngine] Playback error:", err.message || err);
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

  const playPromiseRef = useRef<Promise<void> | null>(null);

  const play = useCallback(async () => {
    if (!audioRef.current) return;
    initAudioNodes();
    if (audioCtxRef.current?.state === "suspended") {
      await audioCtxRef.current.resume().catch(() => {});
    }
    try {
      const p = audioRef.current.play();
      playPromiseRef.current = p;
      await p;
      setIsPlaying(true);
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        console.error("[Cadence AudioEngine] play error:", e);
      }
    } finally {
      playPromiseRef.current = null;
    }
  }, [initAudioNodes]);

  const pause = useCallback(async () => {
    if (!audioRef.current) return;
    if (playPromiseRef.current) {
      try {
        await playPromiseRef.current;
      } catch {}
    }
    audioRef.current.pause();
    setIsPlaying(false);
  }, []);

  const togglePlayPause = useCallback(async () => {
    if (!audioRef.current) return;
    initAudioNodes();

    if (isPlaying) {
      if (playPromiseRef.current) {
        try {
          await playPromiseRef.current;
        } catch {}
      }
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (audioCtxRef.current?.state === "suspended") {
        await audioCtxRef.current.resume().catch(() => {});
      }
      try {
        const p = audioRef.current.play();
        playPromiseRef.current = p;
        await p;
        setIsPlaying(true);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error("[Cadence AudioEngine] Play error:", err);
        }
      } finally {
        playPromiseRef.current = null;
      }
    }
  }, [isPlaying, initAudioNodes]);

  const togglePlay = togglePlayPause;

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

  // Setup Vinyl Scratch Noise Graph
  const initScratchSynth = useCallback(() => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (scratchNoiseGainRef.current) return;

    try {
      // 1-second pink noise buffer for realistic vinyl needle friction
      const bufferSize = ctx.sampleRate;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.12;
        b6 = white * 0.115926;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      // Bandpass filter centered at needle scratch friction frequency
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 2200;
      filter.Q.value = 3.5;
      scratchFilterRef.current = filter;

      const gain = ctx.createGain();
      gain.gain.value = 0.0;
      scratchNoiseGainRef.current = gain;

      whiteNoise.connect(filter);
      filter.connect(gain);
      if (gainNodeRef.current) {
        gain.connect(gainNodeRef.current);
      } else {
        gain.connect(ctx.destination);
      }
      whiteNoise.start();
    } catch (e) {
      console.warn("Scratch synth init notice:", e);
    }
  }, []);

  const startScratch = useCallback(() => {
    initAudioNodes();
    initScratchSynth();
    if (scratchAnimFrameRef.current) {
      cancelAnimationFrame(scratchAnimFrameRef.current);
    }
    wasPlayingBeforeScratchRef.current = isPlaying;
  }, [initAudioNodes, initScratchSynth, isPlaying]);

  const scratch = useCallback((velocityDegPerSec: number, deltaAngle: number) => {
    if (!audioRef.current || !audioCtxRef.current) return;
    const audio = audioRef.current;
    const ctx = audioCtxRef.current;
    const now = ctx.currentTime;

    const absVel = Math.abs(velocityDegPerSec);
    const speedRatio = velocityDegPerSec / 200; // 200 deg/sec is standard 33.3 RPM playback speed

    // Modulate scratch noise level and pitch
    if (scratchNoiseGainRef.current && scratchFilterRef.current) {
      const frictionVolume = Math.min(0.35, (absVel / 600) * 0.35);
      scratchNoiseGainRef.current.gain.cancelScheduledValues(now);
      scratchNoiseGainRef.current.gain.linearRampToValueAtTime(frictionVolume, now + 0.02);

      // Modulate filter frequency based on scratch speed and direction
      const targetFreq = Math.max(600, Math.min(5000, 1600 + absVel * 3.5));
      scratchFilterRef.current.frequency.cancelScheduledValues(now);
      scratchFilterRef.current.frequency.linearRampToValueAtTime(targetFreq, now + 0.02);
    }

    if (velocityDegPerSec >= 0) {
      // Forward scratch / scrub
      const clampedRate = Math.min(3.5, Math.max(0.0625, speedRatio));
      try {
        audio.playbackRate = clampedRate;
        if (absVel > 15 && audio.paused && wasPlayingBeforeScratchRef.current) {
          audio.play().catch(() => {});
        }
      } catch {}
    } else {
      // Reverse scratch scrub
      try {
        if (!audio.paused) {
          audio.playbackRate = 0.0625;
        }
        // Scrub back by delta angle
        const scrubDeltaSec = (deltaAngle / 360) * 1.5;
        if (audio.duration && audio.duration > 0) {
          audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + scrubDeltaSec));
        }
      } catch {}
    }
  }, []);

  const endScratch = useCallback((spinUpMs: number = 220) => {
    if (!audioRef.current || !audioCtxRef.current) return;
    const audio = audioRef.current;
    const ctx = audioCtxRef.current;
    const now = ctx.currentTime;

    // Fade out friction noise immediately
    if (scratchNoiseGainRef.current) {
      scratchNoiseGainRef.current.gain.cancelScheduledValues(now);
      scratchNoiseGainRef.current.gain.linearRampToValueAtTime(0, now + 0.05);
    }

    // Realistic turntable motor spin-up inertia curve back to target speed
    const targetSpeed = playbackRate;
    const startTime = performance.now();
    const startRate = audio.playbackRate || 0.1;

    const animateSpinUp = (currTime: number) => {
      const elapsed = currTime - startTime;
      const progress = Math.min(1, elapsed / spinUpMs);
      const ease = 1 - Math.pow(1 - progress, 3);
      const currentRate = startRate + (targetSpeed - startRate) * ease;

      try {
        audio.playbackRate = Math.max(0.0625, Math.min(3.0, currentRate));
      } catch {}

      if (progress < 1) {
        scratchAnimFrameRef.current = requestAnimationFrame(animateSpinUp);
      } else {
        try {
          audio.playbackRate = targetSpeed;
        } catch {}
        if (wasPlayingBeforeScratchRef.current && audio.paused) {
          audio.play().catch(() => {});
        }
      }
    };

    scratchAnimFrameRef.current = requestAnimationFrame(animateSpinUp);
  }, [playbackRate]);

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
    equalizerGains: eqGains,
    dspSettings,
    isLoading,
    playTrack,
    play,
    pause,
    togglePlay,
    togglePlayPause,
    seek,
    setVolume: setAudioVolume,
    toggleMute,
    setSpeed,
    setEqGain,
    setEqualizerGain: setEqGain,
    setAllEqGains,
    applyPreset: setAllEqGains,
    updateDspSettings,
    startScratch,
    scratch,
    endScratch,
    getFrequencyData,
    getTimeDomainData
  };
}
