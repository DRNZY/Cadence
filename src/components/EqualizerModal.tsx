import React, { useRef, useState } from "react";
import { Sliders, X, RotateCcw, Radio, Power, Upload } from "./icons";
import { EQ_FREQUENCIES, EQ_DEFAULT_Q } from "../hooks/useAudioEngine";
import { PRESETS, DspSettings, Track } from "../types";

export interface AudioEngineInfo {
  /** Sample rate the AudioContext actually opened at, in Hz. */
  sampleRate?: number;
  /** Rendering latency the context reports, in seconds. */
  baseLatency?: number;
  /** Latency between the context and the output device, in seconds. */
  outputLatency?: number;
}

interface EqualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  gains?: number[];
  eqGains?: number[];
  /** Per-band Q. Absent before the engine reports it, in which case the UI
   *  falls back to the default and still allows editing. */
  eqQs?: number[];
  eqBypassed?: boolean;
  dspSettings?: DspSettings;
  currentTrack?: Track | null;
  audioInfo?: AudioEngineInfo;
  onSetGain: (bandIndex: number, gain: number) => void;
  onSetQ?: (bandIndex: number, q: number) => void;
  onSetBypass?: (bypassed: boolean) => void;
  onApplyPreset?: (gains: number[]) => void;
  onSetAllGains?: (gains: number[]) => void;
  onUpdateDspSettings?: (settings: Partial<DspSettings>) => void;
  onLoadImpulseResponse?: (file: File) => Promise<boolean>;
}

const fmtMs = (seconds?: number) => {
  if (typeof seconds !== "number" || !isFinite(seconds) || seconds <= 0) return "unknown";
  return `${Math.round(seconds * 1000)} ms`;
};

const fmtDb = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1));

