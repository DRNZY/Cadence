/**
 * Universal audio bitrate and metadata formatters.
 */

export function formatBitrate(bitrate?: number): string {
  if (!bitrate || bitrate <= 0 || isNaN(bitrate)) {
    return "Lossless";
  }
  // If bitrate is in bps (> 10000), convert to kbps
  const kbps = bitrate > 10000 ? Math.round(bitrate / 1000) : Math.round(bitrate);
  return `${kbps} kbps`;
}

export function formatSeconds(sec: number): string {
  if (isNaN(sec) || sec < 0) return "0:00";
  const mins = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${mins}:${s.toString().padStart(2, "0")}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes <= 0 || isNaN(bytes)) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}
