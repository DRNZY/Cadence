import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import crypto from "crypto";
import { getLyricsForTrack } from "./lyricsFetcher.ts";

const execFileAsync = promisify(execFile);
const app = express();
const PORT = 3001;

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
  allowedHeaders: ["Range", "Accept-Ranges", "Content-Type", "Origin", "X-Requested-With"]
}));
app.use(express.json());

const MUSIC_DIR = path.resolve(process.env.MUSIC_DIR || path.join(process.env.HOME || os.homedir(), "Music"));
const USER_DATA_DIR = path.join(process.env.HOME || os.homedir(), ".config", "cadence");
const LEGACY_DATA_DIR = path.join(process.env.HOME || os.homedir(), ".config", "auradeck");
const COVER_CACHE_DIR = path.join(os.homedir(), ".cache", "cadence", "covers");
const PLAYLISTS_FILE = path.join(USER_DATA_DIR, "playlists.json");

// Ensure config and cache dirs exist
if (!fs.existsSync(USER_DATA_DIR)) {
  try { fs.mkdirSync(USER_DATA_DIR, { recursive: true }); } catch {}
}
if (!fs.existsSync(COVER_CACHE_DIR)) {
  try { fs.mkdirSync(COVER_CACHE_DIR, { recursive: true }); } catch {}
}

export interface LyricLine {
  time: number;
  text: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  year?: string;
  trackNumber?: number;
  duration: number;
  format: string;
  bitrate?: number;
  sampleRate?: number;
  filePath: string;
  coverPath?: string;
  hasLyrics: boolean;
  size: number;
  replayGain?: number;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
  coverPath?: string;
}

let cachedTracks: Track[] = [];
let isScanning = false;
let scanCompletePromise: Promise<Track[]> | null = null;

const AUDIO_EXTENSIONS = new Set([".flac", ".mp3", ".wav", ".m4a", ".ogg", ".opus", ".aac", ".wma"]);
const IMAGE_NAMES = ["cover.jpg", "cover.png", "folder.jpg", "folder.png", "discart.jpg", "Cover.jpg", "front.jpg"];

// Playlists storage helpers
function loadPlaylists(): Playlist[] {
  try {
    if (fs.existsSync(PLAYLISTS_FILE)) {
      const data = fs.readFileSync(PLAYLISTS_FILE, "utf-8");
      return JSON.parse(data);
    }
    const legacyFile = path.join(LEGACY_DATA_DIR, "playlists.json");
    if (fs.existsSync(legacyFile)) {
      const data = fs.readFileSync(legacyFile, "utf-8");
      const list = JSON.parse(data);
      savePlaylists(list);
      return list;
    }
  } catch (err) {
    console.error("[Cadence Server] Error reading playlists:", err);
  }
  return [];
}

function savePlaylists(playlists: Playlist[]) {
  try {
    fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify(playlists, null, 2), "utf-8");
  } catch (err) {
    console.error("[AuraDeck Server] Error saving playlists:", err);
  }
}

