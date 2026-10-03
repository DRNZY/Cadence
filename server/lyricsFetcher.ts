import fs from "fs";
import path from "path";
import os from "os";

export interface LyricWord {
  start: number;
  end?: number;
  text: string;
}

export interface LyricLine {
  time: number;
  text: string;
  words?: LyricWord[];
}

export type LyricsProvider = "lrclib";

export interface LyricsResponse {
  synced: boolean;
  source: "local" | "online" | "cache" | "none";
  provider?: string;
  isInstrumental?: boolean;
  hasWordSync?: boolean;
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
    // Owner-only. The parent cache dirs default to 0755, and lyrics files are
    // written later without an explicit mode, so without this the directory is
    // world-readable on a multi-user machine.
    fs.mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
  } catch {}
}

export function parseLrc(content: string): LyricLine[] {
  if (!content || typeof content !== "string") return [];
  const lines = content.split(/\r?\n/);
  const result: LyricLine[] = [];

  const timeTagRegex = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const angleTagRegex = /<(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?>/g;
  const metaTagRegex = /^\[(ti|ar|al|au|by|re|ve|tool|length|encoding):\s*(.*)\]$/i;
  const offsetTagRegex = /^\[offset:\s*([+-]?\d+)\]/i;

  let globalOffsetSec = 0;

  // First pass: scan for [offset: +/-ms]
  for (const raw of lines) {
    const trimmed = raw.trim();
    const offsetMatch = trimmed.match(offsetTagRegex);
    if (offsetMatch) {
      const ms = parseInt(offsetMatch[1], 10);
      if (!isNaN(ms)) {
        // Standard LRC: positive offset means lyrics play earlier (audio time = stamp - offset)
        globalOffsetSec = ms / 1000;
      }
    }
  }

  const parseTime = (minutesStr: string, secondsStr: string, fracRaw?: string): number => {
    const minutes = parseInt(minutesStr, 10);
    const seconds = parseInt(secondsStr, 10);
    let frac = 0;
    if (fracRaw) {
      const normalizedFrac = fracRaw.length >= 3 ? fracRaw.slice(0, 3) : fracRaw.padEnd(3, "0");
      frac = parseInt(normalizedFrac, 10) / 1000;
    }
    const rawTime = minutes * 60 + seconds + frac;
    // Apply offset shift safely
    return Math.max(0, rawTime - globalOffsetSec);
  };

  const stripAllTags = (s: string): string =>
    s
      .replace(timeTagRegex, "")
      .replace(angleTagRegex, "")
      .replace(/^\[[a-zA-Z]+:[^\]]*\]/g, "")
      .trim();

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Ignore metadata ID tags
    if (metaTagRegex.test(trimmed) || offsetTagRegex.test(trimmed)) {
      continue;
    }

    // Extract all leading timestamp tags (classic multi-stamp lines: [00:12.00][00:34.00] Line)
    const leadingTimestamps: number[] = [];
    let lineText = raw;
    
    // Check for leading square bracket timestamps
    const leadingMatchRegex = /^(?:\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\])+/;
    const leadMatch = lineText.match(leadingMatchRegex);
    
    if (leadMatch) {
      const tagBlock = leadMatch[0];
      lineText = lineText.slice(tagBlock.length).trim();
      
      const singleTagRegex = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
      let tm;
      while ((tm = singleTagRegex.exec(tagBlock)) !== null) {
        leadingTimestamps.push(parseTime(tm[1], tm[2], tm[3]));
      }
    }

    const cleanText = stripAllTags(lineText);
    if (!cleanText) continue;

    // If no timestamps on the line, treat as unsynced plain line only if no timestamps in overall file
    if (leadingTimestamps.length === 0) {
      // Check for inline angle bracket or embedded tags
      let inlineFound = false;
      angleTagRegex.lastIndex = 0;
      if (angleTagRegex.test(raw)) {
        inlineFound = true;
      }
      if (!inlineFound) {
        result.push({ time: 0, text: cleanText });
        continue;
      }
    }

    // Check for enhanced word-level / syllable-level tags (<00:12.34> or [00:12.34] inside text)
    const syllableTags: { time: number; index: number; end: number }[] = [];
    angleTagRegex.lastIndex = 0;
    let am;
    while ((am = angleTagRegex.exec(lineText)) !== null) {
      syllableTags.push({
        time: parseTime(am[1], am[2], am[3]),
        index: am.index,
        end: angleTagRegex.lastIndex
      });
    }

    let parsedWords: LyricWord[] | undefined = undefined;

    if (syllableTags.length > 0) {
      syllableTags.sort((a, b) => a.index - b.index);
      parsedWords = [];
      const baseStart = leadingTimestamps[0] ?? syllableTags[0].time;

      const firstChunk = stripAllTags(lineText.slice(0, syllableTags[0].index));
      if (firstChunk) {
        parsedWords.push({ start: baseStart, text: firstChunk });
      }

      for (let i = 0; i < syllableTags.length; i++) {
        const chunkStart = syllableTags[i].end;
        const chunkEnd = syllableTags[i + 1]?.index ?? lineText.length;
        const chunk = stripAllTags(lineText.slice(chunkStart, chunkEnd));
        if (chunk) {
          parsedWords.push({ start: syllableTags[i].time, text: chunk });
        }
      }

      if (parsedWords.length > 0) {
        for (let wi = 0; wi < parsedWords.length; wi++) {
          const nextWordStart = parsedWords[wi + 1]?.start;
          parsedWords[wi].end = nextWordStart ?? (parsedWords[wi].start + 0.6);
        }
      }
    }

    // For every leading timestamp (supports repeated chorus lines), add a LyricLine entry
    const timestampsToAdd = leadingTimestamps.length > 0 ? leadingTimestamps : [syllableTags[0]?.time ?? 0];
    for (const t of timestampsToAdd) {
      result.push({
        time: t,
        text: cleanText,
        words: parsedWords && parsedWords.length > 0 ? [...parsedWords] : undefined
      });
    }
  }

  // Filter out any duplicate 0-timestamp metadata leftovers if real timestamps exist
  const hasRealTimestamps = result.some(l => l.time > 0);
  const finalLines = hasRealTimestamps ? result.filter(l => l.text.length > 0) : result;

  return finalLines.sort((a, b) => a.time - b.time);
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

