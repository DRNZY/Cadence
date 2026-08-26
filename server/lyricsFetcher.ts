import fs from "fs";
import path from "path";
import os from "os";

export interface LyricLine {
  time: number;
  text: string;
}

export interface LyricsResponse {
  synced: boolean;
  source: "local" | "online" | "cache" | "none";
  provider?: string;
  lines: LyricLine[];
}

const CACHE_DIR = path.join(os.homedir(), ".cache/auradeck/lyrics");
if (!fs.existsSync(CACHE_DIR)) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {}
}

export function parseLrc(content: string): LyricLine[] {
  const lines = content.split(/\r?\n/);
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  for (const line of lines) {
    const text = line.replace(timeRegex, "").trim();
    if (!text) continue;

    timeRegex.lastIndex = 0;
    let match;
    while ((match = timeRegex.exec(line)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const milliseconds = match[3] ? parseInt(match[3].padEnd(3, "0").slice(0, 3), 10) : 0;
      const totalSeconds = minutes * 60 + seconds + milliseconds / 1000;
      result.push({ time: totalSeconds, text });
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

function getCacheKey(artist: string, title: string): string {
  const clean = `${artist}_${title}`.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  return path.join(CACHE_DIR, `${clean}.lrc`);
}

function cleanQueryString(str: string): string {
  return str
    .replace(/\(.*?\)/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/feat\..*/i, "")
    .replace(/ft\..*/i, "")
    .trim();
}

export async function fetchOnlineLyrics(
  artist: string,
  title: string,
  album?: string,
  duration?: number
): Promise<{ synced: boolean; lrc: string; plain?: string } | null> {
  const cleanArtist = cleanQueryString(artist || "");
  const cleanTitle = cleanQueryString(title || "");

  if (!cleanTitle) return null;

  // 1. Try exact match via LRCLIB get endpoint
  try {
    const params = new URLSearchParams();
    if (cleanArtist) params.set("artist_name", cleanArtist);
    params.set("track_name", cleanTitle);
    if (album) params.set("album_name", album);
    if (duration && duration > 0) params.set("duration", Math.round(duration).toString());

    const getRes = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { "User-Agent": "AuraDeck-AudioPlayer/1.0.0 (https://github.com/DRNZY/Auradeck)" }
    });

    if (getRes.ok) {
      const data = await getRes.json();
      if (data.syncedLyrics) {
        return { synced: true, lrc: data.syncedLyrics };
      }
      if (data.plainLyrics) {
        return { synced: false, lrc: "", plain: data.plainLyrics };
      }
    }
  } catch (e) {
    console.warn("[Lyrics] LRCLIB get error:", e);
  }

  // 2. Fallback to LRCLIB search endpoint
  try {
    const query = `${cleanArtist} ${cleanTitle}`.trim();
    const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "AuraDeck-AudioPlayer/1.0.0 (https://github.com/DRNZY/Auradeck)" }
    });

    if (searchRes.ok) {
      const results = await searchRes.json();
      if (Array.isArray(results) && results.length > 0) {
        // Prioritize synced lyrics
        const syncedItem = results.find((r: any) => r.syncedLyrics);
        if (syncedItem) {
          return { synced: true, lrc: syncedItem.syncedLyrics };
        }
        const plainItem = results.find((r: any) => r.plainLyrics);
        if (plainItem) {
          return { synced: false, lrc: "", plain: plainItem.plainLyrics };
        }
      }
    }
  } catch (e) {
    console.warn("[Lyrics] LRCLIB search error:", e);
  }

  return null;
}

export async function getLyricsForTrack(
  filePath: string,
  artist: string,
  title: string,
  album?: string,
  duration?: number
): Promise<LyricsResponse> {
  // 1. Check local file next to music track
  if (filePath && fs.existsSync(filePath)) {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, path.extname(filePath));
    const lrcPath = path.join(dir, `${base}.lrc`);
    const txtPath = path.join(dir, `${base}.txt`);

    if (fs.existsSync(lrcPath)) {
      try {
        const content = fs.readFileSync(lrcPath, "utf-8");
        return {
          synced: true,
          source: "local",
          lines: parseLrc(content)
        };
      } catch {}
    }

    if (fs.existsSync(txtPath)) {
      try {
        const content = fs.readFileSync(txtPath, "utf-8");
        const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
        return {
          synced: false,
          source: "local",
          lines: lines.map((text, idx) => ({ time: idx * 4, text }))
        };
      } catch {}
    }
  }

  // 2. Check local disk cache
  const cacheFile = getCacheKey(artist, title);
  if (fs.existsSync(cacheFile)) {
    try {
      const content = fs.readFileSync(cacheFile, "utf-8");
      return {
        synced: true,
        source: "cache",
        provider: "LRCLIB",
        lines: parseLrc(content)
      };
    } catch {}
  }

  // 3. Fetch from Online LRCLIB API
  if (title) {
    const online = await fetchOnlineLyrics(artist, title, album, duration);
    if (online) {
      if (online.synced && online.lrc) {
        // Cache to disk
        try {
          fs.writeFileSync(cacheFile, online.lrc, "utf-8");
        } catch {}

        return {
          synced: true,
          source: "online",
          provider: "LRCLIB",
          lines: parseLrc(online.lrc)
        };
      }

      if (online.plain) {
        const rawLines = online.plain.split(/\r?\n/).filter(l => l.trim().length > 0);
        return {
          synced: false,
          source: "online",
          provider: "LRCLIB",
          lines: rawLines.map((text, idx) => ({ time: idx * 4, text }))
        };
      }
    }
  }

  return {
    synced: false,
    source: "none",
    lines: []
  };
}