export function parseLrc(content: string): LyricLine[] {
  const lines = content.split(/\r?\n/);
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    if (trimmed.startsWith("[ti:") || trimmed.startsWith("[ar:") || trimmed.startsWith("[al:") || trimmed.startsWith("[by:")) {
      continue;
    }

    let match;
    const timestamps: number[] = [];
    let text = trimmed;

    while ((match = timeRegex.exec(trimmed)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const millis = match[3] ? (match[3].length === 2 ? parseInt(match[3], 10) * 10 : parseInt(match[3], 10)) : 0;
      timestamps.push(minutes * 60 + seconds + millis / 1000);
      text = text.replace(match[0], "");
    }

    text = text.trim();
    if (timestamps.length > 0 && text) {
      for (const t of timestamps) {
        result.push({ time: t, text });
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

function findCachedCover(artist?: string, album?: string, title?: string): string | undefined {
  if (!artist && !album && !title) return undefined;
  const cleanArtist = (artist || "").replace(/feat\..*|ft\..*|\(.*?\)|\[.*?\]/gi, "").trim();
  const cleanAlbum = (album || "").replace(/\(.*?\)|\[.*?\]/gi, "").trim();
  const cleanTitle = (title || "").replace(/\(.*?\)|\[.*?\]/gi, "").trim();

  const safeKey = `${cleanArtist}_${cleanAlbum || cleanTitle}`.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  const cacheFile = path.join(COVER_CACHE_DIR, `${safeKey}.jpg`);
  if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 500) {
    return cacheFile;
  }
  return undefined;
}

export async function fetchOnlineAlbumCover(artist?: string, album?: string, title?: string): Promise<string | null> {
  const cleanArtist = (artist || "").replace(/feat\..*|ft\..*|\(.*?\)|\[.*?\]/gi, "").trim();
  const cleanAlbum = (album || "").replace(/\(.*?\)|\[.*?\]/gi, "").trim();
  const cleanTitle = (title || "").replace(/\(.*?\)|\[.*?\]/gi, "").trim();

  const query = `${cleanArtist} ${cleanAlbum || cleanTitle}`.trim();
  if (!query || query.length < 2) return null;

  const safeKey = `${cleanArtist}_${cleanAlbum || cleanTitle}`.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  const cacheFile = path.join(COVER_CACHE_DIR, `${safeKey}.jpg`);
  if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 500) {
    return cacheFile;
  }

  try {
    // 1. Query Apple iTunes Search API (returns 1000x1000 ultra high-res art)
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=3`;
    const itunesRes = await fetch(itunesUrl, {
      headers: { "User-Agent": "Cadence-AudioPlayer/1.0.0" },
      signal: AbortSignal.timeout(5000)
    });

    if (itunesRes.ok) {
      const data: any = await itunesRes.json();
      if (data.results && data.results.length > 0) {
        const match = data.results[0];
        if (match.artworkUrl100) {
          const highResUrl = match.artworkUrl100.replace("100x100bb.jpg", "1000x1000bb.jpg");
          const imgRes = await fetch(highResUrl, { signal: AbortSignal.timeout(7000) });
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            fs.writeFileSync(cacheFile, buffer);
            return cacheFile;
          }
        }
      }
    }

    // 2. Query Deezer API as high-res fallback
    const deezerUrl = `https://api.deezer.com/search/album?q=${encodeURIComponent(query)}&limit=1`;
    const deezerRes = await fetch(deezerUrl, {
      headers: { "User-Agent": "Cadence-AudioPlayer/1.0.0" },
      signal: AbortSignal.timeout(5000)
    });
    if (deezerRes.ok) {
      const dData: any = await deezerRes.json();
      if (dData.data && dData.data.length > 0) {
        const coverUrl = dData.data[0].cover_xl || dData.data[0].cover_big;
        if (coverUrl) {
          const imgRes = await fetch(coverUrl, { signal: AbortSignal.timeout(7000) });
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            fs.writeFileSync(cacheFile, buffer);
            return cacheFile;
          }
        }
      }
    }
  } catch (err) {
    // Network timeout or offline
  }
  return null;
}

function findCoverArt(trackPath: string, artist?: string, album?: string, title?: string): string | undefined {
  const dir = path.dirname(trackPath);
  
  for (const img of IMAGE_NAMES) {
    const candidate = path.join(dir, img);
    if (fs.existsSync(candidate)) return candidate;
  }

  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const lower = f.toLowerCase();
      if (lower.endsWith(".jpg") || lower.endsWith(".png") || lower.endsWith(".webp") || lower.endsWith(".jpeg")) {
        return path.join(dir, f);
      }
    }
  } catch (e) {}

  const parentDir = path.dirname(dir);
  for (const img of IMAGE_NAMES) {
    const candidate = path.join(parentDir, img);
    if (fs.existsSync(candidate)) return candidate;
  }

  // Check cache
  const cached = findCachedCover(artist, album, title);
  if (cached) return cached;

  return undefined;
}

function findLyrics(trackPath: string): { hasLyrics: boolean; path?: string } {
  const parsed = path.parse(trackPath);
  const lrcPath = path.join(parsed.dir, `${parsed.name}.lrc`);
  if (fs.existsSync(lrcPath)) return { hasLyrics: true, path: lrcPath };

  const txtPath = path.join(parsed.dir, `${parsed.name}.txt`);
  if (fs.existsSync(txtPath)) return { hasLyrics: true, path: txtPath };

  return { hasLyrics: false };
}

