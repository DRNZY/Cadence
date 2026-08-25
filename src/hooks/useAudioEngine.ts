import { useState, useEffect, useRef, useCallback } from "react";
import type { Track } from "../types";

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export function useAudioEngine(onTrackEnd?: () => void) {
  const onTrackEndRef = useRef(onTrackEnd);
  onTrackEndRef.current = onTrackEnd;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const gainNodeRef = useRef<GainNode | null>(null);
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

  // Initialize Web Audio Context & Nodes on user action
  const initAudioNodes = useCallback(() => {
    if (isNodesConnectedRef.current || !audioRef.current) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;
      analyserRef.current = analyser;

      const gain = ctx.createGain();
      gain.gain.value = isMuted ? 0 : volume;
      gainNodeRef.current = gain;

      // 10-Band Biquad Filters
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

        let prevNode: AudioNode = source;
        for (const f of filters) {
          prevNode.connect(f);
          prevNode = f;
        }
        prevNode.connect(analyser);
        analyser.connect(gain);
        gain.connect(ctx.destination);
        isNodesConnectedRef.current = true;
      }
    } catch (e) {
      console.warn("Web Audio API connection notice:", e);
    }
  }, [volume, isMuted, eqGains]);

  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    audio.volume = volume;
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      setIsLoading(false);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleWaiting = () => setIsLoading(true);
    const handlePlaying = () => setIsLoading(false);
    const handleEnded = () => {
      setIsPlaying(false);
      if (onTrackEndRef.current) onTrackEndRef.current();
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

  // Play track
  const playTrack = useCallback(async (track: Track) => {
    initAudioNodes();
    if (audioCtxRef.current?.state === "suspended") {
      await audioCtxRef.current.resume();
    }

    if (!audioRef.current) return;

    setCurrentTrack(track);
    setIsLoading(true);
    const streamUrl = `/stream?path=${encodeURIComponent(track.filePath)}`;
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

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.coverPath
          ? [{ src: `/covers?path=${encodeURIComponent(track.coverPath)}`, sizes: "512x512", type: "image/jpeg" }]
          : [{ src: `/covers`, sizes: "512x512", type: "image/svg+xml" }]
      });
    }
  }, [initAudioNodes, playbackRate, isMuted, volume]);

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
    audioRef.current.currentTime = Math.max(0, Math.min(timeInSeconds, duration));
    setCurrentTime(audioRef.current.currentTime);
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
    isLoading,
    playTrack,
    togglePlayPause,
    seek,
    setVolume: setAudioVolume,
    toggleMute,
    setSpeed,
    setEqGain,
    setAllEqGains,
    getFrequencyData,
    getTimeDomainData
  };
}