export async function fetchGeniusLyrics(artist: string, title: string): Promise<string | null> {
  try {
    const cleanArt = cleanArtistName(artist);
    const cleanTit = cleanTrackTitle(title);
    if (!cleanTit) return null;

    const query = `${cleanArt} ${cleanTit}`.trim();
    const searchUrl = `https://genius.com/api/search/multi?q=${encodeURIComponent(query)}`;
    const sRes = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(4500)
    });

    if (!sRes.ok) return null;
    const data: any = await sRes.json();
    const sections = data?.response?.sections || [];
    const songSection = sections.find((s: any) => s.type === "song" || s.type === "top_hit");
    const hits = songSection?.hits || [];
    if (hits.length === 0) return null;

    const normArt = normalizeString(cleanArt);
    const normTit = normalizeString(cleanTit);

    const match = hits.find((h: any) => {
      const r = h.result;
      if (!r || !r.path) return false;
      const hitArt = normalizeString(r.primary_artist?.name || "");
      const hitTit = normalizeString(r.title || "");
      const artistOk = !normArt || hitArt.includes(normArt) || normArt.includes(hitArt);
      const titleOk = hitTit.includes(normTit) || normTit.includes(hitTit);
      return artistOk && titleOk;
    }) || hits[0];

    const hitPath = match?.result?.path;
    if (!hitPath) return null;

    const pageUrl = `https://genius.com${hitPath}`;
    const pageRes = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    const containers = html.match(/<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g);
    if (!containers || containers.length === 0) return null;

    let fullLyrics = "";
    for (const c of containers) {
      const text = c
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
      fullLyrics += text + "\n\n";
    }

    const cleaned = fullLyrics
      .replace(/^\d+\s+Contributors[\s\S]*?Lyrics/i, "")
      .replace(/^\d+\s+Contributors/i, "")
      .trim();

    if (cleaned.length > 25) {
      return cleaned;
    }
  } catch {}
  return null;
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

  // 4. Fallback to Genius Scraper (Massive Global Lyrics Database)
  if (cleanTitle) {
    const geniusText = await fetchGeniusLyrics(cleanArtist, cleanTitle);
    if (geniusText) {
      return { synced: false, lrc: "", plain: geniusText, provider: "Genius" };
    }
  }

  // 5. Fallback to Lyrics.ovh with strict validation
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
        const parsed = parseLrc(content);
        return {
          synced: true,
          source: "local",
          hasWordSync: parsed.some(line => line.words && line.words.length > 0),
          lines: parsed
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
      const parsed = parseLrc(content);
      return {
        synced: true,
        source: "cache",
        provider: "LRCLIB",
        hasWordSync: parsed.some(line => line.words && line.words.length > 0),
        lines: parsed
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
        const parsed = parseLrc(online.lrc);
        try {
          fs.writeFileSync(cacheFile, online.lrc, "utf-8");
        } catch {}

        return {
          synced: true,
          source: "online",
          provider: online.provider || "LRCLIB",
          hasWordSync: parsed.some(line => line.words && line.words.length > 0),
          lines: parsed
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
