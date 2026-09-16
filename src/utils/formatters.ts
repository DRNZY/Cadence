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

export function getTrackCoverUrl(
  track?: { coverPath?: string; artist?: string; album?: string; title?: string } | null,
  accent?: string
): string {
  if (!track) {
    return `/covers${accent ? `?accent=${encodeURIComponent(accent)}` : ""}`;
  }
  if (track.coverPath) {
    return `/covers?path=${encodeURIComponent(track.coverPath)}`;
  }
  const params = new URLSearchParams();
  if (track.artist) params.set("artist", track.artist);
  if (track.album) params.set("album", track.album);
  if (track.title) params.set("title", track.title);
  if (accent) params.set("accent", accent);

  const qs = params.toString();
  return qs ? `/covers?${qs}` : `/covers`;
}

