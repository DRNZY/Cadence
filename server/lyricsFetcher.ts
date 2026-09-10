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
  isInstrumental?: boolean;
  lines: LyricLine[];
}

export interface LyricsCandidate {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental: boolean;
  synced: boolean;
  score: number;
  syncedLyrics?: string;
  plainLyrics?: string;
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

export function getCacheKey(artist: string, title: string): string {
  const clean = `${artist}_${title}`.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  return path.join(CACHE_DIR, `${clean}.lrc`);
}

export function normalizeString(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanTrackTitle(title: string): string {
  let t = title || "";
  t = t.replace(/\.(mp3|flac|wav|m4a|ogg|opus|aac|wma)$/i, "");
  t = t.replace(/^[\d\s.\-_]+/, "");
  t = t.replace(/\[(official|audio|video|lyrics|hd|4k|remastered|remaster|live|mono|stereo|flac|24bit|explicit|clean|prod\..*?)\]/gi, "");
  t = t.replace(/\((official|audio|video|lyrics|hd|4k|remastered|remaster|live|mono|stereo|flac|24bit|explicit|clean|prod\..*?)\)/gi, "");
  t = t.replace(/[\(\[]?(?:feat\.?|ft\.?|featuring|with)\s+[^)\]]+[\)\]]?/gi, "");
  t = t.replace(/\((?:album|single|radio)\s+version\)/gi, "");
  return t.replace(/\s+/g, " ").trim();
}

export function cleanArtistName(artist: string): string {
  let a = artist || "";
  a = a.replace(/[\(\[]?(?:feat\.?|ft\.?|featuring|with)\s+[^)\]]+[\)\]]?/gi, "");
  return a.replace(/\s+/g, " ").trim();
}

export function calculateMatchScore(
  qArtist: string,
  qTitle: string,
  qDuration: number | undefined,
  cArtist: string,
  cTitle: string,
  cDuration: number | undefined
): number {
  const normQArtist = normalizeString(cleanArtistName(qArtist));
  const normQTitle = normalizeString(cleanTrackTitle(qTitle));
  const normCArtist = normalizeString(cArtist);
  const normCTitle = normalizeString(cTitle);

  if (!normQTitle || !normCTitle) return 0;

  // 1. Title similarity score
  let titleScore = 0;
  if (normQTitle === normCTitle) {
    titleScore = 1.0;
  } else if (normQTitle.includes(normCTitle) || normCTitle.includes(normQTitle)) {
    titleScore = Math.min(normQTitle.length, normCTitle.length) / Math.max(normQTitle.length, normCTitle.length);
  } else {
    const wordsQ = new Set(normQTitle.split(" ").filter(w => w.length > 1));
    const wordsC = new Set(normCTitle.split(" ").filter(w => w.length > 1));
    if (wordsQ.size > 0 && wordsC.size > 0) {
      let intersection = 0;
      for (const w of wordsQ) {
        if (wordsC.has(w)) intersection++;
      }
      titleScore = (2 * intersection) / (wordsQ.size + wordsC.size);
    }
  }

  // 2. Artist similarity score
  let artistScore = 0.5;
  if (normQArtist) {
    if (normQArtist === normCArtist) {
      artistScore = 1.0;
    } else if (normQArtist.includes(normCArtist) || normCArtist.includes(normQArtist)) {
      artistScore = Math.min(normQArtist.length, normCArtist.length) / Math.max(normQArtist.length, normCArtist.length);
    } else {
      const wordsQA = new Set(normQArtist.split(" ").filter(w => w.length > 1));
      const wordsCA = new Set(normCArtist.split(" ").filter(w => w.length > 1));
      if (wordsQA.size > 0 && wordsCA.size > 0) {
        let intersection = 0;
        for (const w of wordsQA) {
          if (wordsCA.has(w)) intersection++;
        }
        artistScore = (2 * intersection) / (wordsQA.size + wordsCA.size);
      } else {
        artistScore = 0;
      }
    }

    // STRICT ARTIST FILTER: Discard any candidate with zero artist relation
    if (artistScore < 0.25) {
      return 0;
    }
  }

  // 3. Duration comparison
  let durationFactor = 1.0;
  if (qDuration && qDuration > 0 && cDuration && cDuration > 0) {
    const deltaSec = Math.abs(qDuration - cDuration);
    if (deltaSec <= 3) {
      durationFactor = 1.1;
    } else if (deltaSec <= 10) {
      durationFactor = 1.0;
    } else if (deltaSec <= 25) {
      durationFactor = 0.8;
    } else if (deltaSec <= 60) {
      durationFactor = 0.5;
    } else {
      durationFactor = 0.2;
    }
  }

  const baseScore = normQArtist ? (titleScore * 0.55 + artistScore * 0.45) : titleScore;
  return baseScore * durationFactor;
}