function parseReplayGain(gainStr?: string): number | undefined {
  if (!gainStr) return undefined;
  const match = gainStr.match(/([-+]?\d+(\.\d+)?)/);
  if (match) {
    const val = parseFloat(match[1]);
    return isNaN(val) ? undefined : val;
  }
  return undefined;
}

async function extractMetadata(filePath: string): Promise<Partial<Track>> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath
    ]);
    const data = JSON.parse(stdout);
    const format = data.format || {};
    const tags = format.tags || {};
    const tagsLower: Record<string, string> = {};
    for (const [k, v] of Object.entries(tags)) {
      tagsLower[k.toLowerCase()] = String(v);
    }

    const stream = (data.streams || []).find((s: any) => s.codec_type === "audio") || {};

    const duration = parseFloat(format.duration || "0");
    const artist = tagsLower.artist || tagsLower.album_artist || tagsLower.albumartist;
    const album = tagsLower.album;
    const title = tagsLower.title;
    const year = tagsLower.date || tagsLower.year || tagsLower.originalyear;
    const trackNumber = parseInt(tagsLower.track || "1", 10);
    const bitrate = parseInt(format.bit_rate || "0", 10);
    const sampleRate = parseInt(stream.sample_rate || "44100", 10);

    const replayGain = parseReplayGain(
      tagsLower.replaygain_track_gain ||
      tagsLower.replaygain_album_gain ||
      tagsLower["r128_track_gain"] ||
      tagsLower["replaygain_gain"]
    );

    return {
      title,
      artist,
      album,
      year,
      trackNumber: isNaN(trackNumber) ? undefined : trackNumber,
      duration: isNaN(duration) ? 0 : duration,
      bitrate,
      sampleRate,
      replayGain
    };
  } catch (err) {
    return {};
  }
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function scanLibrary(): Promise<Track[]> {
  if (!fs.existsSync(MUSIC_DIR)) return [];
  const audioFilePaths: string[] = [];

  async function walk(currentDir: string) {
    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "Mixxx" && !entry.name.startsWith(".")) {
          await walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTENSIONS.has(ext)) {
          audioFilePaths.push(fullPath);
        }
      }
    }
  }

  await walk(MUSIC_DIR);
  console.log(`[AuraDeck Server] Discovered ${audioFilePaths.length} audio files. Parsing metadata...`);

  const tracks = await mapConcurrent(audioFilePaths, 12, async (fullPath) => {
    const ext = path.extname(fullPath).toLowerCase();
    const stats = await fs.promises.stat(fullPath);
    const meta = await extractMetadata(fullPath);
    const rel = path.relative(MUSIC_DIR, fullPath);
    const parts = rel.split(path.sep);

    let fallbackArtist = "Unknown Artist";
    let fallbackAlbum = "Unknown Album";
    let fallbackTitle = path.parse(fullPath).name;

    if (parts.length >= 3) {
      fallbackArtist = parts[0];
      fallbackAlbum = parts[1];
    } else if (parts.length === 2) {
      fallbackArtist = parts[0];
    }

    const cleanedTitle = fallbackTitle.replace(/^(\d{1,2}[.\s\-_]+)+/, "").trim() || fallbackTitle;
    const coverPath = findCoverArt(fullPath, meta.artist || fallbackArtist, meta.album || fallbackAlbum, meta.title || cleanedTitle);
    const { hasLyrics } = findLyrics(fullPath);

    return {
      id: Buffer.from(fullPath).toString("base64url"),
      title: meta.title || cleanedTitle,
      artist: meta.artist || fallbackArtist,
      album: meta.album || fallbackAlbum,
      year: meta.year,
      trackNumber: meta.trackNumber,
      duration: meta.duration || 0,
      format: ext.replace(".", "").toUpperCase(),
      bitrate: meta.bitrate,
      sampleRate: meta.sampleRate,
      filePath: fullPath,
      coverPath,
      hasLyrics,
      size: stats.size,
      replayGain: meta.replayGain
    };
  });

  return tracks.sort((a, b) => {
    if (a.artist !== b.artist) return a.artist.localeCompare(b.artist);
    if (a.album !== b.album) return a.album.localeCompare(b.album);
    return (a.trackNumber || 0) - (b.trackNumber || 0);
  });
}

