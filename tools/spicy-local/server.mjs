// Cadence Local "Spicy" Lyrics Provider
//
// Implements the Cadence client's Spicy Lyrics contract on localhost:
//   POST /query  { operation: "lyrics", trackName, artistName }
//   -> { lyrics?: string (LRC or plain), isInstrumental?: boolean }
//
// Lyric source: the public LRCLIB API (https://lrclib.net) — line-synced LRC
// where available, plain text otherwise. This is NOT Spotify/Apple-sourced
// SpicyLyrics; the label "spicy" here is Cadence's provider slot for a
// self-hosted/proxied endpoint, and this server fills that slot with a
// network-only LRCLIB-backed fallback. No lyrics are cached to disk.
//
// Run: node tools/spicy-local/server.mjs   (env PORT, default 5000)

import http from "node:http";

const PORT = parseInt(process.env.PORT || "5000", 10);
const LRC_API = "https://lrclib.net/api/get";
const UA = "Cadence-AudioPlayer/2.2.0 (https://github.com/DRNZY/Cadence)";

const cache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;

function clean(s) {
  return String(s || "")
    .replace(/\.[A-Za-z0-9]+$/, "")
    .replace(/^[\d\s.\-_]+/, "")
    .replace(/\[(official|audio|video|lyrics|hd|4k|remastered|remaster|live|mono|stereo|flac|24bit|explicit|clean|prod\..*?)\]/gi, "")
    .replace(/\((official|audio|video|lyrics|hd|4k|remastered|remaster|live|mono|stereo|flac|24bit|explicit|clean|prod\..*?)\)/gi, "")
    .replace(/[(\[]?(?:feat\.?|ft\.?|featuring|with)\s+[^)\]]+[)\]]?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function queryLrclib(artist, track) {
  const key = `${artist}|${track}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) return hit.data;

  const url = `${LRC_API}?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(track)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB responded ${res.status}`);
  const data = await res.json();
  cache.set(key, { t: Date.now(), data });
  return data;
}

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ");
}

function titleSimilar(a, b) {
  const A = normalize(a).split(/\s+/).filter(Boolean);
  const B = normalize(b).split(/\s+/).filter(Boolean);
  if (A.length === 0 || B.length === 0) return 0;
  if (A.join(" ") === B.join(" ")) return 1;
  const overlap = A.filter((w) => B.includes(w)).length;
  return overlap / Math.max(A.length, B.length);
}

function artistSimilar(a, b) {
  const A = normalize(a).split(/\s+/).filter(Boolean);
  const B = normalize(b).split(/\s+/).filter(Boolean);
  if (A.length === 0 || B.length === 0) return 0;
  if (A.join(" ") === B.join(" ")) return 1;
  const overlap = A.filter((w) => B.includes(w)).length;
  return overlap / Math.max(A.length, B.length);
}

async function searchLrclib(artist, track) {
  const q = `${artist} ${track}`.trim();
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok || res.status !== 503) break;
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  if (!res.ok) throw new Error(`LRCLIB search responded ${res.status}`);
  const items = await res.json();
  if (!Array.isArray(items)) return null;

  const ranked = items
    .map((item) => {
      const ts = titleSimilar(track, item.trackName || item.name || "");
      const as = artistSimilar(artist, item.artistName || "");
      const score = ts * 0.6 + as * 0.4;
      return { item, score };
    })
    .filter((r) => r.score >= 0.6)
    .sort((a, b) => b.score - a.score || (b.item.syncedLyrics ? 1 : 0) - (a.item.syncedLyrics ? 1 : 0) || b.item.duration - a.item.duration);

  return ranked[0]?.item || null;
}

async function resolveLyrics(artist, track) {
  let data = await queryLrclib(artist, track);
  if (!data) {
    try {
      data = await searchLrclib(artist, track);
    } catch {}
  }
  return data;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const started = Date.now();
  res.on("finish", () => {
    console.log(`[req] ${req.method} ${req.url} -> ${res.statusCode} in ${Date.now() - started}ms`);
  });

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200);
    return res.end(JSON.stringify({ status: "ok", provider: "cadence-local-spicy (LRCLIB-backed)", port: PORT }));
  }

  if (req.method === "POST" && req.url === "/query") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed = {};
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "invalid JSON" }));
    }

    if (parsed.operation !== "lyrics") {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: `unsupported operation: ${parsed.operation}` }));
    }

    const artist = clean(parsed.artistName);
    const track = clean(parsed.trackName);
    if (!artist || !track) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "missing artistName/trackName" }));
    }

    try {
      const data = await resolveLyrics(artist, track);
      if (!data) {
        res.writeHead(404);
        return res.end(JSON.stringify({ error: "not found", isInstrumental: false }));
      }
      if (data.instrumental) {
        return res.end(JSON.stringify({ isInstrumental: true }));
      }
      const lyrics = data.syncedLyrics || data.plainLyrics || "";
      res.writeHead(200);
      return res.end(JSON.stringify({ lyrics, isInstrumental: false, providerSource: "lrclib" }));
    } catch (err) {
      console.error("[req] /query error:", err.message);
      res.writeHead(502);
      return res.end(JSON.stringify({ error: err.message, isInstrumental: false }));
    }
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "not found" }));
});

process.on("uncaughtException", (err) => {
  console.error("[cadence-local-spicy] uncaught:", err.stack || err);
});
process.on("unhandledRejection", (err) => {
  console.error("[cadence-local-spicy] unhandled:", err);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[cadence-local-spicy] listening on http://127.0.0.1:${PORT} (LRCLIB-backed /query)`);
});