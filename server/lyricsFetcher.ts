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

const CACHE_DIR = path.join(os.homedir(), ".cache/cadence/lyrics");
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
    .replace(/\.(mp3|flac|wav|m4a|ogg|opus|aac|wma)$/i, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\{.*?\}/g, "")
    .replace(/\b(official|audio|video|lyrics|hd|4k|remastered|remaster|live|mono|stereo)\b/gi, "")
    .replace(/feat\..*/i, "")
    .replace(/ft\..*/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchLyricsOvh(artist: string, title: string): Promise<string | null> {
  try {
    const cleanArt = cleanQueryString(artist);
    const cleanTit = cleanQueryString(title);
    if (!cleanArt || !cleanTit) return null;

    const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArt)}/${encodeURIComponent(cleanTit)}`, {
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data: any = await res.json();
      if (data && data.lyrics && typeof data.lyrics === "string") {
        return data.lyrics.trim();
      }
    }
  } catch {}
  return null;
}

export async function fetchOnlineLyrics(
  artist: string,
  title: string,
  album?: string,
  duration?: number
): Promise<{ synced: boolean; lrc: string; plain?: string; provider?: string } | null> {
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
      headers: { "User-Agent": "Cadence-AudioPlayer/1.0.0 (https://github.com/DRNZY/Cadence)" },
      signal: AbortSignal.timeout(5000)
    });

    if (getRes.ok) {
      const data = await getRes.json();
      if (data.syncedLyrics) {
        return { synced: true, lrc: data.syncedLyrics, provider: "LRCLIB (Synced)" };
      }
      if (data.plainLyrics) {
        return { synced: false, lrc: "", plain: data.plainLyrics, provider: "LRCLIB (Plain)" };
      }
    }
  } catch (e) {
    console.warn("[Lyrics] LRCLIB get error:", e);
  }

  // 2. Fallback to LRCLIB search endpoint (artist + title)
  try {
    const query = `${cleanArtist} ${cleanTitle}`.trim();
    const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Cadence-AudioPlayer/1.0.0 (https://github.com/DRNZY/Cadence)" },
      signal: AbortSignal.timeout(5000)
    });

    if (searchRes.ok) {
      const results = await searchRes.json();
      if (Array.isArray(results) && results.length > 0) {
        // Prioritize synced lyrics
        const syncedItem = results.find((r: any) => r.syncedLyrics);
        if (syncedItem) {
          return { synced: true, lrc: syncedItem.syncedLyrics, provider: "LRCLIB (Search Synced)" };
        }
        const plainItem = results.find((r: any) => r.plainLyrics);
        if (plainItem) {
          return { synced: false, lrc: "", plain: plainItem.plainLyrics, provider: "LRCLIB (Search Plain)" };
        }
      }
    }
  } catch (e) {
    console.warn("[Lyrics] LRCLIB search error:", e);
  }

  // 3. Fallback to LRCLIB search with just title if artist failed or was unknown
  if (cleanTitle.length > 3) {
    try {
      const titleRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`, {
        headers: { "User-Agent": "Cadence-AudioPlayer/1.0.0 (https://github.com/DRNZY/Cadence)" },
        signal: AbortSignal.timeout(4000)
      });
      if (titleRes.ok) {
        const results = await titleRes.json();
        if (Array.isArray(results) && results.length > 0) {
          const syncedItem = results.find((r: any) => r.syncedLyrics);
          if (syncedItem) {
            return { synced: true, lrc: syncedItem.syncedLyrics, provider: "LRCLIB (Title Match)" };
          }
          const plainItem = results.find((r: any) => r.plainLyrics);
          if (plainItem) {
            return { synced: false, lrc: "", plain: plainItem.plainLyrics, provider: "LRCLIB (Title Plain)" };
          }
        }
      }
    } catch {}
  }

  // 4. Fallback to lyrics.ovh (Plain text lyrics, zero API keys required)
  if (cleanArtist && cleanTitle) {
    const ovhText = await fetchLyricsOvh(cleanArtist, cleanTitle);
    if (ovhText) {
      return { synced: false, lrc: "", plain: ovhText, provider: "Lyrics.ovh" };
    }
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
          provider: online.provider || "LRCLIB",
          lines: parseLrc(online.lrc)
        };
      }

      if (online.plain) {
        const rawLines = online.plain.split(/\r?\n/).filter(l => l.trim().length > 0);
        return {
          synced: false,
          source: "online",
          provider: online.provider || "LRCLIB",
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