scanCompletePromise = (async () => {
  console.log(`[AuraDeck Server] Scanning library at ${MUSIC_DIR}...`);
  cachedTracks = await scanLibrary();
  console.log(`[AuraDeck Server] Cached ${cachedTracks.length} tracks.`);
  return cachedTracks;
})();

app.get("/api/tracks", async (req, res) => {
  if (scanCompletePromise && cachedTracks.length === 0) {
    await scanCompletePromise;
  }
  res.json({
    musicDir: MUSIC_DIR,
    count: cachedTracks.length,
    tracks: cachedTracks
  });
});

app.get("/api/rescan", async (req, res) => {
  if (isScanning) return res.status(429).json({ message: "Scan already in progress" });
  isScanning = true;
  try {
    cachedTracks = await scanLibrary();
    res.json({ count: cachedTracks.length, tracks: cachedTracks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    isScanning = false;
  }
});

// Playlists API
app.get("/api/playlists", (_req, res) => {
  const playlists = loadPlaylists();
  res.json({ playlists });
});

app.post("/api/playlists", (req, res) => {
  const { name, description, trackIds } = req.body;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Playlist name is required" });
  }
  const playlists = loadPlaylists();
  const newPlaylist: Playlist = {
    id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    description: (description || "").trim(),
    trackIds: Array.isArray(trackIds) ? trackIds : [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  playlists.push(newPlaylist);
  savePlaylists(playlists);
  res.json({ playlist: newPlaylist });
});

app.put("/api/playlists/:id", (req, res) => {
  const { id } = req.params;
  const { name, description, trackIds } = req.body;
  const playlists = loadPlaylists();
  const index = playlists.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Playlist not found" });
  }
  const existing = playlists[index];
  const updated: Playlist = {
    ...existing,
    name: name !== undefined ? name.trim() : existing.name,
    description: description !== undefined ? description.trim() : existing.description,
    trackIds: Array.isArray(trackIds) ? trackIds : existing.trackIds,
    updatedAt: Date.now()
  };
  playlists[index] = updated;
  savePlaylists(playlists);
  res.json({ playlist: updated });
});

app.delete("/api/playlists/:id", (req, res) => {
  const { id } = req.params;
  let playlists = loadPlaylists();
  const initialLen = playlists.length;
  playlists = playlists.filter(p => p.id !== id);
  if (playlists.length === initialLen) {
    return res.status(404).json({ error: "Playlist not found" });
  }
  savePlaylists(playlists);
  res.json({ success: true, id });
});

// Export Playlist as M3U8
app.get("/api/playlists/:id/export.m3u8", (req, res) => {
  const { id } = req.params;
  const playlists = loadPlaylists();
  const playlist = playlists.find(p => p.id === id);
  if (!playlist) return res.status(404).send("Playlist not found");

  const lines = ["#EXTM3U", `#PLAYLIST:${playlist.name}`];
  for (const trackId of playlist.trackIds) {
    const track = cachedTracks.find(t => t.id === trackId);
    if (track) {
      lines.push(`#EXTINF:${Math.round(track.duration)},${track.artist} - ${track.title}`);
      lines.push(track.filePath);
    }
  }

  const m3u8Content = lines.join("\n");
  res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(playlist.name)}.m3u8"`);
  res.send(m3u8Content);
});

// Import M3U/M3U8 file
app.post("/api/playlists/import", (req, res) => {
  const { name, content } = req.body;
  if (!content || typeof content !== "string") {
    return res.status(400).json({ error: "M3U content required" });
  }

  const lines = content.split(/\r?\n/);
  const matchedTrackIds: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Try finding by exact file path or base name
    const found = cachedTracks.find(t => t.filePath === trimmed || path.basename(t.filePath) === path.basename(trimmed));
    if (found && !matchedTrackIds.includes(found.id)) {
      matchedTrackIds.push(found.id);
    }
  }

  const playlists = loadPlaylists();
  const playlistName = (name || "Imported Playlist").replace(/\.m3u8?$/i, "").trim();
  const newPlaylist: Playlist = {
    id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: playlistName,
    description: `Imported with ${matchedTrackIds.length} tracks`,
    trackIds: matchedTrackIds,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  playlists.push(newPlaylist);
  savePlaylists(playlists);
  res.json({ playlist: newPlaylist, matchedCount: matchedTrackIds.length });
});

app.get("/api/lyrics", async (req, res) => {
  const filePath = req.query.path as string;
  const title = (req.query.title as string) || "";
  const artist = (req.query.artist as string) || "";
  const album = (req.query.album as string) || "";
  const duration = parseFloat(req.query.duration as string) || 0;

  try {
    const result = await getLyricsForTrack(filePath, artist, title, album, duration);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message, synced: false, lines: [] });
  }
});

