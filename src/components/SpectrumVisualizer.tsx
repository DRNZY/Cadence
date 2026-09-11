import React, { useRef, useEffect, useState } from "react";
import { VisualizerMode } from "../types";
import { Activity, Radio, Waves, Zap } from "lucide-react";

interface SpectrumVisualizerProps {
  isPlaying: boolean;
  visualizerMode: VisualizerMode;
  onSetVisualizerMode: (mode: VisualizerMode) => void;
  getFrequencyData: () => Uint8Array;
  getTimeDomainData: () => Uint8Array;
  accentColor?: string;
  hideHeader?: boolean;
}

export const SpectrumVisualizer: React.FC<SpectrumVisualizerProps> = React.memo(({
  isPlaying,
  visualizerMode,
  onSetVisualizerMode,
  getFrequencyData,
  getTimeDomainData,
  accentColor,
  hideHeader = false
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 360, height: 140 });

  // Dynamically observe real container dimensions for true HiDPI rendering
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setSize(prev => {
            const w = Math.round(width);
            const h = Math.round(height);
            if (Math.abs(prev.width - w) > 2 || Math.abs(prev.height - h) > 2) {
              return { width: w, height: h };
            }
            return prev;
          });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const displayWidth = size.width;
    const displayHeight = size.height;

    canvas.width = Math.round(displayWidth * dpr);
    canvas.height = Math.round(displayHeight * dpr);

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const width = displayWidth;
    const height = displayHeight;
    const peaks: number[] = new Array(128).fill(0);
    let lastRenderTime = performance.now();

    // Helper to get active theme accent color
    const getActiveColor = () => {
      if (accentColor && accentColor.startsWith("#")) return accentColor;
      try {
        const cssVal = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
        if (cssVal) return cssVal;
      } catch {}
      return "#38bdf8";
    };

    const render = (now: number) => {
      // Throttle to 60 FPS max
      if (now - lastRenderTime < 16) {
        animId = requestAnimationFrame(render);
        return;
      }
      lastRenderTime = now;

      ctx.clearRect(0, 0, width, height);
      const activeColor = getActiveColor();

      // Dynamic Gradient derived from active theme accent
      const barGrad = ctx.createLinearGradient(0, height, 0, 0);
      barGrad.addColorStop(0, "rgba(255, 255, 255, 0.05)");
      barGrad.addColorStop(0.5, activeColor.includes("rgb") ? activeColor.replace("rgb", "rgba").replace(")", ", 0.75)") : `${activeColor}aa`);
      barGrad.addColorStop(1, activeColor);

      if (visualizerMode === "bars") {
        const freqData = getFrequencyData() || new Uint8Array(128);
        const numBars = Math.min(64, Math.max(28, Math.floor(width / 11)));
        const barWidth = (width / numBars) * 0.68;
        const gap = (width / numBars) * 0.32;

        for (let i = 0; i < numBars; i++) {
          const freqIndex = Math.floor((i / numBars) * (freqData.length * 0.85));
          let val = freqData[freqIndex] || 0;
          if (!isPlaying) {
            val = Math.max(3, Math.round((Math.sin(now * 0.002 + i * 0.22) * 0.5 + 0.5) * 25));
          }
          const barHeight = Math.max(3, (val / 255) * (height - 10));
          const x = i * (barWidth + gap) + gap / 2;
          const y = height - barHeight;

          // Peak drop physics
          if (val > (peaks[i] || 0)) {
            peaks[i] = val;
          } else {
            peaks[i] = Math.max(0, (peaks[i] || 0) - 3.5);
          }

          ctx.fillStyle = barGrad;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
          ctx.fill();

          // Peak cap indicator
          const peakY = height - Math.max(3, ((peaks[i] || 0) / 255) * (height - 10)) - 2;
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
          ctx.fillRect(x, peakY, barWidth, 1.5);
        }
      } else if (visualizerMode === "wave") {
        const timeData = getTimeDomainData() || new Uint8Array(128);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = activeColor;
        ctx.shadowColor = activeColor;
        ctx.shadowBlur = 8;

        ctx.beginPath();
        const sliceWidth = width / Math.max(1, timeData.length);
        let x = 0;

        for (let i = 0; i < timeData.length; i++) {
          let v = (timeData[i] || 128) / 128.0;
          if (!isPlaying) {
            v = 1.0 + Math.sin(now * 0.0025 + i * 0.12) * 0.08;
          }
          const y = (v * height) / 2;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (visualizerMode === "oscilloscope") {
        const timeData = getTimeDomainData() || new Uint8Array(128);
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = activeColor;
        ctx.shadowColor = activeColor;
        ctx.shadowBlur = 6;

        ctx.beginPath();
        const step = Math.max(1, Math.floor(timeData.length / width));
        for (let i = 0; i < width; i++) {
          let val = timeData[i * step] || 128;
          if (!isPlaying) {
            val = 128 + Math.round(Math.sin(now * 0.003 + i * 0.035) * 14);
          }
          const y = (val / 255) * height;
          if (i === 0) ctx.moveTo(i, y);
          else ctx.lineTo(i, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (visualizerMode === "radial") {
        const freqData = getFrequencyData() || new Uint8Array(128);
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.28;
        const bars = 54;

        for (let i = 0; i < bars; i++) {
          const rad = (i * 2 * Math.PI) / bars;
          const freqIndex = Math.floor((i / bars) * (freqData.length * 0.8));
          let val = freqData[freqIndex] || 0;
          if (!isPlaying) {
            val = Math.round((Math.sin(now * 0.002 + i * 0.25) * 0.5 + 0.5) * 20);
          }
          const barLen = (val / 255) * (Math.min(width, height) * 0.2) + 3;

          const x1 = centerX + Math.cos(rad) * radius;
          const y1 = centerY + Math.sin(rad) * radius;
          const x2 = centerX + Math.cos(rad) * (radius + barLen);
          const y2 = centerY + Math.sin(rad) * (radius + barLen);

          ctx.strokeStyle = activeColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, visualizerMode, getFrequencyData, getTimeDomainData, accentColor, size]);

  return (
    <div className={`flex flex-col h-full w-full select-none relative ${hideHeader ? "p-2" : "p-3.5"}`}>
      {/* Header with Visualizer Mode Toggles (if not hidden by parent widget) */}
      {!hideHeader && (
        <div className="flex items-center justify-between pb-2 border-b border-white/5 shrink-0">
          <div className="flex items-center space-x-2">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs uppercase tracking-wider font-semibold text-neutral-300">
              Spectrum
            </span>
          </div>

          <div className="flex bg-black/40 p-0.5 rounded-full border border-white/10">
            {([
              { id: "bars", icon: <Radio className="w-3 h-3" />, title: "Bars" },
              { id: "wave", icon: <Waves className="w-3 h-3" />, title: "Wave" },
              { id: "radial", icon: <Zap className="w-3 h-3" />, title: "Radial" },
              { id: "oscilloscope", icon: <Activity className="w-3 h-3" />, title: "Oscilloscope" }
            ] as const).map(m => (
              <button
                key={m.id}
                onClick={() => onSetVisualizerMode(m.id)}
                className={`p-1.5 rounded-full transition-all active:scale-90 ${
                  visualizerMode === m.id ? "bg-white/20 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                }`}
                title={m.title}
              >
                {m.icon}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Canvas Area with dynamic HiDPI sizing */}
      <div 
        ref={containerRef}
        className={`flex-1 w-full h-full relative overflow-hidden min-h-0 ${hideHeader ? "pt-0" : "pt-2"}`}
      >
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%" }}
          className="rounded-xl block"
        />
      </div>
    </div>
  );
});
