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

export const SpectrumVisualizer: React.FC<SpectrumVisualizerProps> = ({
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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const peaks: number[] = new Array(64).fill(0);

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      if (visualizerMode === "bars") {
        const freqData = getFrequencyData();
        const numBars = 48;
        const barWidth = (width / numBars) * 0.7;
        const gap = (width / numBars) * 0.3;

        for (let i = 0; i < numBars; i++) {
          const val = isPlaying && freqData.length > 0 ? freqData[i * 2] || 0 : (Math.sin(Date.now() / 300 + i * 0.2) + 1) * 10;
          const barHeight = Math.max(3, (val / 255) * (height - 12));
          const x = i * (barWidth + gap) + gap / 2;
          const y = height - barHeight;

          // Peak drop physics
          if (val > (peaks[i] || 0)) {
            peaks[i] = val;
          } else {
            peaks[i] = Math.max(0, (peaks[i] || 0) - 2.5);
          }

          // Gradient for bar
          const grad = ctx.createLinearGradient(0, height, 0, 0);
          grad.addColorStop(0, "rgba(192, 132, 252, 0.4)");
          grad.addColorStop(0.6, "rgba(192, 132, 252, 0.85)");
          grad.addColorStop(1, "rgba(96, 165, 250, 1)");

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
          ctx.fill();

          // Peak cap indicator
          const peakY = height - Math.max(3, ((peaks[i] || 0) / 255) * (height - 12)) - 3;
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
          ctx.fillRect(x, peakY, barWidth, 2);
        }
      } else if (visualizerMode === "wave") {
        const timeData = getTimeDomainData();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "rgba(192, 132, 252, 0.95)";
        ctx.shadowBlur = 10;
        ctx.shadowColor = "rgba(192, 132, 252, 0.6)";

        ctx.beginPath();
        const sliceWidth = width / (timeData.length || 128);
        let x = 0;

        for (let i = 0; i < timeData.length; i++) {
          const v = isPlaying ? timeData[i] / 128.0 : 1.0 + Math.sin(Date.now() / 200 + i * 0.1) * 0.05;
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (visualizerMode === "oscilloscope") {
        const timeData = getTimeDomainData();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(52, 211, 153, 0.95)";
        ctx.shadowBlur = 8;
        ctx.shadowColor = "rgba(52, 211, 153, 0.8)";

        ctx.beginPath();
        const step = Math.max(1, Math.floor(timeData.length / width));
        for (let i = 0; i < width; i++) {
          const val = isPlaying && timeData.length > 0 ? timeData[i * step] : 128 + Math.sin(Date.now() / 150 + i * 0.05) * 8;
          const y = (val / 255) * height;
          if (i === 0) ctx.moveTo(i, y);
          else ctx.lineTo(i, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (visualizerMode === "radial") {
        const freqData = getFrequencyData();
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.28;
        const bars = 60;

        for (let i = 0; i < bars; i++) {
          const rad = (i * 2 * Math.PI) / bars;
          const val = isPlaying && freqData.length > 0 ? freqData[i * 2] || 0 : (Math.sin(Date.now() / 200 + i * 0.3) + 1) * 15;
          const barLen = (val / 255) * 35 + 4;

          const x1 = centerX + Math.cos(rad) * radius;
          const y1 = centerY + Math.sin(rad) * radius;
          const x2 = centerX + Math.cos(rad) * (radius + barLen);
          const y2 = centerY + Math.sin(rad) * (radius + barLen);

          ctx.strokeStyle = `hsl(${(i * 360) / bars}, 85%, 65%)`;
          ctx.lineWidth = 2.5;
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
            FFT Studio Spectrum
          </span>
        </div>

        <div className="flex bg-black/40 p-0.5 rounded-full border border-white/10">
          <button
            onClick={() => onSetVisualizerMode("bars")}
            className={`p-1.5 rounded-full transition-all ${
              visualizerMode === "bars" ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white"
            }`}
            title="Neon Spectrum Bars"
          >
            <Radio className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSetVisualizerMode("wave")}
            className={`p-1.5 rounded-full transition-all ${
              visualizerMode === "wave" ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white"
            }`}
            title="Fluid Harmonic Wave"
          >
            <Waves className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSetVisualizerMode("radial")}
            className={`p-1.5 rounded-full transition-all ${
              visualizerMode === "radial" ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white"
            }`}
            title="Radial Starburst"
          >
            <Zap className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSetVisualizerMode("oscilloscope")}
            className={`p-1.5 rounded-full transition-all ${
              visualizerMode === "oscilloscope" ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white"
            }`}
            title="Oscilloscope Beam"
          >
            <Activity className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 flex items-center justify-center pt-2 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          width={360}
          height={140}
          className="w-full h-full object-contain rounded-xl"
        />
      </div>
    </div>
  );
};
