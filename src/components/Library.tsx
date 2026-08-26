import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Disc3, FolderPlus, Music, RefreshCw, Search } from "lucide-react";
import type { Track } from "../types";
import { sortedTracks, useLibrary } from "../store/library";
import { usePlayer } from "../store/player";
import { fmtTime } from "../lib/format";

/* ----- Full-size art cache shared with Vinyl (module-level, deduped IPC) --- */

const artCache = new Map<string, string>();
const artPending = new Map<string, Promise<string | null>>();

export async function loadArt(trackId: string): Promise<string | null> {
  const hit = artCache.get(trackId);
  if (hit) return hit;
  let p = artPending.get(trackId);
  if (!p) {
    p = window.cadence
      .getArt(trackId)
      .then((url) => {
        if (url) artCache.set(trackId, url);
        return url;
      })
      .catch(() => null)
      .finally(() => artPending.delete(trackId));
    artPending.set(trackId, p);
  }
  return p;
}

export function useArt(trackId?: string): string | null {
  const [url, setUrl] = useState<string | null>(() =>
    trackId ? artCache.get(trackId) ?? null : null,
  );
  useEffect(() => {
    if (!trackId) {
      setUrl(null);
      return;
    }
    const hit = artCache.get(trackId);
    if (hit) {
      setUrl(hit);
      return;
    }
    let live = true;
    void loadArt(trackId).then((u) => {
      if (live && u) setUrl(u);
    });
    return () => {
      live = false;
    };
  }, [trackId]);
  return url;
}

/* ------------------------------------------------------------------ */

type ViewMode = "all" | "lossless" | "artists";

interface Group {
  key: string;
  label: string;
  year: number | null;
  sub: string;
  items: Track[];
}

const EMERALD = ["flac", "wav", "aiff", "aif", "alac"];
const NEUTRAL = ["mp3", "aac", "ogg", "oga", "opus", "m4a"];

const badgeTone = (codec: string): string => {
  const c = codec.toLowerCase();
  if (EMERALD.includes(c)) return "text-emerald-300/90";
  if (NEUTRAL.includes(c)) return "text-m3-on-surface-variant";
  return "text-violet-300/90";
};