app.get("/api/lyrics/online", async (req, res) => {
  const title = (req.query.title as string) || "";
  const artist = (req.query.artist as string) || "";
  const album = (req.query.album as string) || "";
  const duration = parseFloat(req.query.duration as string) || 0;

  try {
    const result = await getLyricsForTrack("", artist, title, album, duration);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.options("/stream", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range, Accept-Ranges, Content-Type");
  res.sendStatus(200);
});

app.get("/stream", (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const ext = path.extname(filePath).toLowerCase();

  const mimeTypes: Record<string, string> = {
    ".flac": "audio/flac",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".opus": "audio/opus",
    ".aac": "audio/aac"
  };

  const contentType = mimeTypes[ext] || "audio/mpeg";

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Range, Accept-Ranges, Content-Type");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
  res.setHeader("Accept-Ranges", "bytes");

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

app.get("/covers", async (req, res) => {
  const coverPath = req.query.path as string;
  const artist = req.query.artist as string;
  const album = req.query.album as string;
  const title = req.query.title as string;

  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp"
  };

  // 1. Direct local file
  if (coverPath && fs.existsSync(coverPath)) {
    const ext = path.extname(coverPath).toLowerCase();
    res.setHeader("Content-Type", mimeTypes[ext] || "image/jpeg");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return fs.createReadStream(coverPath).pipe(res);
  }

  // 2. Cached or online auto-fetched cover
  if (artist || album || title) {
    const cachedOrOnline = await fetchOnlineAlbumCover(artist, album, title);
    if (cachedOrOnline && fs.existsSync(cachedOrOnline)) {
      const ext = path.extname(cachedOrOnline).toLowerCase();
      res.setHeader("Content-Type", mimeTypes[ext] || "image/jpeg");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return fs.createReadStream(cachedOrOnline).pipe(res);
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
    <defs>
      <radialGradient id="grad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#1f2430" />
        <stop offset="70%" stop-color="#111318" />
        <stop offset="100%" stop-color="#07080a" />
      </radialGradient>
      <linearGradient id="sheen" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.15)" />
        <stop offset="50%" stop-color="rgba(255,255,255,0.02)" />
        <stop offset="100%" stop-color="rgba(255,255,255,0.15)" />
      </linearGradient>
    </defs>
    <circle cx="150" cy="150" r="145" fill="url(#grad)" stroke="#222" stroke-width="2"/>
    <circle cx="150" cy="150" r="130" fill="none" stroke="#252830" stroke-width="1"/>
    <circle cx="150" cy="150" r="115" fill="none" stroke="#1d2027" stroke-width="1"/>
    <circle cx="150" cy="150" r="100" fill="none" stroke="#252830" stroke-width="1"/>
    <circle cx="150" cy="150" r="85" fill="none" stroke="#1d2027" stroke-width="1"/>
    <circle cx="150" cy="150" r="55" fill="#6750A4" stroke="#D0BCFF" stroke-width="2"/>
    <circle cx="150" cy="150" r="15" fill="#000" />
    <circle cx="150" cy="150" r="145" fill="url(#sheen)"/>
    <text x="150" y="155" text-anchor="middle" fill="#fff" font-family="system-ui" font-weight="bold" font-size="11">AURA DECK</text>
  </svg>`;

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(svg);
});

// Serve production frontend assets if dist directory exists
const currentDir = typeof __dirname !== "undefined" ? __dirname : path.dirname(new URL(import.meta.url).pathname);
const DIST_DIR = path.resolve(process.env.DIST_DIR || path.join(currentDir, "../dist"));

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api") && !req.path.startsWith("/stream") && !req.path.startsWith("/covers")) {
      return res.sendFile(path.join(DIST_DIR, "index.html"));
    }
    next();
  });
}

app.listen(PORT, () => {
  console.log(`[AuraDeck Audio Server] Running on http://localhost:${PORT}`);
});
