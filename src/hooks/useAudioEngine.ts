import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { Track, DspSettings } from "../types";
import { getTrackCoverUrl } from "../utils/formatters";
import { EQ_FREQUENCIES, EQ_DEFAULT_Q, eqHeadroomDb, buildCeilingCurve, equalPowerPair } from "../utils/dsp";

// Re-exported so the equalizer UI keeps importing them from the hook.
export { EQ_FREQUENCIES, EQ_DEFAULT_Q };

/**
 * Cutoff of the DC blocker on the master bus, in Hz.
 *
 * A tiny steady bias costs nothing to hear directly, but it eats headroom that
 * the clipper needs, it makes the output stage work harder, and it stops the
 * limiter from ever reaching a true zero-crossing. Five Hz is far below the
 * lowest note a listener would call bass and far below the lowest EQ shelf, so
 * it costs nothing musically while guaranteeing the bus is centred.
 */
const DC_BLOCK_HZ = 5;

/**
 * Seconds for parameter glide. Long enough to erase the step discontinuity of
 * a slider drag, short enough to feel instant.
 */
const GLIDE = 0.02;
/** Crossfade time for engaging or bypassing a whole processing stage. */
const SWITCH = 0.015;

/**
 * Move an AudioParam without a discontinuity.
 *
 * Assigning `param.value` while audio is flowing recomputes the filter
 * coefficients and jumps the output on the spot. On a biquad that is a click;
 * on an EQ slider it is zipper noise, which is what makes a perfectly real
 * equalizer sound fake. Every automated parameter in this file goes through
 * here instead of touching `.value`.
 */
function ramp(ctx: AudioContext, param: AudioParam, target: number, glide = GLIDE) {
  const now = ctx.currentTime;
  if (Number.isFinite(target)) {
    param.setTargetAtTime(target, now, glide);
  }
}

/** Ramp a gain node, treating a mute as an exponential-safe zero. */
function rampGain(ctx: AudioContext, node: GainNode, target: number, glide = GLIDE) {
  ramp(ctx, node.gain, Math.max(0, target), glide);
}

const DSP_DEFAULTS: DspSettings = {
  crossfadeSeconds: 0,
  replayGainEnabled: true,
  replayGainMode: "track",
  preampGain: 0,
  eqHeadroomCompensation: true,
  convolutionEnabled: false,
  // The transfer curve is asymptote-bounded now, so this is a real ceiling
  // rather than the knee position. One dBFS leaves room for inter-sample peaks,
  // which a sample-rate limiter cannot see and which are the first thing to
  // distort on the way to a DAC.
  ceilingDb: -1
};

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

  const audioCtxRef = useRef<AudioContext | null>(null);
  const inputBusRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const gainNodeRef = useRef<GainNode | null>(null);
  const replayGainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const currentBufferRef = useRef<AudioBuffer | null>(null);
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const playbackStartTimeRef = useRef<number>(0);
  const playbackStartOffsetRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const isManualStopRef = useRef<boolean>(false);
  const isNodesConnectedRef = useRef<boolean>(false);
  const wasPlayingBeforeScratchRef = useRef<boolean>(false);
  const scratchAnimFrameRef = useRef<number | null>(null);
  // Animation frame driving the crossfade clock poller, and a liveness flag so
  // a frame that lands after unmount can bail out instead of rescheduling.
  const waitRafRef = useRef<number | null>(null);
  const mountedRef = useRef<boolean>(false);
  const freqArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const timeArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // --- nodes added for glitch-free operation
  // A dedicated gain that takes the EQ in or out of circuit. Bypassing by
  // setting ten band gains to zero is not a bypass: the ten biquads stay in
  // series and keep their phase response, so the bypassed path is measurably
  // not the original signal. This node is the only way to truly remove them.
  const eqBypassGainRef = useRef<GainNode | null>(null);
  // Headroom trim, recomputed from the largest positive band boost.
  const eqHeadroomRef = useRef<GainNode | null>(null);
  // DC blocker, first thing on the bus.
  const dcBlockRef = useRef<BiquadFilterNode | null>(null);
  // Colour FX is two permanently lowpass/highpass filters rather than one node
  // whose `type` is reassigned. Changing type on a live biquad tears down and
  // rebuilds its coefficient state, which clicks; sweeping frequency on a node
  // with a stable type does not. A gain crossfade moves between them instead.
  const colorLowRef = useRef<BiquadFilterNode | null>(null);
  const colorHighRef = useRef<BiquadFilterNode | null>(null);
  const colorDryRef = useRef<GainNode | null>(null);
  const colorWetRef = useRef<GainNode | null>(null);
  /**
   * The colour stage's mix output, which is also the convolution stage's
   * input. See the routing note in `initAudioNodes` for why these two stages
   * are cascaded rather than both hung off the EQ.
   */
  const colorMixBusRef = useRef<GainNode | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const convolverDryRef = useRef<GainNode | null>(null);
  const convolverWetRef = useRef<GainNode | null>(null);
  // Soft ceiling. A WaveShaper curve is used rather than a DynamicsCompressor
  // because a compressor has a minimum attack time and a fixed ratio that
  // audibly pumps; a tanh-shaped curve is memoryless, so it only acts on peaks
  // that are already over the ceiling and leaves everything below untouched.
  const ceilingRef = useRef<WaveShaperNode | null>(null);
  const meterScratchRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const peakHoldRef = useRef<{ value: number; until: number }>({ value: 0, until: 0 });

  /**
   * Real, measured values from the live AudioContext.
   *
   * These have to be state rather than a ref read during render: the context
   * does not exist on the first render, so a ref read would report 0 until some
   * unrelated state change happened to re-render the component, and the readout
   * would sit at "n/a" in the meantime.
   */
  const [audioInfo, setAudioInfo] = useState<{
    sampleRate: number;
    baseLatency: number;
    outputLatency: number;
  }>({ sampleRate: 0, baseLatency: 0, outputLatency: 0 });

  // Coalesced scratch target, flushed once per animation frame.
  const scratchTargetRef = useRef<number | null>(null);

