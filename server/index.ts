import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const app = express();
const PORT = 3001;

app.use(cors({
  origin: "*",
  methods: ["GET", "HEAD", "OPTIONS"],
  allowedHeaders: ["Range", "Accept-Ranges", "Content-Type", "Origin", "X-Requested-With"]
}));
app.use(express.json());

const MUSIC_DIR = path.resolve(process.env.MUSIC_DIR || path.join(process.env.HOME || os.homedir(), "Music"));

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
}

let cachedTracks: Track[] = [];
let isScanning = false;
let scanCompletePromise: Promise<Track[]> | null = null;

const AUDIO_EXTENSIONS = new Set([".flac", ".mp3", ".wav", ".m4a", ".ogg", ".opus", ".aac", ".wma"]);
const IMAGE_NAMES = ["cover.jpg", "cover.png", "folder.jpg", "folder.png", "discart.jpg", "Cover.jpg", "front.jpg"];

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

function findCoverArt(trackPath: string): string | undefined {
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

    return {
      title,
      artist,
      album,
      year,
      trackNumber: isNaN(trackNumber) ? undefined : trackNumber,
      duration: isNaN(duration) ? 0 : duration,
      bitrate,
      sampleRate,
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
    const { hasLyrics } = findLyrics(fullPath);
    const coverPath = findCoverArt(fullPath);

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
      size: stats.size
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

app.get("/api/lyrics", (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  const { path: lyricsPath } = findLyrics(filePath);
  if (!lyricsPath || !fs.existsSync(lyricsPath)) {
    return res.json({ synced: false, lines: [] });
  }

  try {
    const content = fs.readFileSync(lyricsPath, "utf-8");
    if (lyricsPath.endsWith(".lrc")) {
      const parsed = parseLrc(content);
      return res.json({ synced: true, lines: parsed });
    } else {
      const rawLines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
      return res.json({
        synced: false,
        lines: rawLines.map((t, idx) => ({ time: idx * 4, text: t }))
      });
    }
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

app.get("/covers", (req, res) => {
  const coverPath = req.query.path as string;
  if (coverPath && fs.existsSync(coverPath)) {
    const ext = path.extname(coverPath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp"
    };
    res.setHeader("Content-Type", mimeTypes[ext] || "image/jpeg");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return fs.createReadStream(coverPath).pipe(res);
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

