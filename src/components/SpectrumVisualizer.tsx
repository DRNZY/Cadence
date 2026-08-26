import React, { useRef, useEffect } from "react";
import { VisualizerMode } from "../types";
import { Activity, Radio, Waves, Zap } from "lucide-react";

interface SpectrumVisualizerProps {
  isPlaying: boolean;
  visualizerMode: VisualizerMode;
  onSetVisualizerMode: (mode: VisualizerMode) => void;
  getFrequencyData: () => Uint8Array;
  getTimeDomainData: () => Uint8Array;
}

export const SpectrumVisualizer: React.FC<SpectrumVisualizerProps> = React.memo(({
  isPlaying,
  visualizerMode,
  onSetVisualizerMode,
  getFrequencyData,
  getTimeDomainData
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const peaks: number[] = new Array(48).fill(0);
    let lastRenderTime = performance.now();

    // Render static idle state when paused to avoid 144 FPS CPU/GPU battery drain
    const renderIdle = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    };

    if (!isPlaying) {
      renderIdle();
      return;
    }

    // Cached gradient to avoid GC allocation on every frame
    const barGrad = ctx.createLinearGradient(0, height, 0, 0);
    barGrad.addColorStop(0, "rgba(192, 132, 252, 0.3)");
    barGrad.addColorStop(0.6, "rgba(192, 132, 252, 0.85)");
    barGrad.addColorStop(1, "rgba(96, 165, 250, 0.95)");

    const render = (now: number) => {
      // Throttle to 60 FPS max
      if (now - lastRenderTime < 16) {
        animId = requestAnimationFrame(render);
        return;
      }
      lastRenderTime = now;

      ctx.clearRect(0, 0, width, height);

      if (visualizerMode === "bars") {
        const freqData = getFrequencyData();
        const numBars = 40;
        const barWidth = (width / numBars) * 0.7;
        const gap = (width / numBars) * 0.3;

        for (let i = 0; i < numBars; i++) {
          const val = freqData[i * 2] || 0;
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
          ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
          ctx.fillRect(x, peakY, barWidth, 1.5);
        }
      } else if (visualizerMode === "wave") {
        const timeData = getTimeDomainData();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(192, 132, 252, 0.9)";

        ctx.beginPath();
        const sliceWidth = width / (timeData.length || 128);
        let x = 0;

        for (let i = 0; i < timeData.length; i++) {
          const v = timeData[i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }
        ctx.stroke();
      } else if (visualizerMode === "oscilloscope") {
        const timeData = getTimeDomainData();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(52, 211, 153, 0.9)";

        ctx.beginPath();
        const step = Math.max(1, Math.floor(timeData.length / width));
        for (let i = 0; i < width; i++) {
          const val = timeData[i * step] || 128;
          const y = (val / 255) * height;
          if (i === 0) ctx.moveTo(i, y);
          else ctx.lineTo(i, y);
        }
        ctx.stroke();
      } else if (visualizerMode === "radial") {
        const freqData = getFrequencyData();
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.28;
        const bars = 48;

        for (let i = 0; i < bars; i++) {
          const rad = (i * 2 * Math.PI) / bars;
          const val = freqData[i * 2] || 0;
          const barLen = (val / 255) * 30 + 3;

          const x1 = centerX + Math.cos(rad) * radius;
          const y1 = centerY + Math.sin(rad) * radius;
          const x2 = centerX + Math.cos(rad) * (radius + barLen);
          const y2 = centerY + Math.sin(rad) * (radius + barLen);

          ctx.strokeStyle = `hsl(${(i * 360) / bars}, 80%, 65%)`;
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
  }, [isPlaying, visualizerMode, getFrequencyData, getTimeDomainData]);

  return (
    <div className="flex flex-col h-full w-full p-4 select-none relative">
      {/* Header with Visualizer Mode Toggles */}
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-primary" />
          <span className="text-xs uppercase tracking-wider font-semibold text-neutral-300">
            Spectrum
          </span>
        </div>

        <div className="flex bg-black/40 p-0.5 rounded-full border border-white/10">
          <button
            onClick={() => onSetVisualizerMode("bars")}
            className={`p-1.5 rounded-full transition-all ${
              visualizerMode === "bars" ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white"
            }`}
            title="Bars"
          >
            <Radio className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSetVisualizerMode("wave")}
            className={`p-1.5 rounded-full transition-all ${
              visualizerMode === "wave" ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white"
            }`}
            title="Wave"
          >
            <Waves className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSetVisualizerMode("radial")}
            className={`p-1.5 rounded-full transition-all ${
              visualizerMode === "radial" ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white"
            }`}
            title="Radial"
          >
            <Zap className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSetVisualizerMode("oscilloscope")}
            className={`p-1.5 rounded-full transition-all ${
              visualizerMode === "oscilloscope" ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white"
            }`}
            title="Oscilloscope"
          >
            <Activity className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 flex items-center justify-center pt-2 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          width={320}
          height={120}
          className="w-full h-full object-contain rounded-xl"
        />
      </div>
    </div>
  );
});
