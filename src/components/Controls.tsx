import { useCallback, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import {
  Loader2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCurrentTrack, usePlayer } from "../store/player";
import { fmtQuality, fmtTime } from "../lib/format";

/* ----- Shared slim slider (M3-style) ------------------------------------- */

interface SliderProps {
  value: number; // 0..1
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  className?: string;
  ariaLabel: string;
}

function Slider({ value, onChange, onCommit, className, ariaLabel }: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const ratioFrom = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    onChange(ratioFrom(e.clientX));
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging) onChange(ratioFrom(e.clientX));
  };
  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    onCommit?.(value);
  };
  const onPointerCancel = () => {
    setDragging(false);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(1, value + step);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(0, value - step);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 1;
    if (next === null) return;
    e.preventDefault();
    onChange(next);
    onCommit?.(next);
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
      className={`group flex h-5 cursor-pointer items-center outline-none ${className ?? ""}`}
    >
      <div ref={trackRef} className="relative h-1 w-full rounded-full bg-white/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${value * 100}%`,
            background:
              "linear-gradient(90deg, var(--m3-primary), color-mix(in oklab, var(--m3-primary) 55%, white))",
          }}
        />
        <span
          className={`absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.5)] transition-transform duration-150 group-hover:scale-100 ${
            dragging ? "scale-100" : "scale-0"
          }`}
          style={{ left: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const GhostButton = ({
  onClick,
  label,
  active,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  children: ReactNode;
}) => (
  <button
    onClick={onClick}
    aria-label={label}
    title={label}
    className={`relative grid size-9 cursor-pointer place-items-center rounded-full transition-colors duration-150 hover:bg-white/[0.06] active:bg-white/[0.1] ${
      active ? "text-m3-primary" : "text-m3-on-surface-variant hover:text-m3-on-surface"
    }`}
  >
    {children}
    {active && (
      <span className="absolute -bottom-[3px] left-1/2 size-1 -translate-x-1/2 rounded-full bg-m3-primary" />
    )}
  </button>
);

export default function Controls() {
  const status = usePlayer((s) => s.status);
  const positionSec = usePlayer((s) => s.positionSec);
  const durationSec = usePlayer((s) => s.durationSec);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const seek = usePlayer((s) => s.seek);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);

  const track = useCurrentTrack();
  const [scrub, setScrub] = useState<number | null>(null);

  const dur = durationSec || track?.durationSec || 0;
  const shownPos = scrub !== null ? scrub * dur : positionSec;

  const commitSeek = useCallback(
    (v: number) => {
      setScrub(null);
      if (dur > 0) seek(v * dur);
    },
    [dur, seek],
  );

  const changeVolume = useCallback(
    (v: number) => {
      if (muted && v > 0) toggleMute();
      setVolume(v);
    },
    [muted, setVolume, toggleMute],
  );

  const effVolume = muted ? 0 : volume;
  const playing = status === "playing";
  const hasTrack = !!track;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center">
      <div className="mx-auto flex w-full max-w-[600px] flex-col gap-5 px-10">
        {/* Track info */}
        <div className="text-center">
          <h2 className="truncate text-xl font-semibold tracking-tight">
            {track ? track.title : "Nothing playing"}
          </h2>
          <p className="mt-1 truncate text-sm text-m3-on-surface-variant">
            {track ? `${track.artist} · ${track.album}` : "Pick something from your library"}
          </p>
          {track && (
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] uppercase tracking-wide text-m3-on-surface-variant">
              <span
                className={`size-1.5 rounded-full ${track.lossless ? "bg-emerald-400" : "bg-amber-400"}`}
              />
              {fmtQuality(track)}
            </span>
          )}
        </div>

        {/* Seekbar */}
        <div>
          <Slider
            value={scrub ?? (dur > 0 ? Math.min(1, positionSec / dur) : 0)}
            onChange={(v) => setScrub(v)}
            onCommit={commitSeek}
            ariaLabel="Seek"
          />
          <div className="-mt-0.5 flex justify-between text-xs tabular-nums text-m3-on-surface-variant">
            <span>{fmtTime(shownPos)}</span>
            <span>{dur > 0 ? `-${fmtTime(Math.max(0, dur - shownPos))}` : fmtTime(0)}</span>
          </div>
        </div>

        {/* Transport */}
        <div className="mt-1 flex items-center justify-center gap-3">
          <GhostButton onClick={() => toggleShuffle()} label="Shuffle" active={shuffle}>
            <Shuffle size={18} strokeWidth={1.75} />
          </GhostButton>
          <GhostButton onClick={() => prev()} label="Previous">
            <SkipBack size={20} strokeWidth={1.75} fill="currentColor" />
          </GhostButton>

          <button
            onClick={() => toggle()}
            disabled={!hasTrack}
            aria-label={playing ? "Pause" : "Play"}
            className="grid size-16 cursor-pointer place-items-center rounded-full bg-m3-primary text-black shadow-lg shadow-black/40 transition-transform duration-150 hover:scale-[1.04] active:scale-95 disabled:cursor-default disabled:opacity-40 disabled:hover:scale-100"
          >
            {status === "loading" ? (
              <Loader2 size={26} strokeWidth={1.75} className="animate-spin" />
            ) : playing ? (
              <Pause size={26} strokeWidth={1.75} fill="currentColor" />
            ) : (
              <Play size={26} strokeWidth={1.75} fill="currentColor" className="ml-0.5" />
            )}
          </button>

          <GhostButton onClick={() => next()} label="Next">
            <SkipForward size={20} strokeWidth={1.75} fill="currentColor" />
          </GhostButton>
          <GhostButton
            onClick={() => cycleRepeat()}
            label={`Repeat: ${repeat}`}
            active={repeat !== "off"}
          >
            {repeat === "one" ? (
              <Repeat1 size={18} strokeWidth={1.75} />
            ) : (
              <Repeat size={18} strokeWidth={1.75} />
            )}
          </GhostButton>
        </div>

        {/* Volume */}
        <div className="mt-1 flex items-center justify-center gap-2 self-center">
          <button
            onClick={() => toggleMute()}
            aria-label={muted ? "Unmute" : "Mute"}
            className="grid size-8 cursor-pointer place-items-center rounded-full text-m3-on-surface-variant transition-colors hover:bg-white/[0.06] hover:text-m3-on-surface active:bg-white/[0.1]"
          >
            {effVolume === 0 ? (
              <VolumeX size={16} strokeWidth={1.75} />
            ) : (
              <Volume2 size={16} strokeWidth={1.75} />
            )}
          </button>
          <Slider value={effVolume} onChange={changeVolume} ariaLabel="Volume" className="w-24" />
        </div>
      </div>
    </div>
  );
}
