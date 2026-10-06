import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import os from "os";
import net from "net";
import { execFile } from "child_process";
import { promisify } from "util";
import crypto from "crypto";
import { getLyricsForTrack, searchLyricsCandidates, getCacheKey, parseLrc } from "./lyricsFetcher.ts";
import { lastFmRouter } from "./lastfm.ts";
import { DiscoveryServer } from "./discovery.ts";
import { isLanExposed, isLoopbackAddress, getBindHosts, getServerToken, tokenMatches, extractToken } from "./auth.ts";
import { DiscordRpc } from "../electron/discordRpc.cjs";
import { makeAlbumId, extractPrimaryArtist } from "../shared/albumIdentity.ts";

const execFileAsync = promisify(execFile);
const app = express();
// Overridable so a dev instance can run alongside an installed build instead of
// fighting it for the port and silently serving requests from the other copy.
const PORT = (() => {
  const fromEnv = parseInt(process.env.CADENCE_PORT || "", 10);
  return !isNaN(fromEnv) && fromEnv > 0 && fromEnv < 65536 ? fromEnv : 3001;
})();

// Security Headers Middleware
/**
 * Content-Security-Policy.
 *
 * The app ships no external scripts and loads no third-party origins, so the
 * policy can be strict. `unsafe-inline` survives only for styles, because
 * Tailwind and the inline style attributes used for dynamic values (accent
 * colours, spectrum gradients) both rely on it; scripts do not get the
 * exemption, which is the part that actually matters for XSS containment.
 *
 * The important property here is that `script-src` has no `unsafe-inline`, so
 * an injected `<script>` or an inline event handler cannot execute even if markup
 * injection is found somewhere in the renderer. Before this, one such bug would
 * have been full compromise of the app context.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Vite's dev server injects styles and the HMR client as inline/eval scripts,
  // so the policy relaxes only when explicitly running in dev mode.
  ...(process.env.CADENCE_DEV ? ["style-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-eval' 'unsafe-inline'"] : ["style-src 'self' 'unsafe-inline'"]),
  "img-src 'self' data: blob:",
  "media-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "worker-src 'self' blob:"
].join("; ");

app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  // Allow cross-origin media subresources so HTML5 Audio and Canvas can process streams
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});

const isPrivateIpOrigin = (origin: string): boolean => {
  try {
    const host = new URL(origin).hostname.replace(/^\[|\]$/g, "");

    // `localhost` is the only name we trust, and only because it cannot be
    // registered by an attacker.
    if (host === "localhost") return true;

    // Everything below must be a real IP address. The previous version used
    // `host.startsWith("10.")` and friends, which matches *hostnames* just as
    // happily as addresses: anyone who registers `10.evil.com` or
    // `192.168.attacker.tld` was handed a full, authenticated-looking pass into
    // this API, including writes. A DNS name is never private, so anything that
    // does not parse as an IP is rejected outright.
    if (!net.isIP(host)) return false;

    if (net.isIPv4(host)) {
      const [a, b] = host.split(".").map(Number);
      if (a === 127) return true;                    // loopback
      if (a === 10) return true;                     // 10.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
      if (a === 192 && b === 168) return true;       // 192.168.0.0/16
      if (a === 169 && b === 254) return true;       // link-local
      return false;
    }

    // IPv6: loopback, unique-local (fc00::/7), and link-local (fe80::/10).
    const lower = host.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (/^f[cd]/.test(lower)) return true;
    if (/^fe[89ab]/.test(lower)) return true;
    return false;
  } catch {
    return false;
  }
};

/**
 * Endpoints that must work before a client can prove anything, because they
 * are what a client uses to *get* a token. Everything else is behind the gate.
 */
const PUBLIC_PATHS = new Set(["/api/ping", "/healthz"]);

app.use((req, res, next) => {
  // When the server is loopback-only there is no remote principal to
  // authenticate, and demanding a token would just break every existing client
  // for no security gain. Loopback is the trust boundary at that point.
  if (!isLanExposed() || isLoopbackAddress(req.socket.remoteAddress)) return next();

  if (req.method === "OPTIONS") return next();
  if (PUBLIC_PATHS.has(req.path)) return next();

  if (!tokenMatches(extractToken(req))) {
    return res.status(401).json({
      error: "Cadence requires an access token when exposed to the network",
      hint: "Set CADENCE_LAN=1 on the server and send X-Cadence-Token: <token from ~/.config/cadence/lan-token>"
    });
  }
  next();
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin.startsWith("file://") || origin.startsWith("vscode-webview://") || isPrivateIpOrigin(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
  allowedHeaders: ["Range", "Accept-Ranges", "Content-Type", "Origin", "X-Requested-With", "X-Cadence-Token", "Authorization"]
}));

// Origin Validation Defense for cross-site requests
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !origin.startsWith("file://") && !origin.startsWith("vscode-webview://") && !isPrivateIpOrigin(origin)) {
    return res.status(403).json({ error: "Access denied by Cadence origin policy" });
  }
  next();
});

app.use(express.json({ limit: "10mb" }));
app.use("/api/lastfm", lastFmRouter);

const MUSIC_DIR = path.resolve(process.env.MUSIC_DIR || path.join(process.env.HOME || os.homedir(), "Music"));
const USER_DATA_DIR = path.join(process.env.HOME || os.homedir(), ".config", "cadence");
const LEGACY_DATA_DIR = path.join(process.env.HOME || os.homedir(), ".config", "auradeck");
const CADENCE_CACHE_DIR = path.join(os.homedir(), ".cache", "cadence");
const COVER_CACHE_DIR = path.join(CADENCE_CACHE_DIR, "covers");
const LIBRARY_CACHE_FILE = path.join(CADENCE_CACHE_DIR, "library_cache.json");
const PLAYLISTS_FILE = path.join(USER_DATA_DIR, "playlists.json");
const FAVORITES_FILE = path.join(USER_DATA_DIR, "favorites.json");
const SETTINGS_FILE = path.join(USER_DATA_DIR, "settings.json");

/**
 * Config and cache directories hold the Last.fm session key, the access token,
 * and the full library index including absolute file paths. `mkdirSync` only
 * applies `mode` when it creates the leaf, so an existing directory keeps
 * whatever it had — these calls exist to repair a directory that is already too
 * permissive, not just to create a correct one.
 */
for (const dir of [USER_DATA_DIR, CADENCE_CACHE_DIR, COVER_CACHE_DIR]) {
  try {
    if (fs.existsSync(dir)) {
      fs.chmodSync(dir, 0o700);
    } else {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  } catch {}
}

export function atomicWriteFileSync(filePath: string, data: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;
  fs.writeFileSync(tempPath, data, { encoding: "utf-8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
  try { fs.chmodSync(filePath, 0o600); } catch {}
}

const AUDIO_EXTENSIONS = new Set([
  ".flac", ".mp3", ".wav", ".m4a", ".ogg", ".opus", ".aac", ".alac", ".aiff", ".wma"
]);

const COVER_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".avif"
]);

export function isAudioPathAllowed(targetPath: string): boolean {
  if (!targetPath || typeof targetPath !== "string") return false;
  try {
    if (targetPath.includes("\0")) return false;
    const resolved = path.resolve(targetPath);
    const ext = path.extname(resolved).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext)) return false;

    // Disallow reading from sensitive config/keys directories
    if (resolved.startsWith(USER_DATA_DIR + path.sep) || resolved === USER_DATA_DIR) return false;
    if (resolved.startsWith(LEGACY_DATA_DIR + path.sep) || resolved === LEGACY_DATA_DIR) return false;

    const real = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
    if (!AUDIO_EXTENSIONS.has(path.extname(real).toLowerCase())) return false;
    if (real.startsWith(USER_DATA_DIR + path.sep) || real === USER_DATA_DIR) return false;

    const allowedDirs = [
      MUSIC_DIR,
      CADENCE_CACHE_DIR,
      path.join(os.homedir(), "Music"),
      path.join(os.homedir(), "Downloads"),
    ];
    return allowedDirs.some(dir => real === dir || real.startsWith(dir + path.sep));
  } catch {
    return false;
  }
}

