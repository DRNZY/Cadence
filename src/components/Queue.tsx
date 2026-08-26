import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Track } from "../types";
import { useLibrary } from "../store/library";
import { usePlayer } from "../store/player";
import { fmtTime } from "../lib/format";

export default function Queue() {
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const positionSec = usePlayer((s) => s.positionSec);
  const durationSec = usePlayer((s) => s.durationSec);
  const playTrack = usePlayer((s) => s.playTrack);
  const tracks = useLibrary((s) => s.tracks);

  const current = queueIndex >= 0 ? tracks[queue[queueIndex]] : undefined;
  const progress = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0;

  const upcoming = useMemo(
    () =>
      queue
        .slice(queueIndex + 1)
        .map((id, i) => ({ track: tracks[id], id, n: queueIndex + i + 2 }))
        .filter((x): x is { track: Track; id: string; n: number } => x.track !== undefined),
    [queue, queueIndex, tracks],
  );

  return (
    <section className="glass flex h-full min-h-0 flex-col overflow-hidden rounded-[28px]">
      <div className="flex shrink-0 items-center gap-2.5 px-4 pt-4 pb-2">
        <h2 className="title-md">Up Next</h2>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs tabular-nums text-m3-on-surface-variant">
          {upcoming.length}
        </span>
      </div>

      {current ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {/* Pinned current track with progress hairline */}
          <div className="mb-1 mt-1 rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/[0.07]">
            <p className="truncate text-sm font-medium text-m3-primary">{current.title}</p>
            <div className="mt-0.5 flex items-baseline justify-between gap-3">
              <p className="truncate text-xs text-m3-on-surface-variant">{current.artist}</p>
              <p className="shrink-0 text-[11px] tabular-nums text-m3-on-surface-variant">
                {fmtTime(positionSec)} / {fmtTime(durationSec)}
              </p>
            </div>
            <div className="mt-2 h-[2px] overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full origin-left bg-m3-primary"
                style={{ transform: `scaleX(${progress})` }}
              />
            </div>
          </div>

          <AnimatePresence initial={false}>
            {upcoming.map(({ track, id, n }) => (
              <motion.button
                key={id}
                layout
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                onClick={() => void playTrack(id, queue)}
                className="state-layer flex h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left"
              >
                <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-m3-on-surface-variant/60">
                  {n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{track.title}</span>
                  <span className="block truncate text-xs text-m3-on-surface-variant">
                    {track.artist}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-m3-on-surface-variant/70">
                  {fmtTime(track.durationSec)}
                </span>
              </motion.button>
            ))}
          </AnimatePresence>
          {upcoming.length === 0 && (
            <p className="pt-6 text-center text-sm text-m3-on-surface-variant/60">
              End of the line
            </p>
          )}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center px-6 pb-6">
          <p className="text-center text-sm text-m3-on-surface-variant/70">Queue is empty</p>
        </div>
      )}
    </section>
  );
}
