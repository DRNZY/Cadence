import type { Track } from "../types";

export const fmtTime = (sec: number): string => {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};

export const fmtQuality = (t: Track): string => {
  const codec = t.codec.toUpperCase();
  if (t.bitDepth && t.sampleRateHz) return `${codec} · ${t.bitDepth}-bit · ${(t.sampleRateHz / 1000).toFixed(t.sampleRateHz % 1000 === 0 ? 0 : 1)} kHz`;
  if (t.sampleRateHz) return `${codec} · ${(t.sampleRateHz / 1000).toFixed(0)} kHz`;
  if (t.bitrateKbps) return `${codec} · ${Math.round(t.bitrateKbps)} kbps`;
  return codec;
};

export const fmtFileMeta = (t: Track): string =>
  [t.container.toUpperCase(), t.lossless ? "Lossless" : `${Math.round(t.bitrateKbps ?? 0)} kbps`].join(" · ");