export function isCoverPathAllowed(targetPath: string): boolean {
  if (!targetPath || typeof targetPath !== "string") return false;
  try {
    if (targetPath.includes("\0")) return false;
    const resolved = path.resolve(targetPath);
    const ext = path.extname(resolved).toLowerCase();
    if (!COVER_EXTENSIONS.has(ext)) return false;

    // Disallow reading from sensitive config/keys directories
    if (resolved.startsWith(USER_DATA_DIR + path.sep) || resolved === USER_DATA_DIR) return false;
    if (resolved.startsWith(LEGACY_DATA_DIR + path.sep) || resolved === LEGACY_DATA_DIR) return false;

    const real = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
    if (!COVER_EXTENSIONS.has(path.extname(real).toLowerCase())) return false;
    if (real.startsWith(USER_DATA_DIR + path.sep) || real === USER_DATA_DIR) return false;

    const allowedDirs = [
      COVER_CACHE_DIR,
      CADENCE_CACHE_DIR,
      MUSIC_DIR,
      path.join(os.homedir(), "Music"),
      path.join(os.homedir(), "Downloads"),
    ];
    return allowedDirs.some(dir => real === dir || real.startsWith(dir + path.sep));
  } catch {
    return false;
  }
}

export function isPathAllowed(targetPath: string): boolean {
  return isAudioPathAllowed(targetPath) || isCoverPathAllowed(targetPath);
}

// Ensure config and cache dirs exist
if (!fs.existsSync(USER_DATA_DIR)) {
  try { fs.mkdirSync(USER_DATA_DIR, { recursive: true }); } catch {}
}
if (!fs.existsSync(CADENCE_CACHE_DIR)) {
  try { fs.mkdirSync(CADENCE_CACHE_DIR, { recursive: true }); } catch {}
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
  /** REPLAYGAIN_TRACK_GAIN in dB, when the tag exists. */
  replayGainTrack?: number;
  /** REPLAYGAIN_ALBUM_GAIN in dB, when the tag exists. */
  replayGainAlbum?: number;
  /**
   * Legacy single-value alias. Resolved as track-then-album purely so older
   * clients keep working; it cannot express "album mode", because a track with
   * no track gain silently inherits the album gain and then plays at the wrong
   * level relative to its neighbours. New code must read the two fields above.
   */
  replayGain?: number;
  /** Container bit depth of the audio stream, when ffprobe reports one. */
  bitsPerSample?: number;
  /**
   * ALBUMARTIST, kept separate from the track artist.
   *
   * These are different things and conflating them is what split albums apart.
   * On a compilation the track artist is a different performer per track while
   * the album artist is "Various Artists"; on a track with a feature the track
   * artist carries "A feat. B" while the album artist is just "A". Folding the
   * album artist into the track artist loses the one field that identifies the
   * release.
   */
  albumArtist?: string;
  /** Disc number from DISCC/disc/discnumber, when the file has one. */
  discNumber?: number;
  /** True when the file is flagged as part of a compilation. */
  compilation?: boolean;
  /**
   * Stable identity of the release. MusicBrainz ID when tagged, otherwise a
   * normalised key derived from album artist, album title and disc number.
   * Grouping and artwork both key on this, so they cannot disagree.
   */
  albumId: string;
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
    atomicWriteFileSync(PLAYLISTS_FILE, JSON.stringify(playlists, null, 2));
  } catch (err) {
    console.error("[Cadence Server] Error saving playlists:", err);
  }
}

// Favorites storage helpers
function loadFavorites(): string[] {
  try {
    if (fs.existsSync(FAVORITES_FILE)) {
      const data = fs.readFileSync(FAVORITES_FILE, "utf-8");
      const list = JSON.parse(data);
      if (Array.isArray(list)) return list;
    }
  } catch (err) {
    console.error("[Cadence Server] Error reading favorites:", err);
  }
  return [];
}