export const EqualizerModal: React.FC<EqualizerModalProps> = ({
  isOpen,
  onClose,
  gains,
  eqGains,
  eqQs,
  eqBypassed,
  dspSettings,
  currentTrack,
  audioInfo,
  onSetGain,
  onSetQ,
  onSetBypass,
  onApplyPreset,
  onSetAllGains,
  onUpdateDspSettings,
  onLoadImpulseResponse
}) => {
  const [activeTab, setActiveTab] = useState<"eq" | "dsp">("eq");
  const [irError, setIrError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const currentGains = Array.isArray(gains) ? gains : Array.isArray(eqGains) ? eqGains : new Array(10).fill(0);
  const currentQs = Array.isArray(eqQs) && eqQs.length === EQ_FREQUENCIES.length
    ? eqQs
    : new Array(EQ_FREQUENCIES.length).fill(EQ_DEFAULT_Q);
  const applyPresetHandler = onApplyPreset || onSetAllGains || (() => {});
  const updateDspHandler = onUpdateDspSettings || (() => {});

  const safeDsp: DspSettings = dspSettings || {
    crossfadeSeconds: 0,
    replayGainEnabled: true,
    replayGainMode: "track",
    preampGain: 0,
    eqHeadroomCompensation: true,
    convolutionEnabled: false,
    ceilingDb: -0.3
  };

  // The auto trim the engine is currently applying in front of the EQ. Shown so
  // the headroom control is not a black box: the user can see exactly how much
  // the curve is being pulled down and why.
  const autoTrimDb = safeDsp.eqHeadroomCompensation
    ? -Math.max(0, ...currentGains.map(g => (typeof g === "number" && isFinite(g) ? g : 0)))
    : 0;

  const handleIrFile = async (file: File | undefined) => {
    if (!file || !onLoadImpulseResponse) return;
    setIrError(null);
    const ok = await onLoadImpulseResponse(file);
    if (!ok) {
      setIrError("Could not decode that file. Use a mono or stereo WAV/FLAC impulse response under 12 seconds.");
    }
  };

  const trackTag = safeDsp.replayGainMode === "album"
    ? currentTrack?.replayGainAlbum
    : currentTrack?.replayGainTrack;

  return (
    <div
      className="cadence-fade-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xl"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="cadence-pop-in w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-neutral-900/95 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5 no-scrollbar"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/30">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Signal Chain</h2>
              <p className="text-[11px] text-neutral-400 font-mono">
                {currentTrack
                  ? `${currentTrack.format.toUpperCase()} ${currentTrack.bitsPerSample ? `${currentTrack.bitsPerSample}-bit` : ""} / ${currentTrack.sampleRate ? `${(currentTrack.sampleRate / 1000).toFixed(1)} kHz` : "rate unknown"}`
                  : "No track loaded"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-black/50 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setActiveTab("eq")}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === "eq" ? "bg-white/20 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                }`}
              >
                Equalizer
              </button>
              <button
                onClick={() => setActiveTab("dsp")}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === "dsp" ? "bg-primary/30 text-primary shadow-sm" : "text-neutral-400 hover:text-white"
                }`}
              >
                DSP
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab 1: 10-Band Graphic EQ */}
        {activeTab === "eq" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map(p => {
                const isMatch = p.gains.every((g, i) => Math.abs(g - (currentGains[i] ?? 0)) < 0.2);
                return (
                  <button
                    key={p.name}
                    onClick={() => applyPresetHandler(p.gains)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all shrink-0 active:scale-95 ${
                      isMatch
                        ? "bg-white/20 border-white/40 text-white shadow-sm font-bold"
                        : "bg-white/5 hover:bg-white/15 border-white/5 hover:border-white/20 text-neutral-300 hover:text-white"
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
              <button
                onClick={() => applyPresetHandler(new Array(10).fill(0))}
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center gap-1 shrink-0 ml-auto transition-colors active:scale-95"
              >
                <RotateCcw className="w-3 h-3" /> Flat
              </button>

              {onSetBypass && (
                <button
                  onClick={() => onSetBypass(!eqBypassed)}
                  aria-pressed={!!eqBypassed}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 transition-colors active:scale-95 ${
                    eqBypassed
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                      : "bg-white/5 border-white/10 text-neutral-400 hover:text-white"
                  }`}
                >
                  <Power className="w-3 h-3" />
                  {eqBypassed ? "EQ Bypassed" : "EQ Active"}
                </button>
              )}
            </div>

            <div
              className={`grid grid-cols-10 gap-2.5 py-4 px-3 bg-black/40 rounded-2xl border border-white/5 items-center transition-opacity ${
                eqBypassed ? "opacity-40" : "opacity-100"
              }`}
            >
              {EQ_FREQUENCIES.map((freq, idx) => {
                const gain = currentGains[idx] ?? 0;
                const q = currentQs[idx] ?? EQ_DEFAULT_Q;
                const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;

                return (
                  <div key={freq} className="flex flex-col items-center space-y-2 h-72 justify-between">
                    <span className="text-[10px] font-mono text-neutral-400 font-medium">
                      {gain > 0 ? `+${gain.toFixed(0)}` : gain.toFixed(0)}dB
                    </span>

                    <div className="relative flex-1 flex items-center justify-center w-full">
                      <input
                        type="range"
                        aria-label={`${freq} Hz gain`}
                        min="-12"
                        max="12"
                        step="0.5"
                        value={gain}
                        onChange={e => onSetGain(idx, parseFloat(e.target.value))}
                        className="h-36 w-1.5 accent-primary bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                        style={{
                          writingMode: "vertical-lr",
                          direction: "rtl"
                        }}
                      />
                    </div>

                    <span className="text-[10px] font-mono text-neutral-300 font-bold uppercase">
                      {label}
                    </span>

                    {/* Q control. Narrower than 1.0 starts ringing across
                        neighbours, wider than ~8 stops being a correction and
                        starts being a filter, so the range is bounded. */}
                    {onSetQ && (
                      <div className="flex flex-col items-center gap-0.5 w-full">
                        <input
                          type="range"
                          aria-label={`${freq} Hz Q`}
                          min="0.3"
                          max="8"
                          step="0.1"
                          value={Math.min(8, Math.max(0.3, q))}
                          onChange={e => onSetQ(idx, parseFloat(e.target.value))}
                          className="w-full h-1 accent-sky-400 bg-neutral-800 rounded cursor-pointer"
                        />
                        <span className="text-[9px] font-mono text-sky-400/80">
                          Q{q.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {onSetQ && (
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                Q sets how much each band touches its neighbours. 1.4 is a smooth
                tilt. Below 1.0 a band rings into the ones around it. Above ~4 you
                are cutting a specific frequency rather than shaping a curve.
              </p>
            )}
          </div>
        )}

        {/* Tab 2: WebAudio DSP Sound Stage */}
        {activeTab === "dsp" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* ReplayGain Normalization */}
              <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
                      <Radio className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-white">ReplayGain</h3>
                      <p className="text-[11px] text-neutral-400">Loudness levelling from file tags</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    aria-label="Enable ReplayGain"
                    checked={safeDsp.replayGainEnabled}
                    onChange={e => updateDspHandler({ replayGainEnabled: e.target.checked })}
                    className="w-4 h-4 accent-primary rounded cursor-pointer"
                  />
                </div>

                {/* Track and album gain are computed against different
                    references, so mixing them is not a thing. The mode is an
                    explicit choice, not a fallback chain. */}
                <div className="flex gap-1.5">
                  {(["track", "album"] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => updateDspHandler({ replayGainMode: mode })}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border capitalize transition-colors ${
                        safeDsp.replayGainMode === mode
                          ? "bg-sky-500/20 border-sky-500/40 text-sky-300"
                          : "bg-white/5 border-white/5 text-neutral-400 hover:text-white"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                <p className="text-[10px] font-mono text-neutral-500 leading-relaxed">
                  {currentTrack
                    ? typeof trackTag === "number"
                      ? `${safeDsp.replayGainMode} tag: ${fmtDb(trackTag)} dB`
                      : `No ${safeDsp.replayGainMode} gain tag on this file`
                    : "Load a track to see its tag"}
                </p>
              </div>

              {/* EQ headroom */}
              <div className="bg-black/40 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">EQ Headroom</h3>
                    <p className="text-[11px] text-neutral-400">
                      Auto trim {fmtDb(autoTrimDb)} dB for {fmtDb(-autoTrimDb)} dB boost
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  aria-label="Enable EQ headroom compensation"
                  checked={safeDsp.eqHeadroomCompensation}
                  onChange={e => updateDspHandler({ eqHeadroomCompensation: e.target.checked })}
                  className="w-4 h-4 accent-primary rounded cursor-pointer"
                />
              </div>
            </div>

            {/* Preamp, Ceiling, Crossfade */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-white">Preamp Gain</span>
                  <span className="font-mono text-primary font-bold">
                    {fmtDb(safeDsp.preampGain || 0)} dB
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Preamp gain"
                  min="-6"
                  max="6"
                  step="0.5"
                  value={safeDsp.preampGain || 0}
                  onChange={e => updateDspHandler({ preampGain: parseFloat(e.target.value) })}
                  className="w-full accent-primary bg-neutral-800 rounded-lg cursor-pointer"
                />
              </div>

              <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-white">Output Ceiling</span>
                  <span className="font-mono text-primary font-bold">
                    {fmtDb(safeDsp.ceilingDb ?? -0.3)} dBFS
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Output ceiling"
                  min="-3"
                  max="0"
                  step="0.1"
                  value={safeDsp.ceilingDb ?? -0.3}
                  onChange={e => updateDspHandler({ ceilingDb: parseFloat(e.target.value) })}
                  className="w-full accent-primary bg-neutral-800 rounded-lg cursor-pointer"
                />
                <p className="text-[10px] font-mono text-neutral-500">
                  Soft knee. Catches overs, leaves normal peaks alone.
                </p>
              </div>

              <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-white">Track Crossfade</span>
                  <span className="font-mono text-primary font-bold">
                    {safeDsp.crossfadeSeconds === 0
                      ? "Off (0s)"
                      : `${safeDsp.crossfadeSeconds}s`}
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Track crossfade"
                  min="0"
                  max="10"
                  step="1"
                  value={safeDsp.crossfadeSeconds || 0}
                  onChange={e => updateDspHandler({ crossfadeSeconds: parseInt(e.target.value, 10) })}
                  className="w-full accent-primary bg-neutral-800 rounded-lg cursor-pointer"
                />
                <p className="text-[10px] font-mono text-neutral-500">
                  0 is a short fade, not sample-accurate gapless.
                </p>
              </div>
            </div>

            {/* Convolution room */}
            <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center">
                    <Upload className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">Convolution Room</h3>
                    <p className="text-[11px] text-neutral-400">
                      {safeDsp.convolutionName
                        ? safeDsp.convolutionName
                        : "No impulse response loaded"}
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  aria-label="Enable convolution room"
                  checked={safeDsp.convolutionEnabled}
                  disabled={!safeDsp.convolutionName}
                  onChange={e => updateDspHandler({ convolutionEnabled: e.target.checked })}
                  className="w-4 h-4 accent-primary rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/15 border border-white/10 text-neutral-200 transition-colors active:scale-95"
                >
                  Load impulse response
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".wav,.flac,.aiff,.aif,.mp3,.ogg"
                  className="hidden"
                  onChange={e => {
                    void handleIrFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <span className="text-[10px] font-mono text-neutral-500">
                  Equal-power dry/wet at 100%. WAV or FLAC, up to 12s.
                </span>
              </div>

              {irError && (
                <p className="text-[11px] text-rose-400 font-mono">{irError}</p>
              )}
            </div>

            {/* Measured engine state. These are read from the live AudioContext,
                not asserted, so the numbers cannot drift from reality. */}
            <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-2">
              <h3 className="text-xs font-bold text-white">Engine</h3>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[11px]">
                <div>
                  <dt className="text-neutral-500">Context rate</dt>
                  <dd className="text-emerald-400 font-bold">
                    {audioInfo?.sampleRate ? `${(audioInfo.sampleRate / 1000).toFixed(1)} kHz` : "n/a"}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Render latency</dt>
                  <dd className="text-emerald-400 font-bold">{fmtMs(audioInfo?.baseLatency)}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Output latency</dt>
                  <dd className="text-emerald-400 font-bold">{fmtMs(audioInfo?.outputLatency)}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Path</dt>
                  <dd className="text-emerald-400 font-bold">32-bit float</dd>
                </div>
              </dl>
              <p className="text-[10px] font-mono text-neutral-500 leading-relaxed">
                The signal path is 32-bit float internally at all times. Decoding
                happens in the browser's own resampler, so a 96 kHz file may be
                played at the context rate above rather than at its native rate.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
