import { useEffect, useRef } from "react";
import { Disc3 } from "lucide-react";
import { useCurrentTrack, usePlayer } from "../store/player";
import { useArt } from "./Library";

/** 33⅓ rpm expressed in degrees/second. */
const RPM_DEG_PER_SEC = 198;

export default function Vinyl() {
  const status = usePlayer((s) => s.status);
  const toggle = usePlayer((s) => s.toggle);
  const track = useCurrentTrack();
  const playing = status === "playing";
  const art = useArt(track?.id);

  const diskRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  /**
   * JS-owned rotation: exponential ease toward target angular velocity gives
   * physical spin-up/spin-down. Loop self-terminates once fully stopped.
   * The transform on diskRef is never touched by CSS or motion.
   */
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    let raf = 0;
    let last = performance.now();
    const state = { angle: 0, vel: 0 };

    const tick = (t: number) => {
      const dt = Math.min(Math.max((t - last) / 1000, 0), 0.05);
      last = t;
      const target = playingRef.current ? RPM_DEG_PER_SEC : 0;
      state.vel += (target - state.vel) * Math.min(1, dt * 2.4);
      state.angle = (state.angle + state.vel * dt) % 360;
      if (diskRef.current) {
        diskRef.current.style.transform = `rotate(${state.angle}deg)`;
      }
      if (!playingRef.current && state.vel < 0.01) return; // at rest: sleep
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center p-8">
      <div className="relative grid place-items-center">
        {/* Ambient floor glow */}
        <div
          aria-hidden
          className={`pointer-events-none absolute bottom-[2%] left-1/2 h-20 w-[68%] -translate-x-1/2 rounded-full blur-3xl transition-opacity duration-700 ${
            playing ? "opacity-60" : "opacity-30"
          }`}
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--ambient-1) 55%, transparent), transparent)",
          }}
        />

        <button
          onClick={() => toggle()}
          aria-label={playing ? "Pause" : "Play"}
          className={`relative aspect-square cursor-pointer rounded-full outline-none transition-transform duration-150 ease-out active:scale-[0.985] ${
            track ? "" : "brightness-75"
          }`}
          style={{
            width: "min(46vh, 520px)",
            height: "min(46vh, 520px)",
            filter: "drop-shadow(0 40px 80px rgba(0,0,0,.6))",
          }}
        >
          {/* Rotating body — grooves + sheen + label travel together */}
          <div ref={diskRef} className="absolute inset-0 will-change-transform">
            <div className="vinyl-grooves absolute inset-0 rounded-full" />
            <div className="vinyl-sheen absolute inset-0 rounded-full" />
            <div className="absolute left-1/2 top-1/2 size-[38%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-[var(--m3-primary-container)] ring-2 ring-black/60">
              {art ? (
                <img src={art} alt="" draggable={false} className="size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center text-black/45">
                  <Disc3 size={36} strokeWidth={1.75} />
                </span>
              )}
            </div>
          </div>

          {/* Static lighting layers */}
          <div
            aria-hidden
            className="absolute inset-0 rounded-full border border-white/10 shadow-[inset_0_0_60px_rgba(0,0,0,0.35)]"
          />
          <div
            aria-hidden
            className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,transparent_52%,rgba(0,0,0,0.38)_100%)]"
          />
          <span
            aria-hidden
            className="absolute left-1/2 top-1/2 z-10 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/90 ring-1 ring-white/20"
          />
        </button>
      </div>

      <p className="label-sm mt-8 tabular-nums">{playing ? "33⅓ RPM" : "At rest"}</p>
    </div>
  );
}