function saveFavorites(favorites: string[]) {
  try {
    atomicWriteFileSync(FAVORITES_FILE, JSON.stringify(favorites, null, 2));
  } catch (err) {
    console.error("[Cadence Server] Error saving favorites:", err);
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

/**
 * Filename for a cached cover, derived from the album identity.
 *
 * This used to be built from the artist and album *names* with bracketed
 * qualifiers stripped, which meant "Kind of Blue (Remastered)" and "Kind of
 * Blue (Deluxe Edition)" and "Kind of Blue" all resolved to the same file. The
 * first one scanned wrote its bytes and every other release then inherited them
 * as if they were the same album — which is what put unrelated artwork on
 * unrelated albums. Keying on `albumId` removes the collision by construction,
 * because `albumId` is already edition-aware.
 *
 * Falls back to the name pair only when no identity is available, which is the
 * untagged-file case.
 */
function coverCacheFileFor(
  albumId: string | undefined,
  artist?: string,
  album?: string,
  title?: string
): string | null {
  let safeKey: string;
  if (albumId && albumId !== "album:unknown") {
    // albumId contains a NUL separator and colons; neither is safe in a
    // filename, so fold the whole identity down to a stable hex digest.
    safeKey = "id_" + crypto.createHash("sha1").update(albumId).digest("hex").slice(0, 20);
  } else {
  const cleanArtist = (artist || "").replace(/feat\..*|ft\..*|\(.*?\)|\[.*?\]/gi, "").trim();
    const cleanAlbum = (album || "").replace(/\(.*?\)|\[.*?\]/gi, "").trim();
  const cleanTitle = (title || "").replace(/\(.*?\)|\[.*?\]/gi, "").trim();
    const raw = `${cleanArtist}_${cleanAlbum || cleanTitle}`;
    if (!raw.replace(/_/g, "")) return null;
    safeKey = raw.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  }
  return path.join(COVER_CACHE_DIR, `${safeKey}.jpg`);
}

function findCachedCover(
  albumId?: string,
  artist?: string,
  album?: string,
  title?: string
): string | undefined {
  if (!albumId && !artist && !album && !title) return undefined;
  const cacheFile = coverCacheFileFor(albumId, artist, album, title);
  if (cacheFile && fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 500) {
 return cacheFile;
  }
  return undefined;
}

function cleanQueryTerm(s?: string): string {
  if (!s) return "";
  return s
    .replace(/feat\..*|ft\..*|- Topic|\(.*?\)|\[.*?\]|- Single|- EP|\b(official\s+video|official\s+audio|lyrics|slowed|reverb|remastered|remaster)\b/gi, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isConfidentCoverMatch(
  candArtist: string,
  candTitle: string,
  qArtist: string,
  qTitle: string
): boolean {
  const cA = (candArtist || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const cT = (candTitle || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const qA = cleanQueryTerm(qArtist).toLowerCase().replace(/[^a-z0-9]/g, "");
  const qT = cleanQueryTerm(qTitle).toLowerCase().replace(/[^a-z0-9]/g, "");

  if (!qT && !qA) return false;

  // If query artist is present, require strong artist match
  if (qA && qA.length > 2) {
    const artMatch = cA.includes(qA) || qA.includes(cA);
    if (!artMatch) {
      const qWords = qA.split(/\s+/).filter(w => w.length > 2);
      const matched = qWords.filter(w => cA.includes(w));
      if (matched.length === 0) return false;
    }
  }

  // Title match: substring or token overlap
  if (qT && qT.length > 2) {
    if (cT.includes(qT) || qT.includes(cT)) return true;
    const qWords = qT.split(/\s+/).filter(w => w.length > 2);
    const matched = qWords.filter(w => cT.includes(w));
    if (qWords.length > 0 && matched.length / qWords.length >= 0.5) return true;
  }

  return true;
}

export async function fetchOnlineAlbumCover(
  albumId?: string,
  artist?: string,
  album?: string,
  title?: string
): Promise<string | null> {
  const cleanArtist = cleanQueryTerm(artist);
  const cleanAlbum = cleanQueryTerm(album);
  const cleanTitle = cleanQueryTerm(title);

  const query = `${cleanArtist} ${cleanAlbum || cleanTitle}`.trim();
  if (!query || query.length < 2) return null;

  // Same key as the local paths. This previously built its own from
  // `cleanQueryTerm`, which strips the bare word "remastered", so a download
  // for "Nevermind Remastered" was written to `nirvana_nevermind.jpg` while
  // every local lookup looked for `nirvana_nevermind_remastered.jpg`. The
  // download succeeded and was never found again.
  const cacheFile = coverCacheFileFor(albumId, artist, album, title);
  if (!cacheFile) return null;
  if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 500) {
    return cacheFile;
  }

  try {
    // 1. Query Apple iTunes Search API (entity=album first for high-res official sleeves with validation)
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=5`;
    const itunesRes = await fetch(itunesUrl, {
      headers: { "User-Agent": "Cadence-AudioPlayer/1.0.0" },
      signal: AbortSignal.timeout(5000)
    });

    if (itunesRes.ok) {
      const data: any = await itunesRes.json();
      if (data.results && data.results.length > 0) {
        const match = data.results.find((r: any) =>
          isConfidentCoverMatch(r.artistName, r.collectionName || r.trackName, cleanArtist, cleanAlbum || cleanTitle)
        );
        if (match && match.artworkUrl100) {
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

    // 1b. iTunes Search API fallback: entity=song (for singles, EPs, standalone tracks with validation)
    const itunesSongUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(`${cleanArtist} ${cleanTitle || cleanAlbum}`.trim())}&entity=song&limit=5`;
    const itunesSongRes = await fetch(itunesSongUrl, {
      headers: { "User-Agent": "Cadence-AudioPlayer/1.0.0" },
      signal: AbortSignal.timeout(5000)
    });
    if (itunesSongRes.ok) {
      const data: any = await itunesSongRes.json();
      if (data.results && data.results.length > 0) {
        const match = data.results.find((r: any) =>
          isConfidentCoverMatch(r.artistName, r.trackName || r.collectionName, cleanArtist, cleanTitle || cleanAlbum)
        );
        if (match && match.artworkUrl100) {
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

    // 2. TheAudioDB High-Resolution Official Album Art
    if (cleanArtist && (cleanAlbum || cleanTitle)) {
      try {
        const adbUrl = `https://www.theaudiodb.com/api/v1/json/2/searchalbum.php?s=${encodeURIComponent(cleanArtist)}&a=${encodeURIComponent(cleanAlbum || cleanTitle)}`;
        const adbRes = await fetch(adbUrl, { signal: AbortSignal.timeout(4000) });
        if (adbRes.ok) {
          const adbData: any = await adbRes.json();
          const alb = adbData?.album?.[0];
          if (alb && alb.strAlbumThumb && isConfidentCoverMatch(alb.strArtist, alb.strAlbum, cleanArtist, cleanAlbum || cleanTitle)) {
            const imgRes = await fetch(alb.strAlbumThumb, { signal: AbortSignal.timeout(7000) });
            if (imgRes.ok) {
              const buffer = Buffer.from(await imgRes.arrayBuffer());
              fs.writeFileSync(cacheFile, buffer);
              return cacheFile;
            }
          }
        }
      } catch {}
    }

    // 3. Query Deezer API as high-res fallback (album search first, then track search with validation)
    const deezerUrl = `https://api.deezer.com/search/album?q=${encodeURIComponent(query)}&limit=3`;
    const deezerRes = await fetch(deezerUrl, {
      headers: { "User-Agent": "Cadence-AudioPlayer/1.0.0" },
      signal: AbortSignal.timeout(5000)
    });
    if (deezerRes.ok) {
      const dData: any = await deezerRes.json();
      if (dData.data && dData.data.length > 0) {
        const match = dData.data.find((d: any) =>
          isConfidentCoverMatch(d.artist?.name, d.title, cleanArtist, cleanAlbum || cleanTitle)
        );
        if (match) {
          const coverUrl = match.cover_xl || match.cover_big;
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
    }

    const deezerTrackUrl = `https://api.deezer.com/search/track?q=${encodeURIComponent(`${cleanArtist} ${cleanTitle || cleanAlbum}`.trim())}&limit=3`;
    const deezerTrackRes = await fetch(deezerTrackUrl, {
      headers: { "User-Agent": "Cadence-AudioPlayer/1.0.0" },
      signal: AbortSignal.timeout(5000)
    });
    if (deezerTrackRes.ok) {
      const dData: any = await deezerTrackRes.json();
      if (dData.data && dData.data.length > 0) {
        const match = dData.data.find((d: any) =>
          isConfidentCoverMatch(d.artist?.name, d.title, cleanArtist, cleanTitle || cleanAlbum)
        );
        if (match) {
          const albumObj = match.album;
          const coverUrl = albumObj?.cover_xl || albumObj?.cover_big;
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
    }

    // 4. Query MusicBrainz + Cover Art Archive (Zero API Key, Open Community)
    if (cleanArtist && (cleanAlbum || cleanTitle)) {
      const mbQuery = cleanAlbum ? `release:${cleanAlbum} AND artist:${cleanArtist}` : `release:${cleanTitle} AND artist:${cleanArtist}`;
      const mbUrl = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(mbQuery)}&fmt=json&limit=3`;
      const mbRes = await fetch(mbUrl, {
        headers: { "User-Agent": "CadenceAudioPlayer/1.0.0 ( contact@cadence.app )" },
        signal: AbortSignal.timeout(4000)
      });
      if (mbRes.ok) {
        const mbData: any = await mbRes.json();
        const rels = mbData?.releases || [];
        for (const rel of rels) {
          const relArtist = rel["artist-credit"]?.[0]?.name || "";
          if (isConfidentCoverMatch(relArtist, rel.title, cleanArtist, cleanAlbum || cleanTitle)) {
            const caaUrl = `https://coverartarchive.org/release/${rel.id}/front-500`;
            const caaRes = await fetch(caaUrl, { signal: AbortSignal.timeout(7000), redirect: "follow" });
            if (caaRes.ok) {
              const buffer = Buffer.from(await caaRes.arrayBuffer());
              fs.writeFileSync(cacheFile, buffer);
              return cacheFile;
            }
          }
        }
      }
    }
  } catch (err) {
    // Network timeout or offline
  }
  return null;
}

export async function extractEmbeddedCover(
  filePath: string,
  albumId?: string,
  artist?: string,
  album?: string,
  title?: string
): Promise<string | undefined> {
  const cacheFile =
    coverCacheFileFor(albumId, artist, album, title) ??
    // No identity and no usable name pair: fall back to something derived from
    // the path so at least the extraction is not shared between every file that
    // failed to tag.
    path.join(
      COVER_CACHE_DIR,
      `emb_${Buffer.from(filePath).toString("base64url").slice(0, 16)}.jpg`
    );

  if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 1000) {
    return cacheFile;
  }

  try {
    // Extract front cover art stream with ffmpeg without re-encoding quality loss
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", filePath,
      "-an",
      "-frames:v", "1",
      "-update", "1",
      "-vcodec", "mjpeg",
      "-q:v", "2",
      cacheFile
    ]);
    if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 1000) {
      return cacheFile;
    }
  } catch {}

  return undefined;
}

function findCoverArt(
  trackPath: string,
  albumId?: string,
  artist?: string,
  album?: string,
  title?: string
): string | undefined {
  const dir = path.dirname(trackPath);

  for (const img of IMAGE_NAMES) {
    const candidate = path.join(dir, img);
    if (fs.existsSync(candidate)) return candidate;
  }

  try {
    // Prefer a conventional front-cover name over whatever happens to sort
    // first. The old code took the first image the directory listing happened
    // to yield, which regularly handed back a back cover, a booklet scan or an
    // "AlbumArtSmall" file.
    const files = fs.readdirSync(dir)
      .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
      .sort((a, b) => frontCoverRank(b) - frontCoverRank(a));
    if (files.length > 0) return path.join(dir, files[0]);
  } catch (e) {}

  // Deliberately no parent-directory probe. `Artist/cover.jpg` was being
  // handed to every album folder underneath that artist, so all of an artist's
  // albums rendered with the same artwork. A parent-level image is far more
  // likely to be a band photo or a logo than any one album's cover, and if it
  // is genuinely wanted it should be tagged or placed in the album folder.
  //
  // Check cache
  const cached = findCachedCover(albumId, artist, album, title);
  if (cached) return cached;

  return undefined;
}

/**
 * Lower rank sorts earlier, so front-cover-like filenames win.
 *
 * Used only to break ties between several images in one folder.
 */
function frontCoverRank(fileName: string): number {
  const f = fileName.toLowerCase();
  let rank = 100;
  // Base penalty for each disqualifying word, so "cover-back.jpg" ranks behind
  // "cover.jpg" rather than ahead of it on a single match.
  if (/\b(back|backside|disc|vinyl|cd|insert|booklet|scan|interior|inside|foldout|artwork_small|small|thumb)\b/.test(f)) {
    rank += 1000;
  }
  if (/cover|front|folder|albumart|album|artwork|thumb/.test(f)) {
    rank -= 50;
  }
  if (/^(cover|front|folder)\.(jpg|jpeg|png|webp)$/.test(f)) {
    rank -= 50;
  }
  return rank;
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

/**
 * What ffprobe can tell us about a file. `musicbrainzAlbumId` is carried
 * through because it feeds `albumId` but is not itself part of a Track.
 */
type ExtractedMetadata = Partial<Track> & { musicbrainzAlbumId?: string };

async function extractMetadata(filePath: string): Promise<ExtractedMetadata> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      "--",
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
    // The album artist is a separate tag from the track artist and has to stay
    // separate. The old code read `artist || album_artist`, which meant a file
    // tagged ARTIST=Ye / ALBUMARTIST=Kanye West reported "Ye" and lost the
    // only field that says which release it belongs to.
    const artist = tagsLower.artist || tagsLower.album_artist || tagsLower.albumartist;
    const albumArtist =
      tagsLower.album_artist ||
      tagsLower.albumartist ||
  // Vorbis comments spell it "ALBUM ARTIST" with a space, and some taggers
      // use the credit form rather than the plain one.
      tagsLower["album artist"] ||
      tagsLower.album_artist_credit ||
      tagsLower.albumartistcredit ||
      tagsLower["album artist credit"] ||
      tagsLower.album_credit ||
      tagsLower["album artist credit"];
    const album = tagsLower.album;
    const title = tagsLower.title;
    const year = tagsLower.date || tagsLower.year || tagsLower.originalyear;
    const trackNumber = parseInt(tagsLower.track || "1", 10);
    // "3/12" is the common encoding; the leading number is what matters.
    const discNumber = parseInt(
      tagsLower.disc || tagsLower.discnumber || tagsLower.discc || "0",
      10
    );
    const compilation = /^(1|yes|true)$/i.test(tagsLower.compilation || "");
    const musicbrainzAlbumId =
      tagsLower.musicbrainz_albumid || tagsLower["musicbrainz album id"] || undefined;
    let bitrate = parseInt(format.bit_rate || "0", 10);
    if ((!bitrate || isNaN(bitrate) || bitrate <= 0) && duration > 0) {
      try {
        const stat = await fs.promises.stat(filePath);
        bitrate = Math.round((stat.size * 8) / duration);
      } catch {}
    }
    const sampleRate = parseInt(stream.sample_rate || "44100", 10);
    const bitsRaw = parseInt(stream.bits_per_raw_sample || "", 10);
    const bitsGeneric = parseInt(stream.bits_per_sample || "", 10);
    const bitsPerSample = !isNaN(bitsRaw) && bitsRaw > 0
      ? bitsRaw
      : (!isNaN(bitsGeneric) && bitsGeneric > 0 ? bitsGeneric : undefined);

    // Track and album gain are separate signals and must not be collapsed: the
    // client offers both modes, and album mode is meaningless once the album
    // value has been folded into the track value. The legacy `replayGain` alias
    // still falls back track-then-album for older clients.
    //
    // `REPLAYGAIN_*_PEAK` is deliberately not read as a gain here. It is the
    // pre-normalisation sample peak, so treating it as a gain subtracts level
    // that was never there. It is still worth using, but only as a ceiling:
    // normalising to a target peak is what a peak tag is good for.
    //
    // The spec stores the peak as a LINEAR 0.0-1.0 value, and most taggers
    // follow that, but plenty write it in dBFS instead. Distinguish by range:
    // anything in (0, 1] is linear and gets converted, anything above 1 is
    // already dB. This matters in practice, because running a linear peak
    // through the dB tag parser yields 0 (the regex takes the leading "0" of
    // "0.978119"), which silently disables normalisation rather than failing.
    const REPLAYGAIN_PEAK_FLOOR_DB = -6;
    const peakToFallbackGain = (raw: unknown): number | undefined => {
      if (raw === undefined || raw === null) return undefined;
      const text = String(raw).trim();
      // "-inf" is what a digital-silence file legitimately reports, and it must
      // not become NaN on the way to 20*log10.
      if (!text || /inf|nan/i.test(text)) return undefined;
      const value = parseFloat(text);
      if (!isFinite(value) || value === 0) return undefined;
      // The spec stores the peak LINEAR in 0.0-1.0, so a positive value at or
      // below 1 is linear. Anything else is already dBFS: dB peaks are always
      // <= 0 for real audio, and > 1 only for nonsense.
      const peakDb = value > 0 && value <= 1 ? 20 * Math.log10(value) : value;
      if (!isFinite(peakDb)) return undefined;
      // Attenuate down to the floor, but never boost. A file that already peaks
      // below the floor has nothing to gain from being turned up, and doing so
      // would make a quiet track louder for no reason.
      return Math.min(0, REPLAYGAIN_PEAK_FLOOR_DB - peakDb);
    };
    const replayGainTrack = parseReplayGain(tagsLower.replaygain_track_gain) ??
      peakToFallbackGain(tagsLower["replaygain_track_peak"]);
    const replayGainAlbum = parseReplayGain(tagsLower.replaygain_album_gain);
    const replayGain = replayGainTrack ?? replayGainAlbum ??
      parseReplayGain(tagsLower["r128_track_gain"] || tagsLower["replaygain_gain"]) ??
      peakToFallbackGain(tagsLower["replaygain_track_peak"] || tagsLower["replaygain_album_peak"]);

    return {
      title,
      artist,
      albumArtist,
      album,
      year,
      trackNumber: isNaN(trackNumber) ? undefined : trackNumber,
 discNumber: isNaN(discNumber) || discNumber <= 0 ? undefined : discNumber,
      compilation: compilation || undefined,
      musicbrainzAlbumId,
      duration: isNaN(duration) ? 0 : duration,
      bitrate,
      sampleRate,
      bitsPerSample,
      replayGainTrack,
      replayGainAlbum,
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

interface CachedTrackRecord {
  mtimeMs: number;
  size: number;
  track: Track;
}

/**
 * Bump whenever the shape of `Track` or the extraction logic changes.
 *
 * The cache is validated per file by mtime and size, which correctly detects
 * edited audio but cannot detect a change in *this program's* output: an entry
 * written before `bitsPerSample` and the split ReplayGain fields existed stays
 * valid forever, and the new fields silently never appear. The version is the
 * only thing that can invalidate those. Bumping it costs one full re-probe of
 * the library.
 */
// v4 added unified albumId / extractPrimaryArtist and reworked multi-disc grouping
const LIBRARY_CACHE_VERSION = 4;

interface LibraryCacheFile {
  version: number;
  entries: Record<string, CachedTrackRecord>;
}

function loadLibraryCache(): Record<string, CachedTrackRecord> {
  try {
    if (fs.existsSync(LIBRARY_CACHE_FILE)) {
      const data = fs.readFileSync(LIBRARY_CACHE_FILE, "utf-8");
      const parsed = JSON.parse(data);
      // Pre-version caches were a bare map of path -> record. Treat anything
      // without an explicit matching version as stale rather than guessing.
      if (!parsed || typeof parsed !== "object" || typeof parsed.version !== "number" || !parsed.entries) {
        console.log(
          `[Cadence Server] Library cache format changed, rebuilding (found version ` +
          `${parsed?.version ?? "none"}, expected ${LIBRARY_CACHE_VERSION}).`
        );
        return {};
      }
      if (parsed.version !== LIBRARY_CACHE_VERSION) {
        console.log(
          `[Cadence Server] Library cache version ${parsed.version} != ${LIBRARY_CACHE_VERSION}, rebuilding.`
        );
        return {};
      }
      return parsed.entries;
    }
  } catch (err) {
    console.error("[Cadence Server] Error loading library cache:", err);
  }
  return {};
}

function saveLibraryCache(cache: Record<string, CachedTrackRecord>) {
  try {
    const payload: LibraryCacheFile = { version: LIBRARY_CACHE_VERSION, entries: cache };
    const serialised = JSON.stringify(payload);

    // Skip the write when nothing changed. This runs at the end of every launch
    // and the file is a few hundred KB, so rewriting an identical copy on every
    // start is pure I/O for no benefit. Compared against what is already on disk,
    // so a deleted or retagged file still gets written.
    try {
      if (fs.existsSync(LIBRARY_CACHE_FILE)) {
        if (fs.readFileSync(LIBRARY_CACHE_FILE, "utf-8") === serialised) return;
      }
    } catch {
      // Unreadable or malformed: fall through and rewrite it.
    }

    atomicWriteFileSync(LIBRARY_CACHE_FILE, serialised);
  } catch (err) {
    console.error("[Cadence Server] Error saving library cache:", err);
  }
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

  const startTime = Date.now();
  await walk(MUSIC_DIR);
  console.log(`[Cadence Server] Discovered ${audioFilePaths.length} audio files. Checking cache...`);

  const diskCache = loadLibraryCache();
  const nextCache: Record<string, CachedTrackRecord> = {};
  let cacheHits = 0;
  let cacheMisses = 0;

  const tracks = await mapConcurrent(audioFilePaths, 16, async (fullPath) => {
    const stats = await fs.promises.stat(fullPath);
    const cached = diskCache[fullPath];

    if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size && cached.track) {
      cacheHits++;
      nextCache[fullPath] = cached;
      return cached.track;
    }

    cacheMisses++;
    const ext = path.extname(fullPath).toLowerCase();
    const meta = await extractMetadata(fullPath);
    const rel = path.relative(MUSIC_DIR, fullPath);
    const parts = rel.split(path.sep);

    let fallbackArtist = "Unknown Artist";
    // For a file sitting directly in an artist folder with no tags, the album is
    // genuinely unknown and "Unknown Album" is the honest answer. But the
    // previous code applied the same constant to every artist, so each untagged
    // artist produced their own separate "Unknown Album" group that the UI then
    // rendered as a distinct album card. Using the artist name as the album
    // keeps untagged files grouped under one card per artist instead of
    // scattering placeholder cards through the library.
    let fallbackAlbum = "";
    let fallbackTitle = path.parse(fullPath).name;

    if (parts.length >= 3) {
      fallbackArtist = parts[0];
      fallbackAlbum = parts[1];
    } else if (parts.length === 2) {
      fallbackArtist = parts[0];
      // No album folder: fall back to the filename minus its track-number
      // prefix, which is the album far more often than it is not, and to the
      // artist folder when the file carries no number at all.
      const numbered = /^\s*\d+\s*[-._)]\s*(.+)$/.exec(path.parse(fullPath).name);
      fallbackAlbum = numbered ? numbered[1] : fallbackArtist;
    }

    const trackTitle = meta.title || fallbackTitle;
    const trackArtist = meta.artist || fallbackArtist;
    // The album artist is what identifies the release, so it is the fallback
    // for both the displayed artist on untagged files and the grouping key.
    const trackAlbumArtist = meta.albumArtist || extractPrimaryArtist(meta.artist) || fallbackArtist;
    const trackAlbum = meta.album || fallbackAlbum || "Unknown Album";
    const albumId = makeAlbumId(
      meta.musicbrainzAlbumId,
      trackAlbumArtist,
      trackAlbum,
      meta.discNumber
    );

    let coverPath = findCoverArt(fullPath, albumId, trackAlbumArtist, trackAlbum, trackTitle);
    if (!coverPath) {
      coverPath = await extractEmbeddedCover(fullPath, albumId, trackAlbumArtist, trackAlbum, trackTitle);
    }
    const { hasLyrics } = findLyrics(fullPath);

const track: Track = {
      id: Buffer.from(fullPath).toString("base64url"),
      title: trackTitle,
    artist: trackArtist,
      album: trackAlbum,
      albumArtist: trackAlbumArtist,
   albumId,
      discNumber: meta.discNumber,
      compilation: meta.compilation,
      year: meta.year,
      trackNumber: meta.trackNumber,
      duration: meta.duration || 0,
      format: ext.replace(".", "").toUpperCase(),
      bitrate: meta.bitrate,
      sampleRate: meta.sampleRate,
      bitsPerSample: meta.bitsPerSample,
      filePath: fullPath,
      coverPath,
      hasLyrics,
      size: stats.size,
      replayGainTrack: meta.replayGainTrack,
      replayGainAlbum: meta.replayGainAlbum,
      replayGain: meta.replayGain
    };

    nextCache[fullPath] = {
      mtimeMs: stats.mtimeMs,
      size: stats.size,
      track
    };

    return track;
  });

  saveLibraryCache(nextCache);
  console.log(`[Cadence Server] Library scan complete in ${Date.now() - startTime}ms (${cacheHits} cache hits, ${cacheMisses} parsed).`);

  return tracks.sort((a, b) => {
    if (a.artist !== b.artist) return a.artist.localeCompare(b.artist);
    // Sort on the stable album identity, not the display name. Two tracks from
  // the same release can carry different album spellings, and sorting on the
  // spelling would interleave them.
    if (a.albumId !== b.albumId) return a.albumId.localeCompare(b.albumId);
  if (a.album !== b.album) return a.album.localeCompare(b.album);
    // Disc before track, or the two halves of a two-disc set interleave.
    if ((a.discNumber || 1) !== (b.discNumber || 1)) {
      return (a.discNumber || 1) - (b.discNumber || 1);
    }
    return (a.trackNumber || 0) - (b.trackNumber || 0);
  });
}

scanCompletePromise = (async () => {
  console.log(`[Cadence Server] Scanning library at ${MUSIC_DIR}...`);
  cachedTracks = await scanLibrary();
  console.log(`[Cadence Server] Cached ${cachedTracks.length} tracks.`);
  if (global.gc) {
    try { global.gc(); } catch {}
  }
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

app.all("/api/rescan", async (req, res) => {
  if (isScanning) return res.status(429).json({ message: "Scan already in progress" });
  isScanning = true;
  try {
    cachedTracks = await scanLibrary();
    broadcastCtl({ type: "library_updated" });
    res.json({ count: cachedTracks.length, tracks: cachedTracks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    isScanning = false;
  }
});

/**
 * Remote Control SSE Engine & Playback Bridge.
 *
 * Each entry owns a socket, so the array is a bounded resource and is treated
 * as one. `push` refuses the connection rather than growing without limit, and
 * `broadcastCtl` counts its own failures so a client that has stopped reading
 * is dropped instead of being written to forever.
 */
const MAX_CTL_CLIENTS = 16;

interface CtlClient {
  send: (data: string) => boolean;
  id: number;
}

const ctlClients: CtlClient[] = [];
let ctlClientSeq = 0;

function removeCtlClient(id: number) {
  const idx = ctlClients.findIndex(c => c.id === id);
  if (idx !== -1) ctlClients.splice(idx, 1);
}

let currentPlaybackState: any = { status: "stopped", currentTrack: null, currentTime: 0, duration: 0, lastUpdated: Date.now() };
const discordRpc = new DiscordRpc();
discordRpc.connect();

/**
 * Discord presence is throttled to whole seconds.
 *
 * The client already reports state at second granularity, but the same route is
 * also hit by `cadence-ctl` and by any LAN caller, and Discord's own guidance is
 * that SET_ACTIVITY is not a per-frame operation. Each call writes a frame to
 * the IPC socket, so an unthrottled stream of them competes with actual audio
 * delivery for the same process.
 */
let lastDiscordActivitySecond = -1;
let lastDiscordActivitySignature = "";

function updateDiscordActivity(state: any) {
  if (state.status !== "playing" || !state.currentTrack) {
    discordRpc.clearActivity();
    lastDiscordActivitySignature = "";
    lastDiscordActivitySecond = -1;
    return;
  }
  const track = state.currentTrack;
  const now = Math.floor(Date.now() / 1000);
  const position = Math.floor(state.currentTime || 0);

  // Only the start/end timestamps actually change second to second. If nothing
  // visible to the user differs, skip the socket write entirely.
  const duration = Math.floor(state.duration || track.duration || 0);
  const start = now - position;
  const signature = `${track.id || track.title}|${start}|${duration}`;
  if (signature === lastDiscordActivitySignature) return;
  const secondBucket = Math.floor(now);
  if (secondBucket === lastDiscordActivitySecond) return;
  lastDiscordActivitySecond = secondBucket;
  lastDiscordActivitySignature = signature;

  discordRpc.setActivity({
    details: track.title,
    state: `${track.artist || "Unknown Artist"}${track.album ? ` • ${track.album}` : ""}`,
    timestamps: { start, ...(duration > 0 ? { end: start + duration } : {}) },
    assets: {
      large_image: "cadence_logo",
      large_text: "Cadence Studio",
      small_image: "playing",
      small_text: `${track.format || "Audio"} • 32-bit DSP`,
    },
    instance: false,
  });
}

process.on("SIGTERM", () => discordRpc.destroy());
let favoritesUpdatedAt = Date.now();
let playlistsUpdatedAt = Date.now();

/**
 * Fan a payload out to every remote-control client.
 *
 * `send` reports failure, and a failure means the socket is gone. The previous
 * version swallowed errors and left the entry in place, so a client that had
 * errored or stopped reading stayed in the array for the life of the process
 * and was written to on every subsequent broadcast. Pruning on failure is what
 * keeps the client list honest.
 */
export function broadcastCtl(payload: any) {
  const str = typeof payload === "string" ? payload : JSON.stringify(payload);

  // A broadcast is an amplifier: one request body becomes N socket writes. Cap
  // the frame so a single large request cannot be multiplied across every idle
  // client at once.
  if (str.length > 64 * 1024) {
    console.warn("[Cadence Server] Refusing oversized control broadcast:", str.length, "bytes");
    return;
  }

  const dead: number[] = [];
  for (const client of ctlClients) {
    try {
      if (!client.send(str)) dead.push(client.id);
    } catch {
      dead.push(client.id);
    }
  }
  for (const id of dead) removeCtlClient(id);
}

// Playlists API
app.get("/api/playlists", (_req, res) => {
  const playlists = loadPlaylists();
  res.json({ playlists });
});

app.post("/api/playlists", (req, res) => {
  const { name, description, trackIds } = req.body;
  if (!name || typeof name !== "string" || name.trim().length === 0 || name.length > 255) {
    return res.status(400).json({ error: "Valid playlist name (max 255 chars) is required" });
  }
  const cleanDescription = typeof description === "string" ? description.slice(0, 2000).trim() : "";
  const cleanTrackIds = Array.isArray(trackIds)
    ? trackIds.filter((id): id is string => typeof id === "string" && id.length <= 1024).slice(0, 10000)
    : [];

  const playlists = loadPlaylists();
  const newPlaylist: Playlist = {
    id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    description: cleanDescription,
    trackIds: cleanTrackIds,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  playlists.push(newPlaylist);
  savePlaylists(playlists);
  playlistsUpdatedAt = Date.now();
  broadcastCtl({ type: "playlists_updated", playlists, timestamp: playlistsUpdatedAt });
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
  const cleanName = (typeof name === "string" && name.trim().length > 0) ? name.slice(0, 255).trim() : existing.name;
  const cleanDesc = typeof description === "string" ? description.slice(0, 2000).trim() : existing.description;
  const cleanTrackIds = Array.isArray(trackIds)
    ? trackIds.filter((t): t is string => typeof t === "string" && t.length <= 1024).slice(0, 10000)
    : existing.trackIds;

  const updated: Playlist = {
    ...existing,
    name: cleanName,
    description: cleanDesc,
    trackIds: cleanTrackIds,
    updatedAt: Date.now()
  };
  playlists[index] = updated;
  savePlaylists(playlists);
  playlistsUpdatedAt = Date.now();
  broadcastCtl({ type: "playlists_updated", playlists, timestamp: playlistsUpdatedAt });
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
  playlistsUpdatedAt = Date.now();
  broadcastCtl({ type: "playlists_updated", playlists, timestamp: playlistsUpdatedAt });
  res.json({ success: true, id });
});

// Favorites API (Cross-Device Bi-Directional Synchronization)
app.get("/api/favorites", (_req, res) => {
  const favorites = loadFavorites();
  res.json({ favorites });
});

app.post("/api/favorites", (req, res) => {
  const { trackId, action, favorites: newFavorites } = req.body;
  let favorites = loadFavorites();

  if (Array.isArray(newFavorites)) {
    favorites = Array.from(new Set(newFavorites.filter((id): id is string => typeof id === "string" && id.length <= 1024))).slice(0, 20000);
  } else if (trackId && typeof trackId === "string" && trackId.length <= 1024) {
    if (action === "remove") {
      favorites = favorites.filter(id => id !== trackId);
    } else if (action === "add") {
      if (!favorites.includes(trackId)) favorites.push(trackId);
    } else {
      // Toggle
      if (favorites.includes(trackId)) {
        favorites = favorites.filter(id => id !== trackId);
      } else {
        favorites.push(trackId);
      }
    }
  }

  saveFavorites(favorites);
  favoritesUpdatedAt = Date.now();
  broadcastCtl({ type: "favorites_updated", favorites, timestamp: favoritesUpdatedAt });
  res.json({ favorites });
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

// Settings API (persistent to ~/.config/cadence/settings.json)
app.get("/api/settings", (_req, res) => {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, "utf-8");
      return res.json({ settings: JSON.parse(data) });
    }
  } catch (err) {
    console.error("[Cadence Server] Error reading settings:", err);
  }
  res.json({ settings: null });
});

function sanitizeSettingsObject(obj: any): Record<string, any> {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    if (typeof k !== "string" || k.length > 64) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) {
      if (typeof v === "string" && v.length > 4096) continue;
      clean[k] = v;
    } else if (Array.isArray(v)) {
      clean[k] = v.filter(item => typeof item === "string" || typeof item === "number" || typeof item === "boolean").slice(0, 1000);
    } else if (typeof v === "object" && v !== null) {
      clean[k] = sanitizeSettingsObject(v);
    }
  }
  return clean;
}

app.post("/api/settings", (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ error: "Invalid settings payload" });
    }
    const cleanSettings = sanitizeSettingsObject(req.body);
    const serialized = JSON.stringify(cleanSettings, null, 2);
    if (serialized.length > 512 * 1024) {
      return res.status(413).json({ error: "Settings payload exceeds allowable limit (512KB)" });
    }
    if (!fs.existsSync(USER_DATA_DIR)) {
      fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    }
    atomicWriteFileSync(SETTINGS_FILE, serialized);
    res.json({ success: true });
  } catch (err) {
    console.error("[Cadence Server] Error saving settings:", err);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

// Update Checker API
app.get("/api/update-check", (_req, res) => {
  res.json({
    currentVersion: "3.0.0",
    latestVersion: "3.0.0",
    updateAvailable: false,
    channel: "stable",
    lastChecked: Date.now(),
    releaseNotes: "Cadence 3.0: Apple Inset Grouped Settings, zero-latency synchronized lyrics engine, high-resolution vector spectrum analyzer, authentic metallic optical disc deck, and customizable player bar dock themes."
  });
});

app.get("/api/lyrics", async (req, res) => {
  const filePath = req.query.path as string;
  const title = (req.query.title as string) || "";
  const artist = (req.query.artist as string) || "";
  const album = (req.query.album as string) || "";
  const duration = parseFloat(req.query.duration as string) || 0;
  const forceRefresh = req.query.refresh === "true" || req.query.force === "true";

  // Validate filePath to prevent path traversal outside music collection
  const safePath = (filePath && isAudioPathAllowed(filePath)) ? filePath : "";

  try {
    const result = await getLyricsForTrack(safePath, artist, title, album, duration, forceRefresh);
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
  const forceRefresh = req.query.refresh === "true" || req.query.force === "true";

  try {
    const result = await getLyricsForTrack("", artist, title, album, duration, forceRefresh);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/lyrics/search", async (req, res) => {
  const title = (req.query.title as string) || "";
  const artist = (req.query.artist as string) || "";
  const duration = parseFloat(req.query.duration as string) || 0;

  try {
    const candidates = await searchLyricsCandidates(artist, title, duration);
    res.json({ candidates });
  } catch (err: any) {
    res.status(500).json({ error: err.message, candidates: [] });
  }
});

app.post("/api/lyrics/save", async (req, res) => {
  const { artist, title, lrc, plain } = req.body;
  if (!artist || !title || (!lrc && !plain)) {
    return res.status(400).json({ error: "Missing required artist, title, or lyrics content" });
  }

  if (typeof artist !== "string" || typeof title !== "string") {
    return res.status(400).json({ error: "Artist and title must be strings" });
  }
  if (artist.length > 255 || title.length > 255) {
    return res.status(400).json({ error: "Artist or title parameter exceeds length limit" });
  }
  const content = lrc || plain;
  if (typeof content !== "string") {
    return res.status(400).json({ error: "Lyrics content must be a string" });
  }
  if (content.length > 131072) {
    return res.status(413).json({ error: "Lyrics content exceeds maximum allowed size (128KB)" });
  }

  try {
    const cacheFile = getCacheKey(artist, title);
    // Owner-only: lyrics can be personal, and this endpoint is reachable by
    // anything that can talk to the server.
    fs.writeFileSync(cacheFile, content, { encoding: "utf-8", mode: 0o600 });
    try { fs.chmodSync(cacheFile, 0o600); } catch {}
    const lines = lrc ? parseLrc(lrc) : plain.split(/\r?\n/).map((text: string, idx: number) => ({ time: idx * 4, text }));
    res.json({ status: "ok", cached: true, synced: !!lrc, lines });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.options("/stream", (req, res) => {
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range, Accept-Ranges, Content-Type");
  res.sendStatus(200);
});

app.get("/stream", (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath || !isAudioPathAllowed(filePath) || !fs.existsSync(filePath)) {
    return res.status(404).send("File not found or access denied");
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

  res.setHeader("Access-Control-Allow-Headers", "Range, Accept-Ranges, Content-Type");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
  res.setHeader("Accept-Ranges", "bytes");

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || isNaN(end) || start < 0 || end < start || start >= fileSize) {
      res.setHeader("Content-Range", `bytes */${fileSize}`);
      return res.status(416).send("Requested range not satisfiable");
    }

    const safeEnd = Math.min(end, fileSize - 1);
    const chunksize = safeEnd - start + 1;
    const file = fs.createReadStream(filePath, { start, end: safeEnd });
    req.on("close", () => file.destroy());
    
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${safeEnd}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    const file = fs.createReadStream(filePath);
    req.on("close", () => file.destroy());
    file.pipe(res);
  }
});

app.get("/covers", async (req, res) => {
  const coverPath = req.query.path as string;
  const albumId = req.query.albumId as string;
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
  if (coverPath && isCoverPathAllowed(coverPath) && fs.existsSync(coverPath)) {
    const ext = path.extname(coverPath).toLowerCase();
    res.setHeader("Content-Type", mimeTypes[ext] || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return fs.createReadStream(coverPath).pipe(res);
  }

  // 2. Cached or online auto-fetched cover
  if (artist || album || title) {
    const cachedOrOnline = await fetchOnlineAlbumCover(albumId, artist, album, title);
    if (cachedOrOnline && fs.existsSync(cachedOrOnline)) {
      const ext = path.extname(cachedOrOnline).toLowerCase();
      res.setHeader("Content-Type", mimeTypes[ext] || "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return fs.createReadStream(cachedOrOnline).pipe(res);
    }
  }

  const accent = (req.query.accent as string) || (req.query.color as string) || "#38bdf8";
  const cleanAccent = /^#[0-9a-fA-F]{3,8}$/.test(accent) ? accent : "#38bdf8";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
    <defs>
      <radialGradient id="grad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#181a20" />
        <stop offset="60%" stop-color="#0e1015" />
        <stop offset="90%" stop-color="#08090c" />
        <stop offset="100%" stop-color="#040507" />
      </radialGradient>
      <radialGradient id="labelGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${cleanAccent}" stop-opacity="0.9" />
        <stop offset="70%" stop-color="${cleanAccent}" stop-opacity="0.75" />
        <stop offset="100%" stop-color="#0a0b10" stop-opacity="0.95" />
      </radialGradient>
      <linearGradient id="sheen" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.18)" />
        <stop offset="45%" stop-color="rgba(255,255,255,0.01)" />
        <stop offset="55%" stop-color="rgba(255,255,255,0.01)" />
        <stop offset="100%" stop-color="rgba(255,255,255,0.18)" />
      </linearGradient>
    </defs>
    <!-- Vinyl Disc Outer Body -->
    <circle cx="150" cy="150" r="146" fill="url(#grad)" stroke="#222530" stroke-width="2"/>
    
    <!-- Microgrooves -->
    <circle cx="150" cy="150" r="134" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
    <circle cx="150" cy="150" r="122" fill="none" stroke="rgba(0,0,0,0.6)" stroke-width="1.5"/>
    <circle cx="150" cy="150" r="110" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
    <circle cx="150" cy="150" r="98" fill="none" stroke="rgba(0,0,0,0.6)" stroke-width="1.5"/>
    <circle cx="150" cy="150" r="86" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
    <circle cx="150" cy="150" r="74" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="1"/>
    
    <!-- Center Label Platter -->
    <circle cx="150" cy="150" r="58" fill="url(#labelGrad)" stroke="${cleanAccent}" stroke-width="1.5" stroke-opacity="0.8"/>
    <circle cx="150" cy="150" r="52" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.8" stroke-dasharray="2,2"/>
    
    <!-- Center Spindle & Ring -->
    <circle cx="150" cy="150" r="16" fill="#0b0c10" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
    <circle cx="150" cy="150" r="6" fill="#000" />
    
    <!-- Conic Sheen Reflection -->
    <circle cx="150" cy="150" r="146" fill="url(#sheen)"/>
    
    <!-- Studio Branding Typography -->
    <text x="150" y="124" text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="system-ui, -apple-system, sans-serif" font-weight="600" font-size="6.5" letter-spacing="2">33⅓ RPM • HI-FI</text>
    <text x="150" y="142" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="13" letter-spacing="3.5">CADENCE</text>
    <text x="150" y="168" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-family="system-ui, -apple-system, sans-serif" font-weight="600" font-size="6" letter-spacing="1.5">AUDIO ENGINE</text>
  </svg>`;

  res.setHeader("Content-Type", "image/svg+xml");
  res.send(svg);
});

app.get("/api/ctl/events", (req, res) => {
  if (ctlClients.length >= MAX_CTL_CLIENTS) {
    // Refusing here is the whole point: every connection below this line pins a
    // file descriptor and a timer, and there was previously nothing stopping an
    // unauthenticated peer from opening as many as it liked.
    res.setHeader("Retry-After", "5");
    return res.status(503).json({ error: `Too many remote-control clients (max ${MAX_CTL_CLIENTS})` });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const id = ++ctlClientSeq;

  // Return false when the socket can no longer accept data. `res.write` does not
  // throw on a dead peer, it just returns false and buffers, which is how a
  // client that stopped reading used to accumulate memory indefinitely.
  const write = (chunk: string): boolean => {
    try {
      return res.write(chunk) !== false;
    } catch {
      return false;
    }
  };

  // Only `data:` frames are delivered to the client's `onmessage`. The
  // keep-alive is an SSE comment and must stay outside `send`, or the renderer
  // would receive ": keep-alive" as a playback command.
  const send = (data: string): boolean => write(`data: ${data}\n\n`);

  ctlClients.push({ send, id });
  send(JSON.stringify({ type: "init", state: currentPlaybackState }));

  const keepAlive = setInterval(() => {
    if (!write(": keep-alive\n\n")) {
      clearInterval(keepAlive);
      removeCtlClient(id);
    }
  }, 15000);

  const cleanup = () => {
    clearInterval(keepAlive);
    removeCtlClient(id);
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
  res.on("error", cleanup);
});

app.post("/api/ctl/playback", (req, res) => {
  const body = req.body || {};

  // A track supplied inline is only honoured if it matches a real library
  // entry, so a forged `filePath` cannot make the player read an arbitrary path.
  let track = resolveTrackFromRequest(body.track);

  if (!track && body.trackId) {
    track = cachedTracks.find(t => t.id === body.trackId);
  }

  if (!track && body.query) {
    const q = (body.query || "").toLowerCase().trim();
    const tokens = q.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w: string) => w.length > 1);

    // Exact / Substring match
    track = cachedTracks.find(t =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.album.toLowerCase().includes(q) ||
      t.filePath.toLowerCase().includes(q)
    );

    // Multi-token fuzzy match
    if (!track && tokens.length > 0) {
      let bestScore = 0;
      for (const t of cachedTracks) {
        const text = `${t.title} ${t.artist} ${t.album} ${t.filePath}`.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
        let score = 0;
        for (const tok of tokens) {
          if (text.includes(tok)) score += 1;
        }
        if (score > bestScore) {
          bestScore = score;
          track = t;
        }
      }
    }
  }

  if (track && body.action === "play") {
    currentPlaybackState = {
      ...currentPlaybackState,
      status: "playing",
      currentTrack: track,
      currentTime: 0,
      duration: track.duration || 0,
      lastUpdated: Date.now()
    };
  } else if (body.action === "next" && cachedTracks.length > 0) {
    const currentIdx = cachedTracks.findIndex((t) => t.id === currentPlaybackState.currentTrack?.id);
    const nextIdx = (currentIdx + 1) % cachedTracks.length;
    track = cachedTracks[nextIdx];
    currentPlaybackState = {
      ...currentPlaybackState,
      status: "playing",
      currentTrack: track,
      currentTime: 0,
      duration: track.duration || 0,
      lastUpdated: Date.now()
    };
  } else if (body.action === "previous" && cachedTracks.length > 0) {
    const currentIdx = cachedTracks.findIndex((t) => t.id === currentPlaybackState.currentTrack?.id);
    const prevIdx = (currentIdx - 1 + cachedTracks.length) % cachedTracks.length;
    track = cachedTracks[prevIdx];
    currentPlaybackState = {
      ...currentPlaybackState,
      status: "playing",
      currentTrack: track,
      currentTime: 0,
      duration: track.duration || 0,
      lastUpdated: Date.now()
    };
  } else if (body.action === "toggle") {
    currentPlaybackState = {
      ...currentPlaybackState,
      status: currentPlaybackState.status === "playing" ? "paused" : "playing",
      lastUpdated: Date.now()
    };
  } else if (body.action === "pause") {
    currentPlaybackState = {
      ...currentPlaybackState,
      status: "paused",
      lastUpdated: Date.now()
    };
  } else if (body.action === "seek" && typeof body.time === "number" && Number.isFinite(body.time)) {
    currentPlaybackState = {
      ...currentPlaybackState,
      currentTime: Math.max(0, body.time),
      lastUpdated: Date.now()
    };
  } else if (body.action === "volume" && typeof body.volume === "number") {
    currentPlaybackState = {
      ...currentPlaybackState,
      volume: Number.isFinite(body.volume) ? Math.max(0, Math.min(1, body.volume)) : 0,
      lastUpdated: Date.now()
    };
  } else if (body.action === "shuffle" && typeof body.shuffle === "boolean") {
    currentPlaybackState = {
      ...currentPlaybackState,
      shuffle: body.shuffle,
      lastUpdated: Date.now()
    };
  } else if (body.action === "repeat" && typeof body.repeat === "string" && ["off", "all", "one"].includes(body.repeat)) {
    currentPlaybackState = {
      ...currentPlaybackState,
      repeat: body.repeat,
      lastUpdated: Date.now()
    };
  }

  const payload = { type: "playback-command", ...body, track, trackId: track ? track.id : body.trackId, timestamp: Date.now() };
  broadcastCtl(payload);

  // The echo used to return the entire request body, which made a 10 MB POST
  // into a 10 MB response for no benefit. The caller already knows what it sent.
  res.json({ success: true, clientsNotified: ctlClients.length, track });
});

/**
 * Coerce a caller-supplied track reference into a real library entry.
 *
 * The bridge used to accept `body.track` verbatim and hand it to the renderer,
 * which streams `track.filePath` straight from disk. Any peer could therefore
 * name an arbitrary path and make the desktop app load it. Resolving against the
 * scanned library means a forged object cannot introduce a path that the library
 * scan never produced.
 */
function resolveTrackFromRequest(candidate: any) {
  if (!candidate || typeof candidate !== "object") return undefined;
  const id = typeof candidate.id === "string" ? candidate.id : undefined;
  if (id) {
    const byId = cachedTracks.find(t => t.id === id);
    if (byId) return byId;
  }
  const filePath = typeof candidate.filePath === "string" ? candidate.filePath : undefined;
  if (filePath) {
    const byPath = cachedTracks.find(t => t.filePath === filePath);
    if (byPath) return byPath;
  }
  return undefined;
}

/**
 * Build a playback state from a caller-supplied object, keeping only fields we
 * recognise and only with the types each consumer expects.
 */
function sanitizePlaybackState(input: any) {
  const src = input && typeof input === "object" ? input : {};
  const state: any = { ...currentPlaybackState, lastUpdated: Date.now() };

  if (typeof src.status === "string" && ["playing", "paused", "stopped"].includes(src.status)) {
    state.status = src.status;
  }
  if (typeof src.currentTime === "number" && Number.isFinite(src.currentTime)) {
    state.currentTime = Math.max(0, src.currentTime);
  }
  if (typeof src.duration === "number" && Number.isFinite(src.duration)) {
    state.duration = Math.max(0, src.duration);
  }
  if (typeof src.volume === "number" && Number.isFinite(src.volume)) {
    state.volume = Math.min(1, Math.max(0, src.volume));
  }
  if (typeof src.shuffle === "boolean") state.shuffle = src.shuffle;
  if (typeof src.repeat === "string" && ["off", "all", "one"].includes(src.repeat)) {
    state.repeat = src.repeat;
  }
  if (src.currentTrack !== undefined) {
    state.currentTrack = resolveTrackFromRequest(src.currentTrack) ?? null;
  }
  return state;
}

app.post("/api/ctl/state", (req, res) => {
  // Previously the whole body was spread in, so any caller could set the
  // server's canonical state to an arbitrary object and have it surface in the
  // CLI status line and the user's Discord presence.
  currentPlaybackState = sanitizePlaybackState(req.body);
  updateDiscordActivity(currentPlaybackState);
  broadcastCtl({ type: "state-update", state: currentPlaybackState });
  res.json({ success: true });
});

app.get("/api/ctl/state", (_req, res) => {
  res.json({
    ...currentPlaybackState,
    favoritesUpdatedAt,
    playlistsUpdatedAt,
  });
});

app.get("/api/now-playing", (_req, res) => {
  res.json({
    isRunning: true,
    isPlaying: currentPlaybackState?.status === "playing",
    ...currentPlaybackState,
    favoritesUpdatedAt,
    playlistsUpdatedAt,
  });
});

function getLocalIpAddresses(): string[] {
  const nets = os.networkInterfaces();
  const results: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results;
}

app.get("/api/ping", (_req, res) => {
  res.json({
    status: "ok",
    app: "cadence",
    name: "Cadence Laptop",
    hostname: os.hostname(),
    port: PORT,
    version: "2.2.0",
    addresses: getLocalIpAddresses(),
  });
});

app.get("/api/discovery", (_req, res) => {
  res.json({
    status: "ok",
    app: "cadence",
    name: "Cadence Laptop",
    hostname: os.hostname(),
    port: PORT,
    version: "2.2.0",
    addresses: getLocalIpAddresses(),
    playback: currentPlaybackState,
  });
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

/**
 * Network exposure.
 *
 * The default is loopback only. This is the single most consequential default in
 * the file: the server has no per-user authentication of its own, so binding a
 * wide interface means every host on the network inherits the full library,
 * the settings, and remote playback control. Reaching a loopback port already
 * requires local code execution, so nothing is given up.
 *
 * `CADENCE_LAN=1` is the explicit opt-in. It enables the token gate installed
 * earlier in the middleware chain, so opting in is never a naked exposure.
 */
const discoveryServer = new DiscoveryServer(PORT);
if (isLanExposed()) {
  getServerToken();
  discoveryServer.start();
  console.log("[Cadence Server] Discovery beacon: enabled (LAN mode)");
} else {
  console.log("[Cadence Server] Discovery beacon: disabled (loopback-only)");
}

// Cap concurrent sockets. A streaming server legitimately holds a handful, and
// an unbounded number is a cheap denial-of-service primitive.
//
// One listener per loopback family, because Chromium resolves `localhost` to
// `::1` on this host and does not retry IPv4. If the IPv6 bind fails because
// IPv6 is unavailable, that is logged and the IPv4 listener carries the app.
const bindHosts = getBindHosts();
const listeners: import("http").Server[] = [];

for (const host of bindHosts) {
  try {
    const server = app.listen(PORT, host);
    server.maxConnections = 128;
    server.headersTimeout = 20000;
    server.requestTimeout = 30000;
    server.on("error", (err) => {
      console.error(`[Cadence Audio Server] Listen failed on ${host}:${PORT}:`, err.message);
    });
    listeners.push(server);
  } catch (err: any) {
    console.error(`[Cadence Audio Server] Could not bind ${host}:${PORT}:`, err.message);
  }
}

if (listeners.length === 0) {
  console.error(`[Cadence Audio Server] FATAL: no listener could bind port ${PORT}`);
  process.exit(1);
}

if (isLanExposed()) {
  console.log(`[Cadence Audio Server] Running on http://0.0.0.0:${PORT} (LAN mode, token required)`);
  console.log("[Cadence Audio Server] Access token: ~/.config/cadence/lan-token");
} else {
  console.log(`[Cadence Audio Server] Running on http://localhost:${PORT} (loopback only, ${listeners.length} listener(s))`);
  console.log("[Cadence Audio Server] Set CADENCE_LAN=1 to expose on the network");
}