async function fetchLyricsOvh(artist: string, title: string): Promise<string | null> {
  try {
    const cleanArt = cleanArtistName(artist);
    const cleanTit = cleanTrackTitle(title);
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
): Promise<{ synced: boolean; lrc: string; plain?: string; provider?: string; isInstrumental?: boolean } | null> {
  const cleanArtist = cleanArtistName(artist || "");
  const cleanTitle = cleanTrackTitle(title || "");

  if (!cleanTitle) return null;

  // 1. Try exact match via LRCLIB get endpoint
  try {
    const params = new URLSearchParams();
    if (cleanArtist) params.set("artist_name", cleanArtist);
    params.set("track_name", cleanTitle);
    if (album) params.set("album_name", album);
    if (duration && duration > 0) params.set("duration", Math.round(duration).toString());

    const getRes = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { "User-Agent": "Cadence-AudioPlayer/2.2.0 (https://github.com/DRNZY/Cadence)" },
      signal: AbortSignal.timeout(5000)
    });

    if (getRes.ok) {
      const data = await getRes.json();
      if (data.instrumental) {
        return { synced: false, lrc: "", isInstrumental: true, provider: "LRCLIB (Instrumental)" };
      }
      if (data.syncedLyrics) {
        return { synced: true, lrc: data.syncedLyrics, provider: "LRCLIB (Exact Synced)" };
      }
      if (data.plainLyrics) {
        return { synced: false, lrc: "", plain: data.plainLyrics, provider: "LRCLIB (Exact Plain)" };
      }
    }
  } catch (e) {
    console.warn("[Lyrics] LRCLIB exact get error:", e);
  }

  // 2. Try LRCLIB get endpoint with only track_name & artist_name (ignoring album / duration constraints)
  if (cleanArtist && album) {
    try {
      const params = new URLSearchParams({
        artist_name: cleanArtist,
        track_name: cleanTitle
      });
      const getRes = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
        headers: { "User-Agent": "Cadence-AudioPlayer/2.2.0 (https://github.com/DRNZY/Cadence)" },
        signal: AbortSignal.timeout(4000)
      });
      if (getRes.ok) {
        const data = await getRes.json();
        if (data.instrumental) {
          return { synced: false, lrc: "", isInstrumental: true, provider: "LRCLIB (Instrumental)" };
        }
        if (data.syncedLyrics) {
          return { synced: true, lrc: data.syncedLyrics, provider: "LRCLIB (Synced)" };
        }
        if (data.plainLyrics) {
          return { synced: false, lrc: "", plain: data.plainLyrics, provider: "LRCLIB (Plain)" };
        }
      }
    } catch {}
  }

  // 3. Intelligent Multi-Candidate Search with Strict Relevance Scoring
  try {
    const candidates = await searchLyricsCandidates(artist, title, duration);
    // Find best scoring candidate above 0.60 threshold
    const validCandidates = candidates.filter(c => c.score >= 0.60);

    if (validCandidates.length > 0) {
      // Prioritize synced lyrics candidate with highest score
      const syncedMatch = validCandidates.find(c => c.synced && c.syncedLyrics);
      if (syncedMatch) {
        return {
          synced: true,
          lrc: syncedMatch.syncedLyrics!,
          provider: `LRCLIB (${syncedMatch.trackName} by ${syncedMatch.artistName})`
        };
      }

      // If top candidate is flagged instrumental
      if (validCandidates[0].instrumental) {
        return {
          synced: false,
          lrc: "",
          isInstrumental: true,
          provider: "LRCLIB (Instrumental)"
        };
      }

      // Fallback to plain lyrics candidate
      const plainMatch = validCandidates.find(c => c.plainLyrics);
      if (plainMatch) {
        return {
          synced: false,
          lrc: "",
          plain: plainMatch.plainLyrics!,
          provider: `LRCLIB (${plainMatch.trackName} by ${plainMatch.artistName})`
        };
      }
    }
  } catch (e) {
    console.warn("[Lyrics] Scored search error:", e);
  }

  // 4. Fallback to Lyrics.ovh with strict validation
  if (cleanArtist && cleanTitle) {
    const ovhText = await fetchLyricsOvh(cleanArtist, cleanTitle);
    if (ovhText) {
      return { synced: false, lrc: "", plain: ovhText, provider: "Lyrics.ovh" };
    }
  }

  return null;
}

export async function searchLyricsCandidates(
  artist: string,
  title: string,
  duration?: number
): Promise<LyricsCandidate[]> {
  const cleanA = cleanArtistName(artist);
  const cleanT = cleanTrackTitle(title);
  const query = `${cleanA} ${cleanT}`.trim();
  if (!query) return [];

  const candidates: LyricsCandidate[] = [];

  try {
    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Cadence-AudioPlayer/2.2.0 (https://github.com/DRNZY/Cadence)" },
      signal: AbortSignal.timeout(5000)
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        for (const item of data) {
          const score = calculateMatchScore(
            artist,
            title,
            duration,
            item.artistName || "",
            item.trackName || item.name || "",
            item.duration
          );
          candidates.push({
            id: item.id,
            trackName: item.trackName || item.name || "",
            artistName: item.artistName || "",
            albumName: item.albumName,
            duration: item.duration,
            instrumental: !!item.instrumental,
            synced: !!item.syncedLyrics,
            score,
            syncedLyrics: item.syncedLyrics || undefined,
            plainLyrics: item.plainLyrics || undefined
          });
        }
      }
    }
  } catch (err) {
    console.warn("[Lyrics] Search candidates failed:", err);
  }

  // Sort candidates by match score descending
  return candidates.sort((a, b) => b.score - a.score);
}

export async function getLyricsForTrack(
  filePath: string,
  artist: string,
  title: string,
  album?: string,
  duration?: number,
  forceRefresh: boolean = false
): Promise<LyricsResponse> {
  // 1. Check local file next to music track (always takes precedence)
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

  const cacheFile = getCacheKey(artist, title);

  // If forceRefresh is requested, remove old cached file
  if (forceRefresh && fs.existsSync(cacheFile)) {
    try {
      fs.unlinkSync(cacheFile);
    } catch {}
  }

  // 2. Check local disk cache (unless forceRefresh)
  if (!forceRefresh && fs.existsSync(cacheFile)) {
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

  // 3. Fetch from Online APIs with Strict Relevance Scoring
  if (title) {
    const online = await fetchOnlineLyrics(artist, title, album, duration);
    if (online) {
      if (online.isInstrumental) {
        return {
          synced: false,
          source: "online",
          provider: online.provider || "Instrumental Track",
          isInstrumental: true,
          lines: []
        };
      }

      if (online.synced && online.lrc) {
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
