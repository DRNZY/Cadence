import { useEffect, useRef, useState } from "react";
import { engine } from "../audio/engine";

const BARS = 64;
const GAP = 2;
const DECAY = 0.82;
const BASELINE_Y = 0.72;

/** Exponentially spaced frequency-bin indices across the musical range. */
const buildBins = (binCount: number): number[] => {
  const lo = 2;
  const hi = Math.min(binCount - 2, 720);
  const out: number[] = [];
  for (let i = 0; i < BARS; i++) {
    out.push(Math.round(lo * Math.pow(hi / lo, i / (BARS - 1))));
  }
  return out;
};

const parseHex = (v: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export default function Visualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let W = 0;
    let H = 0;
    const levels = new Float32Array(BARS);
    let sig = new Uint8Array(0);
    let bins: number[] = [];
    let hadAnalyser = false;
    let primary: [number, number, number] = [205, 189, 255];
    let paletteFrame = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = rect.width;
      H = rect.height;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (document.hidden || W === 0) return;

      // Re-resolve dynamic palette every ~30 frames.
      if (paletteFrame++ % 30 === 0) {
        const parsed = parseHex(
          getComputedStyle(document.documentElement).getPropertyValue("--m3-primary"),
        );
        if (parsed) primary = parsed;
      }

      const analyser =
        typeof engine.getAnalyser === "function" ? engine.getAnalyser() : null;
      if (!!analyser !== hadAnalyser) {
        hadAnalyser = !!analyser;
        setLive(hadAnalyser);
      }

      ctx.clearRect(0, 0, W, H);
      const baseY = H * BASELINE_Y;

      if (analyser) {
        if (sig.length !== analyser.frequencyBinCount) {
          sig = new Uint8Array(analyser.frequencyBinCount);
          bins = buildBins(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(sig);
        for (let i = 0; i < BARS; i++) {
          const b = bins[i];
          const target = (sig[b] + sig[b + 1]) / 510;
          levels[i] = Math.max(target, levels[i] * DECAY);
        }
      } else {
        for (let i = 0; i < BARS; i++) levels[i] *= DECAY;
      }

      const barW = Math.max(1, (W - (BARS - 1) * GAP) / BARS);
      const maxH = baseY - 4;

      if (analyser) {
        const grad = ctx.createLinearGradient(0, baseY - maxH, 0, baseY);
        grad.addColorStop(0, `rgba(${primary[0]},${primary[1]},${primary[2]},0.95)`);
        grad.addColorStop(1, `rgba(${primary[0]},${primary[1]},${primary[2]},0.18)`);
        ctx.fillStyle = grad;

        for (let i = 0; i < BARS; i++) {
          const h = Math.max(levels[i] * maxH, 1);
          const x = i * (barW + GAP);
          ctx.beginPath();
          ctx.roundRect(x, baseY - h, barW, h, [3, 3, 0, 0]);
          ctx.fill();
        }

        // Mirrored dim copy below baseline
        ctx.globalAlpha = 0.25;
        for (let i = 0; i < BARS; i++) {
          const h = Math.max(levels[i] * maxH * 0.32, 0);
          if (h < 0.5) continue;
          const x = i * (barW + GAP);
          ctx.beginPath();
          ctx.roundRect(x, baseY + 1, barW, h, [0, 0, 2, 2]);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else {
        // Idle: flat baseline dots
        ctx.fillStyle = `rgba(${primary[0]},${primary[1]},${primary[2]},0.35)`;
        const cy = baseY;
        for (let i = 0; i < BARS; i++) {
          const x = i * (barW + GAP) + barW / 2;
          ctx.beginPath();
          ctx.arc(x, cy, 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Baseline hairline
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(0, baseY, W, 1);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <section className="glass flex h-24 shrink-0 flex-col overflow-hidden rounded-[24px]">
      <div className="flex items-center gap-2 px-4 pt-2.5">
        <span className="label-sm">Spectrum</span>
        <span
          aria-hidden
          className={`ml-auto size-1.5 rounded-full transition-colors duration-500 ${
            live ? "bg-m3-primary" : "bg-white/20"
          }`}
        />
      </div>
      <div className="mt-0.5 min-h-0 flex-1 px-1 pb-1">
        <canvas ref={canvasRef} className="block size-full" />
      </div>
    </section>
  );
}