const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [eqGains, setEqGains] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("cadence_eq_gains") || localStorage.getItem("auradeck_eq_gains");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 10) {
          return parsed.map(v => typeof v === "number" && !isNaN(v) ? v : 0);
        }
      }
    } catch {}
    return new Array(10).fill(0);
  });
  const [isLoading, setIsLoading] = useState(false);

  // Per-band Q. Persisted alongside the gains so a tuned curve survives a
  // restart; a graphic EQ that hardcodes Q cannot be used to tighten a
  // resonance or carve a notch, which is most of what an EQ is actually for.
  const [eqQs, setEqQs] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("cadence_eq_qs");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === EQ_FREQUENCIES.length) {
          return parsed.map(v => (typeof v === "number" && isFinite(v) && v > 0 ? v : EQ_DEFAULT_Q));
        }
      }
    } catch {}
    return new Array(EQ_FREQUENCIES.length).fill(EQ_DEFAULT_Q);
  });

  /**
   * Latest Q per band, readable from a stable callback that does not have to be
   * rebuilt whenever a Q slider moves. The headroom solve needs both gains and
   * Q, and giving that callback a dependency on `eqQs` would hand every EQ
   * consumer a new function identity on every Q drag.
   */
  const eqQsRef = useRef(eqQs);
  eqQsRef.current = eqQs;

  /** Latest gain per band, for the same reason as `eqQsRef`. */
  const eqGainsRef = useRef(eqGains);
  eqGainsRef.current = eqGains;
  const [eqBypassed, setEqBypassed] = useState(false);
  const [baseBpm, setBaseBpm] = useState<number>(120.0);
  const [pitchRange, setPitchRange] = useState<6 | 10 | 16 | 50>(10);
  const [keyLock, setKeyLockState] = useState<boolean>(true);
  const [colorFilter, setColorFilterState] = useState<number>(0);
  const [hotCues, setHotCues] = useState<(number | null)[]>(new Array(8).fill(null));
  const [beatLoop, setBeatLoopState] = useState<{ active: boolean; start: number; end: number; beats: number }>({
    active: false,
    start: 0,
    end: 0,
    beats: 4
  });
  const loopRef = useRef(beatLoop);
  loopRef.current = beatLoop;

  // DSP Settings State with persistent storage
  const [dspSettings, setDspSettings] = useState<DspSettings>(() => {
    try {
      const saved = localStorage.getItem("cadence_dsp_settings") || localStorage.getItem("auradeck_dsp_settings");
      if (saved) return { ...DSP_DEFAULTS, ...JSON.parse(saved) };
    } catch {}
    return { ...DSP_DEFAULTS };
  });

  /**
   * The limiter transfer curve, rebuilt only when the ceiling actually moves.
   * Building it allocates a 4096-entry table; doing that on every render of the
   * settings modal was the single most wasteful thing in this hook.
   */
  const ceilingCurve = useMemo(
    () => buildCeilingCurve(dspSettings.ceilingDb),
    [dspSettings.ceilingDb]
  );

  // Save DSP Settings automatically
  useEffect(() => {
    try {
      localStorage.setItem("cadence_dsp_settings", JSON.stringify(dspSettings));
    } catch {}
  }, [dspSettings]);

  // Save EQ Gains automatically
  useEffect(() => {
    try {
      localStorage.setItem("cadence_eq_gains", JSON.stringify(eqGains));
    } catch {}
  }, [eqGains]);

  useEffect(() => {
    try {
      localStorage.setItem("cadence_eq_qs", JSON.stringify(eqQs));
    } catch {}
  }, [eqQs]);

  // Apply ReplayGain calculation to replayGainNode
  const updateReplayGain = useCallback((track: Track | null, settings: DspSettings) => {
    if (!replayGainNodeRef.current || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const preampDb = typeof settings.preampGain === "number" ? settings.preampGain : 0;

    // Album mode means the album gain, and only the album gain. It must never
    // fall back to the track value: mixing the two is how a "loudness
    // normalised" player ends up with tracks at visibly different levels, since
    // the two tags are computed against different references.
    const raw =
      settings.replayGainMode === "album"
        ? track?.replayGainAlbum
        : (track?.replayGainTrack ?? track?.replayGain);

    if (!settings.replayGainEnabled || typeof raw !== "number" || !isFinite(raw)) {
      rampGain(ctx, replayGainNodeRef.current, Math.pow(10, preampDb / 20), 0.05);
      return;
    }

    // Clamp the compensation. A mis-tagged file can carry an absurd gain, and
    // honouring it verbatim is a blast of full-scale noise.
    const clampedGainDb = Math.max(-15, Math.min(10, raw + preampDb));
    rampGain(ctx, replayGainNodeRef.current, Math.pow(10, clampedGainDb / 20), 0.05);
  }, []);

  // Initialize Web Audio Context & Graph
  const initAudioNodes = useCallback(() => {
    if (isNodesConnectedRef.current) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioCtxRef.current) {
        try {
          audioCtxRef.current = new AudioCtx({ latencyHint: "playback" });
        } catch {
          audioCtxRef.current = new AudioCtx();
        }
      }
      const ctx = audioCtxRef.current;

      // Publish the measured context properties so the UI can display what it
      // actually negotiated with the output device, rather than assuming.
      setAudioInfo({
        sampleRate: ctx.sampleRate,
        baseLatency: ctx.baseLatency,
        outputLatency: ctx.outputLatency
      });

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
      const preampDb = typeof dspSettings.preampGain === "number" ? dspSettings.preampGain : 0;
      replayGainNode.gain.value = Math.pow(10, preampDb / 20);
      replayGainNodeRef.current = replayGainNode;

      // 4. 10-Band Biquad Graphic Equalizer Filters (0dB = flat studio bypass)
      const filters = EQ_FREQUENCIES.map((freq, idx) => {
        const filter = ctx.createBiquadFilter();
        if (idx === 0) {
          filter.type = "lowshelf";
        } else if (idx === EQ_FREQUENCIES.length - 1) {
          filter.type = "highshelf";
        } else {
          filter.type = "peaking";
          filter.Q.value = eqQs[idx] || EQ_DEFAULT_Q;
        }
        filter.frequency.value = freq;
        filter.gain.value = eqGains[idx] || 0;
        return filter;
      });
      filtersRef.current = filters;

      // 4a. Headroom trim ahead of the EQ, so a boosted curve is applied at a
      // safe level rather than being slammed into the ceiling afterwards.
      const eqHeadroom = ctx.createGain();
      const trimDb = dspSettings.eqHeadroomCompensation
        ? eqHeadroomDb(eqGains, eqQs, ctx.sampleRate)
        : 0;
      eqHeadroom.gain.value = Math.pow(10, trimDb / 20);
      eqHeadroomRef.current = eqHeadroom;

      // 4b. The EQ bypass gate. Held at unity in normal use; dropping it to zero
      // removes all ten filters from the signal path.
      const eqBypass = ctx.createGain();
      eqBypass.gain.value = eqBypassed ? 0 : 1;
      eqBypassGainRef.current = eqBypass;

      // 5. Colour FX: two filters with fixed types, in a parallel dry/wet pair.
      // The dry path carries the signal untouched and the wet path carries the
      // filtered signal, so neutral is a real bypass. A single gain gate in
    // series is NOT a bypass: it multiplies the whole programme by its value,
      // and the neutral value here is zero, which is silence. Routing around
      // the stage is the only way to remove it from the signal path.
      //
      // The filters keep stable types rather than having `type` reassigned.
      // Changing type on a live biquad tears down and rebuilds its coefficient
      // state, which clicks; sweeping frequency on a fixed type does not.
      const colorLow = ctx.createBiquadFilter();
      colorLow.type = "lowpass";
      colorLow.frequency.value = 20000;
      colorLow.Q.value = 1.0;
      colorLowRef.current = colorLow;

      const colorHigh = ctx.createBiquadFilter();
      colorHigh.type = "highpass";
      colorHigh.frequency.value = 20;
      colorHigh.Q.value = 1.0;
      colorHighRef.current = colorHigh;

      // Dry at unity, wet closed: neutral passes the programme unaltered.
      const colorDry = ctx.createGain();
      colorDry.gain.value = 1;
      colorDryRef.current = colorDry;

      const colorWet = ctx.createGain();
      colorWet.gain.value = 0;
      colorWetRef.current = colorWet;

      // Where the colour stage sums. The convolution stage is fed from here
      // rather than from the EQ, so the two stages cascade instead of running
      // side by side.
      const colorMixBus = ctx.createGain();
      colorMixBus.gain.value = 1;
      colorMixBusRef.current = colorMixBus;

      // 6. Convolution room, as a parallel dry/wet pair so it can be dialled in
      // rather than switched, and so a missing IR degrades to plain dry audio.
      const convolver = ctx.createConvolver();
      convolver.normalize = true;
      convolverRef.current = convolver;
      const convDry = ctx.createGain();
      convDry.gain.value = 1;
      convolverDryRef.current = convDry;
      const convWet = ctx.createGain();
      convWet.gain.value = 0;
      convolverWetRef.current = convWet;

      // 7. Soft output ceiling, before the master gain so it protects the signal
    // rather than the volume setting. The curve is memoised, because rebuilding
      // a 4096-point table on every settings tick is pure waste.
    const ceiling = ctx.createWaveShaper();
      ceiling.curve = ceilingCurve;
      ceiling.oversample = "4x";
      ceilingRef.current = ceiling;

  // 8. DC blocker. First node on the bus so every stage downstream, including
      // the clipper and the ReplayGain trim, works on a centred signal.
      const dcBlock = ctx.createBiquadFilter();
      dcBlock.type = "highpass";
      dcBlock.frequency.value = DC_BLOCK_HZ;
      dcBlock.Q.value = Math.SQRT1_2;
      dcBlockRef.current = dcBlock;

      if (!inputBusRef.current) {
        const inputBus = ctx.createGain();
        inputBusRef.current = inputBus;

        let prevNode: AudioNode = inputBus;
        prevNode.connect(dcBlock);
        prevNode = dcBlock;

        prevNode.connect(replayGainNode);
        prevNode = replayGainNode;

        prevNode.connect(eqHeadroom);
        prevNode = eqHeadroom;

        for (const f of filters) {
          prevNode.connect(f);
          prevNode = f;
        }

prevNode.connect(eqBypass);
    prevNode = eqBypass;

   // Colour FX: the dry branch carries the programme untouched, the
        // filtered branches feed one wet gain. Neutral is dry 1 / wet 0, which
        // removes the stage from the signal path rather than gating it shut.
        //
        // Both branches land on `colorMixBus`, and the convolution stage below
     // is fed from that bus rather than from `eqBypass`.
        //
        // That topology is not incidental. Two independent parallel dry/wet
        // stages cannot both sit at unity-gain neutral and still sum to unity:
        // each one's dry path is the full programme, so hanging both off the
        // EQ and summing them into the mix bus delivers the signal twice and
        // adds 6.02 dB. That lands straight in the output ceiling, which is
        // then permanently engaged, and the result is a permanently squashed,
        // harsh master. Cascading them makes the total exactly unity at
        // neutral, and because each stage is an equal-power crossfade
        // (cos/sin, so the pair holds constant power) the sum stays unity as
        // either stage is swept.
        prevNode.connect(colorDry);
        prevNode.connect(colorLow);
        prevNode.connect(colorHigh);
        colorLow.connect(colorWet);
        colorHigh.connect(colorWet);
        colorDry.connect(colorMixBus);
        colorWet.connect(colorMixBus);

        // Convolution: a second parallel dry/wet pair, fed from the colour
        // stage's output so the two cascade.
        colorMixBus.connect(convDry);
   colorMixBus.connect(convolver);
        convolver.connect(convWet);

    // Both convolution branches sum into the ceiling, which doubles as the
        // mix bus for the whole FX section.
        convDry.connect(ceiling);
    convWet.connect(ceiling);
    prevNode = ceiling;

    // The analyser is a tap, not a link in the chain. It reads exactly the same
        // signal it read when it was inline, but the programme no longer has to
        // traverse a second processing quantum to reach the output.
        ceiling.connect(analyser);
        ceiling.connect(gain);
        gain.connect(ctx.destination);

        isNodesConnectedRef.current = true;
      }
    } catch (e) {
      console.warn("Web Audio API initialization notice:", e);
    }
}, [
    volume, isMuted, eqGains, eqQs, eqBypassed,
    dspSettings.preampGain, dspSettings.eqHeadroomCompensation, dspSettings.ceilingDb,
    ceilingCurve
  ]);

  // Track playback position tracking animation loop
  useEffect(() => {
    if (!isPlaying) return;
    let animId: number;
    let lastMediaSync = 0;

    const tick = () => {
      if (audioCtxRef.current && isPlaying) {
        const ctx = audioCtxRef.current;
        let pos = playbackStartOffsetRef.current + (ctx.currentTime - playbackStartTimeRef.current) * playbackRate;

        if (loopRef.current.active && loopRef.current.end > loopRef.current.start) {
          const loopLen = loopRef.current.end - loopRef.current.start;
          if (pos >= loopRef.current.end) {
            pos = loopRef.current.start + ((pos - loopRef.current.start) % loopLen);
          }
        }

        const totalDur = duration || currentBufferRef.current?.duration || 0;
        const clamped = Math.max(0, Math.min(totalDur, pos));
        setCurrentTime(clamped);

        const now = performance.now();
        if ("mediaSession" in navigator && totalDur > 0 && now - lastMediaSync > 500) {
          lastMediaSync = now;
          try {
            navigator.mediaSession.setPositionState({
              duration: totalDur,
              playbackRate: playbackRate || 1.0,
              position: Math.min(clamped, totalDur)
            });
          } catch {}
        }
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, playbackRate, duration]);

  // Update ReplayGain on track or DSP settings change
  useEffect(() => {
    updateReplayGain(currentTrack, dspSettings);
  }, [currentTrack, dspSettings, updateReplayGain]);

  /**
   * Resolve after `seconds` of *audio* time, polled on the render loop.
   *
   * The previous crossfade scheduled the gain ramp on the AudioContext clock
   * but the source swap on a wall-clock `setTimeout`. The two clocks drift, and
   * `setTimeout` is additionally clamped under load, so the decoder was
   * routinely restarted while the fade was still ramping. Polling the audio
   * clock keeps the swap and the ramp locked together regardless of how busy
   * the main thread is.
   */
  const waitAudioClock = useCallback((seconds: number): Promise<void> => {
    return new Promise(resolve => {
      const ctx = audioCtxRef.current;
      if (!ctx || seconds <= 0) { resolve(); return; }
      const target = ctx.currentTime + seconds;
      const tick = () => {
        if (!mountedRef.current || !audioCtxRef.current || audioCtxRef.current.currentTime >= target) {
          resolve();
        } else {
          waitRafRef.current = requestAnimationFrame(tick);
        }
      };
      waitRafRef.current = requestAnimationFrame(tick);
    });
  }, []);

  /**
   * Teardown.
   *
   * Two independent animation-frame loops can be in flight when this component
   * goes away: the scratch coalescer and the crossfade clock poller. Both are
   * cancelled by their own owners on a clean finish, but neither owner runs if
   * the view is torn down mid-gesture, and an orphaned rAF keeps its closure,
   * and therefore the whole hook's ref graph, reachable until the frame fires.
   * On a machine already short of memory that is the wrong thing to leave
   * lying around, and it is the sort of leak that only shows up in a long
   * session.
   */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (scratchAnimFrameRef.current !== null) {
        cancelAnimationFrame(scratchAnimFrameRef.current);
        scratchAnimFrameRef.current = null;
      }
      if (waitRafRef.current !== null) {
        cancelAnimationFrame(waitRafRef.current);
        waitRafRef.current = null;
      }
    };
  }, []);

  const fetchAndDecode = useCallback(async (track: Track): Promise<AudioBuffer | null> => {
    initAudioNodes();
    const ctx = audioCtxRef.current;
    if (!ctx) return null;

    const cached = bufferCacheRef.current.get(track.filePath);
    if (cached) return cached;

    try {
      const url = `/stream?path=${encodeURIComponent(track.filePath)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer);

      if (bufferCacheRef.current.size >= 8) {
        const firstKey = bufferCacheRef.current.keys().next().value;
        if (firstKey) bufferCacheRef.current.delete(firstKey);
      }
      bufferCacheRef.current.set(track.filePath, decoded);
      return decoded;
    } catch (err) {
      console.error("[Cadence AudioEngine] Failed to load/decode track:", err);
      return null;
    }
  }, [initAudioNodes]);

  const startBufferPlayback = useCallback((buffer: AudioBuffer, offset: number = 0, fadeMs: number = 25) => {
    initAudioNodes();
    const ctx = audioCtxRef.current;
    const inputBus = inputBusRef.current;
    const master = gainNodeRef.current;
    if (!ctx || !inputBus || !master) return;

    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }

    if (sourceNodeRef.current) {
      isManualStopRef.current = true;
      try {
        sourceNodeRef.current.onended = null;
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {}
      sourceNodeRef.current = null;
    }

    isManualStopRef.current = false;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;

    if (loopRef.current.active && loopRef.current.end > loopRef.current.start) {
      source.loop = true;
      source.loopStart = loopRef.current.start;
      source.loopEnd = loopRef.current.end;
    }

    source.connect(inputBus);

    source.onended = () => {
      if (!isManualStopRef.current) {
        setIsPlaying(false);
        if (optsRef.current.onTrackEnd) {
          optsRef.current.onTrackEnd();
        }
      }
    };

    const safeOffset = Math.max(0, Math.min(buffer.duration, offset));
    source.start(0, safeOffset);
    sourceNodeRef.current = source;
    playbackStartTimeRef.current = ctx.currentTime;
    playbackStartOffsetRef.current = safeOffset;
    pausedAtRef.current = safeOffset;
    setCurrentTime(safeOffset);
    setIsPlaying(true);
    setIsLoading(false);

    const targetLevel = isMuted ? 0 : volume;
    if (fadeMs > 0) {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(0, now);
      master.gain.linearRampToValueAtTime(targetLevel, now + fadeMs / 1000);
    } else {
      rampGain(ctx, master, targetLevel, 0.02);
    }
  }, [initAudioNodes, playbackRate, isMuted, volume]);

  // Play Track with Optional Crossfade
  const playTrack = useCallback(async (track: Track) => {
    initAudioNodes();
    setCurrentTrack(track);
    setIsLoading(true);

    const crossfade = dspSettings.crossfadeSeconds;
    const ctx = audioCtxRef.current;
    const master = gainNodeRef.current;

    if (crossfade > 0 && isPlaying && master && ctx) {
      const now = ctx.currentTime;
      const half = crossfade / 2;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + half);

      await waitAudioClock(half);
    }

    const decoded = await fetchAndDecode(track);
    if (!decoded) {
      setIsLoading(false);
      setIsPlaying(false);
      return;
    }

    currentBufferRef.current = decoded;
    setDuration(decoded.duration);
    startBufferPlayback(decoded, 0, crossfade > 0 ? (crossfade / 2) * 1000 : 25);

    // Update MediaSession Metadata
    if ("mediaSession" in navigator) {
      const coverUrl = getTrackCoverUrl(track);

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
      try {
        navigator.mediaSession.playbackState = "playing";
      } catch {}
    }
  }, [initAudioNodes, dspSettings.crossfadeSeconds, isPlaying, isMuted, volume, waitAudioClock, fetchAndDecode, startBufferPlayback]);

  const play = useCallback(async () => {
    if (!currentBufferRef.current && currentTrack) {
      await playTrack(currentTrack);
      return;
    }
    if (currentBufferRef.current) {
      startBufferPlayback(currentBufferRef.current, pausedAtRef.current, 15);
      if ("mediaSession" in navigator) {
        try { navigator.mediaSession.playbackState = "playing"; } catch {}
      }
    }
  }, [currentTrack, playTrack, startBufferPlayback]);

  const pause = useCallback(async () => {
    if (!isPlaying) return;
    isManualStopRef.current = true;
    if (audioCtxRef.current && sourceNodeRef.current) {
      const ctx = audioCtxRef.current;
      const currentPos = playbackStartOffsetRef.current + (ctx.currentTime - playbackStartTimeRef.current) * playbackRate;
      pausedAtRef.current = Math.max(0, Math.min(duration, currentPos));
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {}
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
    if ("mediaSession" in navigator) {
      try { navigator.mediaSession.playbackState = "paused"; } catch {}
    }
  }, [isPlaying, playbackRate, duration]);

  const togglePlayPause = useCallback(async () => {
    if (isPlaying) {
      await pause();
    } else {
      await play();
    }
  }, [isPlaying, pause, play]);

  const togglePlay = togglePlayPause;

  const seek = useCallback((timeInSeconds: number) => {
    const target = Math.max(0, Math.min(timeInSeconds, duration));
    pausedAtRef.current = target;
    setCurrentTime(target);
    if (isPlaying && currentBufferRef.current) {
      startBufferPlayback(currentBufferRef.current, target, 0);
    }
  }, [duration, isPlaying, startBufferPlayback]);

  const seekSmooth = useCallback((timeInSeconds: number) => {
    const target = Math.max(0, Math.min(timeInSeconds, duration));
    pausedAtRef.current = target;
    setCurrentTime(target);
    if (isPlaying && currentBufferRef.current) {
      startBufferPlayback(currentBufferRef.current, target, 15);
    }
  }, [duration, isPlaying, startBufferPlayback]);

  const setAudioVolume = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(val, 1));
    setVolume(clamped);
    if (gainNodeRef.current && audioCtxRef.current) {
      rampGain(audioCtxRef.current, gainNodeRef.current, isMuted ? 0 : clamped);
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      if (gainNodeRef.current && audioCtxRef.current) {
        // Ramp rather than assign: a hard jump from 0.85 to 0 is a click.
        rampGain(audioCtxRef.current, gainNodeRef.current, next ? 0 : volume);
      }
      return next;
    });
  }, [volume]);

  const setSpeed = useCallback((rate: number) => {
    const clamped = Math.max(0.1, Math.min(3.0, rate));
    setPlaybackRate(clamped);
    if (isPlaying && audioCtxRef.current && sourceNodeRef.current) {
      const ctx = audioCtxRef.current;
      const currentPos = playbackStartOffsetRef.current + (ctx.currentTime - playbackStartTimeRef.current) * playbackRate;
      playbackStartOffsetRef.current = currentPos;
      playbackStartTimeRef.current = ctx.currentTime;
      sourceNodeRef.current.playbackRate.setValueAtTime(clamped, ctx.currentTime);
    }
  }, [isPlaying, playbackRate]);

  const fadeVolume = useCallback((targetVolume: number, durationSeconds: number) => {
    if (!audioCtxRef.current || !gainNodeRef.current) return;
    const ctx = audioCtxRef.current;
    const now = ctx.currentTime;
    const gainNode = gainNodeRef.current;
    const currentGain = gainNode.gain.value;
    const target = Math.max(0, Math.min(1, targetVolume));

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(Math.max(0.0001, currentGain), now);
    if (target === 0) {
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.1, durationSeconds * 0.95));
      gainNode.gain.linearRampToValueAtTime(0, now + durationSeconds);
    } else {
      gainNode.gain.linearRampToValueAtTime(target, now + durationSeconds);
    }
  }, []);

  /**
   * Re-derive the pre-EQ headroom trim from the current curve. Called
   * after any change to the curve so the compensation can never drift out of
   * step with the EQ it exists to protect.
   *
   * The trim is the negative of the true peak of the *summed* response, not of
   * the largest single band. Adjacent bands overlap and their responses add,
   * so a gentle smile curve that never exceeds +4 dB in any band still peaks
   * near +5.2 dB overall. Compensating by the band maximum left that 1.2 dB
   * unaccounted for and pushed the bus into the clipper, which is how an
   * equalizer that sounds wrong ends up sounding wrong.
   */
  const applyEqHeadroom = useCallback((gains: number[], qs?: number[]) => {
    if (!eqHeadroomRef.current || !audioCtxRef.current) return;
    const trimDb = dspSettings.eqHeadroomCompensation
      ? eqHeadroomDb(gains, qs ?? eqQsRef.current, audioCtxRef.current.sampleRate)
      : 0;
    rampGain(audioCtxRef.current, eqHeadroomRef.current, Math.pow(10, trimDb / 20), 0.05);
  }, [dspSettings.eqHeadroomCompensation]);

  const setEqGain = useCallback((bandIndex: number, gainValue: number) => {
    setEqGains(prev => {
      const next = [...prev];
      next[bandIndex] = gainValue;
      if (filtersRef.current[bandIndex] && audioCtxRef.current) {
        // Glide, never assign. A slider drag produces a value change every
        // frame; writing those straight to the AudioParam is what makes a real
        // equalizer sound like a broken one.
        ramp(audioCtxRef.current, filtersRef.current[bandIndex].gain, gainValue);
      }
      applyEqHeadroom(next);
      try {
        localStorage.setItem("cadence_eq_gains", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [applyEqHeadroom]);

  const setEqQ = useCallback((bandIndex: number, qValue: number) => {
    setEqQs(prev => {
      const next = [...prev];
      const q = Math.max(0.1, Math.min(30, qValue));
      next[bandIndex] = q;
      const filter = filtersRef.current[bandIndex];
      // Shelves have no meaningful Q; the spec ignores it for those types and
      // writing one is at best inert and at worst confusing.
      if (filter && audioCtxRef.current && filter.type === "peaking") {
        ramp(audioCtxRef.current, filter.Q, q);
      }
      try {
        localStorage.setItem("cadence_eq_qs", JSON.stringify(next));
   } catch {}
      // Q changes the width of a band, so it changes the summed response and
      // therefore the required headroom. Tightening a bell raises its peak.
      applyEqHeadroom(eqGainsRef.current, next);
      return next;
    });
  }, [applyEqHeadroom]);

  /**
   * Engage or remove the whole EQ from the circuit. This is a real bypass: the
   * gain gate in front of the ten filters drops to zero, so the filters are no
   * longer in the signal path at all. Flattening every band to 0 dB is not
   * equivalent, because ten biquads left in series still contribute their phase
   * response and any passband ripple.
   */
  const setEqBypass = useCallback((bypassed: boolean) => {
    setEqBypassed(bypassed);
    if (eqBypassGainRef.current && audioCtxRef.current) {
      rampGain(audioCtxRef.current, eqBypassGainRef.current, bypassed ? 0 : 1, SWITCH);
    }
  }, []);

  const setAllEqGains = useCallback((newGains: number[]) => {
    setEqGains(newGains);
    newGains.forEach((gain, idx) => {
      const filter = filtersRef.current[idx];
      if (filter && audioCtxRef.current) {
        ramp(audioCtxRef.current, filter.gain, gain);
      }
    });
    applyEqHeadroom(newGains);
    try {
      localStorage.setItem("cadence_eq_gains", JSON.stringify(newGains));
    } catch {}
  }, [applyEqHeadroom]);

  const updateDspSettings = useCallback((newSettings: Partial<DspSettings>) => {
    setDspSettings(prev => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem("cadence_dsp_settings", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  // Precision DJ Tempo / BPM controls
  const setPitchPercent = useCallback((percent: number) => {
    const rate = Math.max(0.1, Math.min(3.0, 1.0 + percent / 100));
    setSpeed(rate);
  }, [setSpeed]);

  const setKeyLock = useCallback((locked: boolean) => {
    setKeyLockState(locked);
  }, []);

  const nudgePitch = useCallback((deltaPercent: number) => {
    const nudgeRate = Math.max(0.1, Math.min(3.0, playbackRate + deltaPercent / 100));
    setSpeed(nudgeRate);
  }, [playbackRate, setSpeed]);

  const resetPitch = useCallback(() => {
    setSpeed(1.0);
  }, [setSpeed]);

// Color FX Rotary Filter (DJ low-pass to high-pass sweep)
  const setColorFilter = useCallback((val: number) => {
    const clamped = Math.max(-1, Math.min(1, val));
    setColorFilterState(clamped);
    const ctx = audioCtxRef.current;
    const dry = colorDryRef.current;
    const wet = colorWetRef.current;
 if (!ctx || !dry || !wet) return;

    if (Math.abs(clamped) <= 0.05) {
      // Neutral: close the wet branch, leave dry at unity. The filters are
      // parked at their transparent corners and the stage contributes nothing.
      rampGain(ctx, wet, 0, 0.08);
    rampGain(ctx, dry, 1, 0.08);
      return;
    }

    // Sweep position, 0 at neutral and 1 at either extreme. Doubles as the
    // dry/wet balance: rotating the knob further in mixes more of the filtered
    // signal, so the effect tracks the gesture instead of switching on at once.
    const factor = clamped < 0
      ? (clamped + 0.05) / -0.95 // 0 at -0.05, 1 at -1
      : (clamped - 0.05) / 0.95;  // 0 at 0.05, 1 at 1

    // Equal-power crossfade, the same law the convolver uses: cosine and sine
    // of one angle, so the perceived level holds steady through the middle
    // instead of dipping like a linear blend would.
    const pair = equalPowerPair(factor);
    rampGain(ctx, dry, pair.dry, 0.03);
    rampGain(ctx, wet, pair.wet, 0.03);

    if (clamped < 0) {
      // Low-pass sweep: 20 kHz down to 220 Hz.
      const freq = Math.max(220, 20000 * Math.pow(0.011, factor));
      if (colorLowRef.current) {
      ramp(ctx, colorLowRef.current.frequency, freq, 0.03);
        ramp(ctx, colorLowRef.current.Q, 1.2, 0.05);
      }
    } else {
      // High-pass sweep: 20 Hz up to 4500 Hz.
      const freq = Math.min(4500, 20 + Math.pow(factor, 2.2) * 4480);
      if (colorHighRef.current) {
        ramp(ctx, colorHighRef.current.frequency, freq, 0.03);
        ramp(ctx, colorHighRef.current.Q, 1.2, 0.05);
      }
    }
  }, []);

  // Performance Hot Cues (8 Cues)
  const triggerHotCue = useCallback((index: number) => {
    if (index < 0 || index >= 8) return;
    setHotCues(prev => {
      const next = [...prev];
      if (next[index] !== null) {
        // Jump to cue position
        seek(next[index]!);
      } else {
        // Save current position
        next[index] = currentTime;
      }
      return next;
    });
  }, [currentTime, seek]);

  const clearHotCue = useCallback((index: number) => {
    if (index < 0 || index >= 8) return;
    setHotCues(prev => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  }, []);

  // Auto Beat Looper
  const setBeatLoop = useCallback((beats: number) => {
    const currentBpm = Math.max(40, baseBpm * playbackRate);
    const secondsPerBeat = 60.0 / currentBpm;
    const loopDuration = Math.max(0.1, secondsPerBeat * beats);
    const start = currentTime;
    const end = Math.min(duration || start + loopDuration, start + loopDuration);

    setBeatLoopState({
      active: true,
      start,
      end,
      beats
    });
  }, [baseBpm, playbackRate, currentTime, duration]);

  const exitLoop = useCallback(() => {
    setBeatLoopState(prev => ({ ...prev, active: false }));
  }, []);

  // True Physical Vinyl Scrubbing (Zero fake noise, pure smooth audio scrolling)
  const startScratch = useCallback(() => {
    initAudioNodes();
    if (scratchAnimFrameRef.current) {
      cancelAnimationFrame(scratchAnimFrameRef.current);
      scratchAnimFrameRef.current = null;
    }
    wasPlayingBeforeScratchRef.current = isPlaying;
    if (isPlaying) {
      pause();
    }
  }, [initAudioNodes, isPlaying, pause]);

  /**
   * Seek scrubbing, coalesced to one seek per animation frame.
   */
  const flushScratch = useCallback(() => {
    scratchAnimFrameRef.current = null;
    const target = scratchTargetRef.current;
    scratchTargetRef.current = null;
    if (target === null) return;
    const totalDur = duration || currentBufferRef.current?.duration || 0;
    const clamped = Math.max(0, Math.min(totalDur, target));
    pausedAtRef.current = clamped;
    setCurrentTime(clamped);
  }, [duration]);

  const scratch = useCallback((_velocityDegPerSec: number, deltaAngle: number) => {
    const totalDur = duration || currentBufferRef.current?.duration || 0;
    if (totalDur <= 0) return;

    // Physical turntable 33.3 RPM rotation: 360 deg = 1.8 seconds of audio
    const scrubDeltaSec = (deltaAngle / 360) * 1.8;
    const base = scratchTargetRef.current ?? pausedAtRef.current;
    scratchTargetRef.current = Math.max(0, Math.min(totalDur, base + scrubDeltaSec));

    if (scratchAnimFrameRef.current === null) {
      scratchAnimFrameRef.current = requestAnimationFrame(flushScratch);
    }
  }, [duration, flushScratch]);

  const endScratch = useCallback((_spinUpMs: number = 80) => {
    if (scratchAnimFrameRef.current !== null) {
      cancelAnimationFrame(scratchAnimFrameRef.current);
      scratchAnimFrameRef.current = null;
    }
    if (scratchTargetRef.current !== null) {
      flushScratch();
    }
    if (wasPlayingBeforeScratchRef.current && currentBufferRef.current) {
      startBufferPlayback(currentBufferRef.current, pausedAtRef.current, 30);
    }
  }, [flushScratch, startBufferPlayback]);

  /**
   * Latest values for the MediaSession handlers.
   *
   * The element's own `currentTime` is preferred over the React state here
   * because these fire from the OS media keys, which can arrive faster than
   * React state settles.
   */
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const seekRef = useRef(seek);
  seekRef.current = seek;
  const togglePlayPauseRef = useRef(togglePlayPause);
  togglePlayPauseRef.current = togglePlayPause;

  // Register HTML5 MediaSession MPRIS Action Handlers
  //
  // Registered once. This effect used to list `currentTime` and `isPlaying` in
  // its dependencies, so all eight handlers were torn down and re-registered on
  // every `timeupdate` tick. The state they need is read at invocation time
  // through `isPlayingRef` instead, which is what makes a single registration
  // correct.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler("play", () => {
        if (!isPlayingRef.current) togglePlayPauseRef.current();
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        if (isPlayingRef.current) togglePlayPauseRef.current();
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        if (optsRef.current.onPreviousTrack) {
          optsRef.current.onPreviousTrack();
        } else {
          seekRef.current(0);
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
          seekRef.current(details.seekTime);
        }
      });
      navigator.mediaSession.setActionHandler("seekbackward", (details) => {
        const offset = details.seekOffset || 10;
        seekRef.current(pausedAtRef.current - offset);
      });
      navigator.mediaSession.setActionHandler("seekforward", (details) => {
        const offset = details.seekOffset || 10;
        seekRef.current(pausedAtRef.current + offset);
      });
      navigator.mediaSession.setActionHandler("stop", () => {
        pause();
        seekRef.current(0);
      });
    } catch (e) {
      console.warn("MediaSession action handler notice:", e);
    }
    // Registered once; see the note above.
  }, [pause]);

  const getFrequencyData = useCallback((): Uint8Array => {
    if (!analyserRef.current) return new Uint8Array(0);
    const binCount = analyserRef.current.frequencyBinCount;
    if (!freqArrayRef.current || freqArrayRef.current.length !== binCount) {
      freqArrayRef.current = new Uint8Array(binCount);
    }
    analyserRef.current.getByteFrequencyData(freqArrayRef.current);
    return freqArrayRef.current;
  }, []);

  const getTimeDomainData = useCallback((): Uint8Array => {
    if (!analyserRef.current) return new Uint8Array(0);
    const binCount = analyserRef.current.frequencyBinCount;
    if (!timeArrayRef.current || timeArrayRef.current.length !== binCount) {
      timeArrayRef.current = new Uint8Array(binCount);
    }
    analyserRef.current.getByteTimeDomainData(timeArrayRef.current);
    return timeArrayRef.current;
  }, []);

  /**
   * True-peak readout of the output bus, in dBFS, with a peak-hold.
   *
   * Uses `getFloatTimeDomainData` rather than the byte version so the peak is
   * read at full float precision. A one-sided read of the analyser's peak is
   * not a true peak: inter-sample peaks live between the samples the analyser
   * hands back, so this is an accurate sample-peak and is labelled as such in
   * the UI rather than being called "true peak", which would be a lie.
   * Hold is 1.6 s, the convention for a broadcast-style meter.
   */
  const getOutputPeak = useCallback((): { peakDb: number; holdDb: number; clipping: boolean } => {
    const analyser = analyserRef.current;
    if (!analyser) return { peakDb: -Infinity, holdDb: -Infinity, clipping: false };
    if (!meterScratchRef.current || meterScratchRef.current.length !== analyser.fftSize) {
      meterScratchRef.current = new Float32Array(analyser.fftSize);
    }
    const buf = meterScratchRef.current;
    analyser.getFloatTimeDomainData(buf);

    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const a = Math.abs(buf[i]);
      if (a > peak) peak = a;
    }

    const now = performance.now();
    const hold = peakHoldRef.current;
    if (peak >= hold.value) {
      hold.value = peak;
      hold.until = now + 1600;
    } else if (now > hold.until) {
      hold.value = peak;
    }

    const toDb = (v: number) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
    const ceiling = typeof dspSettings.ceilingDb === "number" ? dspSettings.ceilingDb : DSP_DEFAULTS.ceilingDb;
    return {
      peakDb: toDb(peak),
      holdDb: toDb(hold.value),
      clipping: peak > Math.pow(10, (ceiling + 0.1) / 20)
    };
  }, [dspSettings.ceilingDb]);

/** Equal-power dry/wet crossfade into the convolver. */
  const applyConvolutionMix = useCallback((engaged: boolean) => {
    const ctx = audioCtxRef.current;
    const dry = convolverDryRef.current;
 const wet = convolverWetRef.current;
    if (!ctx || !dry || !wet) return;
    // Equal power: cos/sin of the same angle, so the sum stays perceptually
    // constant through the middle instead of dipping like a linear crossfade.
    const pair = equalPowerPair(engaged ? 0.5 : 0);
    rampGain(ctx, dry, pair.dry, 0.08);
    rampGain(ctx, wet, pair.wet, 0.08);
  }, []);

  /**
   * Load an impulse response for the convolution room.
   *
   * `ConvolverNode.normalize` divides by the IR's energy so that swapping a
   * loud IR for a quiet one does not change perceived level; that normalisation
   * is what makes this a mixing tool rather than a volume knob. Without an IR
   * loaded the wet path stays closed, so a failed load degrades to the dry
   * signal instead of silence.
   */
  const loadImpulseResponse = useCallback(async (file: File): Promise<boolean> => {
    const ctx = audioCtxRef.current;
    const conv = convolverRef.current;
    if (!ctx || !conv) return false;
    try {
      const bytes = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(bytes);
      if (decoded.duration > 12) {
        // A pathological IR can be minutes long and costs real CPU to convolve.
        console.warn("[Cadence] impulse response longer than 12s, refusing:", decoded.duration);
        return false;
      }
      conv.buffer = decoded;
      updateDspSettings({ convolutionEnabled: true, convolutionName: file.name });
      applyConvolutionMix(true);
      return true;
    } catch (err) {
      console.error("[Cadence] impulse response decode failed:", err);
      return false;
    }
  }, [updateDspSettings, applyConvolutionMix]);

  const setConvolutionEnabled = useCallback((enabled: boolean) => {
    // Refuse to engage with no IR: a ConvolverNode with a null buffer passes
    // silence, so enabling it blindly would mute the wet path and, depending on
    // wiring, take the dry path with it.
    if (enabled && !convolverRef.current?.buffer) return;
    updateDspSettings({ convolutionEnabled: enabled });
    applyConvolutionMix(enabled);
  }, [updateDspSettings, applyConvolutionMix]);

  // Keep the graph in step with DSP settings that are not set directly by a
  // control: the ceiling curve, the EQ headroom trim, and the convolution mix.
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !isNodesConnectedRef.current) return;

    if (ceilingRef.current) {
   ceilingRef.current.curve = ceilingCurve;
    }
    applyEqHeadroom(eqGains, eqQs);
    applyConvolutionMix(dspSettings.convolutionEnabled);
  }, [ceilingCurve, dspSettings.eqHeadroomCompensation, dspSettings.convolutionEnabled, eqGains, eqQs, applyEqHeadroom, applyConvolutionMix]);

  // Reflect a bypass state change that came from anywhere, not just the setter.
  useEffect(() => {
    if (eqBypassGainRef.current && audioCtxRef.current) {
      rampGain(audioCtxRef.current, eqBypassGainRef.current, eqBypassed ? 0 : 1, SWITCH);
    }
  }, [eqBypassed]);

  /**
   * The engine object, memoised on its members.
   *
   * This was returned as a bare object literal, so it got a fresh identity on
   * every render of the component that calls this hook. Three separate pieces
   * of `App` list `audioEngine` (or a callback derived from it) in a dependency
   * array, and all three then tore down and rebuilt on every single render:
   *
   *   - the SSE remote-control connection, which was closed and re-opened on
   *     every `timeupdate` tick, opening a TCP connection and a server-side
   *     keep-alive timer several times a second;
   *   - the global keydown listener, removed and re-added every render;
   *   - the sleep-timer interval, reset every render, so a running countdown
   *     could never reliably reach its next tick.
   *
   * Memoising makes the object stable whenever nothing it exposes has changed,
   * which is the correct contract for a hook handle: methods are `useCallback`s
   * and the values are React state.
   */
  return useMemo(
    () => ({
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    playbackRate,
    baseBpm,
    currentBpm: Math.round(baseBpm * playbackRate * 10) / 10,
    pitchPercent: Math.round((playbackRate - 1.0) * 1000) / 10,
    pitchRange,
    keyLock,
    colorFilter,
    hotCues,
    beatLoop,
    eqGains,
    eqQs,
    eqBypassed,
    equalizerGains: eqGains,
    dspSettings,
    isLoading,
    sampleRate: audioInfo.sampleRate,
    baseLatency: audioInfo.baseLatency,
    outputLatency: audioInfo.outputLatency,
    playTrack,
    play,
    pause,
    togglePlay,
    togglePlayPause,
    seek,
    seekSmooth,
    setVolume: setAudioVolume,
    toggleMute,
    setSpeed,
    setBaseBpm,
    setPitchPercent,
    setPitchRange,
    setKeyLock,
    nudgePitch,
    resetPitch,
    setColorFilter,
    triggerHotCue,
    clearHotCue,
    setBeatLoop,
    exitLoop,
    setEqGain,
    setEqualizerGain: setEqGain,
    setAllEqGains,
    setEqQ,
    setEqBypass,
    applyPreset: setAllEqGains,
    updateDspSettings,
    fadeVolume,
    startScratch,
    scratch,
    endScratch,
    getFrequencyData,
    getTimeDomainData,
    getOutputPeak,
    loadImpulseResponse,
    setConvolutionEnabled
    }),
    [
      currentTrack, isPlaying, currentTime, duration, volume, isMuted,
      playbackRate, baseBpm, pitchRange, keyLock, colorFilter, hotCues,
      beatLoop, eqGains, eqQs, eqBypassed, dspSettings, isLoading, audioInfo,
    playTrack, play, pause, togglePlay, togglePlayPause, seek, seekSmooth,
  setAudioVolume, toggleMute, setSpeed, setBaseBpm, setPitchPercent,
      setPitchRange, setKeyLock, nudgePitch, resetPitch, setColorFilter,
      triggerHotCue, clearHotCue, setBeatLoop, exitLoop, setEqGain,
      setAllEqGains, setEqQ, setEqBypass, updateDspSettings, fadeVolume,
      startScratch, scratch, endScratch, getFrequencyData, getTimeDomainData,
      getOutputPeak, loadImpulseResponse, setConvolutionEnabled
    ]
  );
}