function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span className="flex h-3 items-end gap-[2.5px]" aria-hidden>
      {[0, 180, 360].map((delay) => (
        <i
          key={delay}
          className={`cadence-eq-bar h-full w-[2px] rounded-full bg-m3-primary ${
            playing ? "" : "[animation-play-state:paused]"
          }`}
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

function ArtTile({ track }: { track: Track }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "320px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  const fetched = useArt(visible && !track.artThumbDataUrl ? track.id : undefined);
  const src = track.artThumbDataUrl ?? fetched;

  return (
    <div ref={ref} className="size-10 shrink-0">
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          className="size-10 rounded-xl object-cover ring-1 ring-white/10"
        />
      ) : (
        <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-white/[0.13] to-white/[0.03] text-white/35 ring-1 ring-white/10">
          <Disc3 size={16} strokeWidth={1.75} />
        </div>
      )}
    </div>
  );
}

function FilterChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[11px] font-medium tracking-wide transition-all duration-150 active:scale-[0.96] ${
        selected
          ? "border-transparent bg-m3-primary text-black"
          : "border-white/10 bg-white/5 text-m3-on-surface-variant hover:bg-white/10 hover:text-m3-on-surface"
      }`}
    >
      {children.toUpperCase()}
    </button>
  );
}

export default function Library() {
  const tracks = useLibrary((s) => s.tracks);
  const order = useLibrary((s) => s.order);
  const folders = useLibrary((s) => s.folders);
  const scanning = useLibrary((s) => s.scanning);
  const progress = useLibrary((s) => s.progress);
  const scanFolder = useLibrary((s) => s.scanFolder);
  const rescanAll = useLibrary((s) => s.rescanAll);

  const trackId = usePlayer((s) => s.trackId);
  const playing = usePlayer((s) => s.status === "playing");
  const playTrack = usePlayer((s) => s.playTrack);

  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("all");

  const all = useMemo(() => sortedTracks(tracks, order), [tracks, order]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (t) =>
        (view !== "lossless" || t.lossless) &&
        (!q ||
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q)),
    );
  }, [all, query, view]);

  const visibleIds = useMemo(() => filtered.map((t) => t.id), [filtered]);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const t of filtered) {
      const byArtist = view === "artists";
      const key = byArtist ? t.artist : `${t.album}\u0000${t.albumArtist ?? t.artist}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          label: byArtist ? t.artist : t.album,
          year: byArtist ? null : t.year ?? null,
          sub: "",
          items: [],
        };
        map.set(key, g);
      }
      g.items.push(t);
    }
    for (const g of map.values()) {
      if (view === "artists") {
        g.sub = `${new Set(g.items.map((t) => t.album)).size} ${g.items.length === 1 ? "album" : "albums"}`;
      } else {
        g.sub = g.items[0]?.albumArtist || g.items[0]?.artist || "";
      }
    }
    return [...map.values()];
  }, [filtered, view]);

  const hasLibrary = order.length > 0;
  const countLabel =
    query.trim() || view === "lossless"
      ? `${filtered.length}/${order.length}`
      : String(order.length);

  return (
    <section className="glass flex h-full min-h-0 flex-col overflow-hidden rounded-[28px]">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4">
        <div className="flex items-center gap-2.5">
          <h2 className="title-md">Library</h2>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs tabular-nums text-m3-on-surface-variant">
            {countLabel}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => void rescanAll()}
              disabled={scanning}
              aria-label="Rescan library"
              className="grid size-8 cursor-pointer place-items-center rounded-full text-m3-on-surface-variant transition-colors hover:bg-white/[0.07] hover:text-m3-on-surface active:bg-white/[0.11]"
            >
              <RefreshCw size={15} strokeWidth={1.75} className={scanning ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => void scanFolder()}
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-m3-secondary-container px-4 py-2 text-sm font-medium text-m3-primary transition-all duration-150 hover:brightness-125 active:scale-[0.97]"
            >
              <FolderPlus size={15} strokeWidth={1.75} />
              Add folder
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-3 flex h-9 items-center gap-2.5 rounded-full border border-white/[0.06] bg-black/25 px-4 transition-colors focus-within:border-white/20">
          <Search size={14} strokeWidth={1.75} className="shrink-0 text-m3-on-surface-variant" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, artist, album"
            spellCheck={false}
            className="w-full select-text bg-transparent text-sm text-m3-on-surface outline-none placeholder:text-m3-on-surface-variant/70"
          />
        </div>

        {/* Filter chips */}
        <div className="mt-3 flex items-center gap-2">
          <FilterChip selected={view === "all"} onClick={() => setView("all")}>
            All
          </FilterChip>
          <FilterChip selected={view === "lossless"} onClick={() => setView("lossless")}>
            Lossless
          </FilterChip>
          <FilterChip selected={view === "artists"} onClick={() => setView("artists")}>
            Artists
          </FilterChip>
        </div>

        {/* Scan progress */}
        {scanning && (
          <div className="mt-3 flex items-center gap-2.5">
            <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="cadence-scan-sweep h-full w-1/4 rounded-full bg-gradient-to-r from-transparent via-m3-primary to-transparent" />
            </div>
            <span className="text-xs tabular-nums text-m3-on-surface-variant">
              {progress ? `${progress.done}/${progress.total}` : "Scanning"}
            </span>
          </div>
        )}
        {scanning && progress?.currentFile && (
          <p className="mt-1 truncate text-[11px] text-m3-on-surface-variant/70">
            {progress.currentFile}
          </p>
        )}
      </div>

      {/* Body */}
      {hasLibrary ? (
        filtered.length > 0 ? (
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            {groups.map((g) => (
              <motion.section
                key={g.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <div
                  className="sticky top-0 z-10 -mx-1 mb-1 mt-3 flex items-baseline gap-2 px-3 py-1.5 backdrop-blur-xl"
                  style={{
                    background:
                      "color-mix(in oklab, var(--m3-surface-container) 76%, transparent)",
                  }}
                >
                  <h3 className="text-sm font-semibold">{g.label}</h3>
                  {g.year !== null && (
                    <span className="text-xs tabular-nums text-m3-on-surface-variant">
                      {g.year}
                    </span>
                  )}
                  <span className="ml-auto truncate pl-4 text-xs text-m3-on-surface-variant">
                    {g.sub}
                  </span>
                </div>
                {g.items.map((t) => {
                  const isCurrent = t.id === trackId;
                  return (
                    <button
                      key={t.id}
                      onClick={() => void playTrack(t.id, visibleIds)}
                      className="state-layer flex h-14 w-full cursor-pointer items-center gap-3 rounded-2xl px-3 text-left"
                    >
                      <ArtTile track={t} />
                      <span className="min-w-0 flex-1">
                        <span
                          className={`flex items-center gap-2 ${isCurrent ? "text-m3-primary" : ""}`}
                        >
                          <span className="truncate text-sm font-medium">{t.title}</span>
                          {isCurrent && <Equalizer playing={playing} />}
                        </span>
                        <span className="block truncate text-xs text-m3-on-surface-variant">
                          {t.artist} · {fmtTime(t.durationSec)}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 text-[10px] font-medium uppercase tracking-wider ${badgeTone(t.codec)}`}
                      >
                        {t.codec}
                      </span>
                    </button>
                  );
                })}
              </motion.section>
            ))}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center px-8">
            <p className="text-center text-sm text-m3-on-surface-variant">
              No matches for &ldquo;{query.trim()}&rdquo;
            </p>
          </div>
        )
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center px-8">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="flex flex-col items-center text-center"
          >
            <div className="glass grid size-[72px] place-items-center rounded-full text-m3-on-surface-variant">
              <Music size={28} strokeWidth={1.75} />
            </div>
            <h3 className="display-lg mt-6 text-[26px]">Your library awaits</h3>
            <p className="mt-2 max-w-[260px] text-sm leading-relaxed text-m3-on-surface-variant">
              Point Cadence at a folder and it does the rest. Bit-perfect playback for the formats
              you actually own.
            </p>
            <p className="label-sm mt-4 normal-case tracking-normal">
              FLAC · WAV · AIFF · ALAC · MP3 · APE · DSF · WMA · OGG
            </p>
            <button
              onClick={() => void scanFolder()}
              className="mt-6 flex cursor-pointer items-center gap-2 rounded-full bg-m3-primary px-5 py-2.5 text-sm font-medium text-black shadow-lg shadow-black/30 transition-transform duration-150 hover:scale-[1.03] active:scale-95"
            >
              <FolderPlus size={16} strokeWidth={1.75} />
              Add folder
            </button>
            {!folders.length && (
              <p className="mt-4 text-[11px] text-m3-on-surface-variant/60">
                Nothing leaves your machine. Scanning is local.
              </p>
            )}
          </motion.div>
        </div>
      )}
    </section>
  );
}
