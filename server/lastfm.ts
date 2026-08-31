import express from "express";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

export const lastFmRouter = express.Router();

const USER_DATA_DIR = path.join(process.env.HOME || os.homedir(), ".config", "cadence");
const LASTFM_CONFIG_FILE = path.join(USER_DATA_DIR, "lastfm.json");

// Default Community Scrobbler credentials (users can override with their own developer key)
const DEFAULT_API_KEY = "b25b959554ed76058ac220b7b2e0a026";
const DEFAULT_API_SECRET = "425b42d1350d7720119518b9f0456de1";
const LASTFM_API_URL = "https://ws.audioscrobbler.com/2.0/";

export interface LastFmConfig {
  enabled: boolean;
  username?: string;
  sessionKey?: string;
  apiKey?: string;
  apiSecret?: string;
  scrobblePercentage?: number; // default 50%
}

export function loadLastFmConfig(): LastFmConfig {
  try {
    if (fs.existsSync(LASTFM_CONFIG_FILE)) {
      const data = fs.readFileSync(LASTFM_CONFIG_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn("[Last.fm] Could not load config:", err);
  }
  return {
    enabled: false,
    scrobblePercentage: 50
  };
}

export function saveLastFmConfig(config: LastFmConfig) {
  try {
    if (!fs.existsSync(USER_DATA_DIR)) {
      fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LASTFM_CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    console.error("[Last.fm] Could not save config:", err);
  }
}

let lastFmConfig = loadLastFmConfig();

function getActiveApiKey(customKey?: string): string {
  return (customKey || lastFmConfig.apiKey || DEFAULT_API_KEY).trim();
}

function getActiveSecret(customSecret?: string): string {
  return (customSecret || lastFmConfig.apiSecret || DEFAULT_API_SECRET).trim();
}

// Generate Last.fm MD5 API Signature
export function generateApiSignature(params: Record<string, any>, secret: string): string {
  const keys = Object.keys(params)
    .filter(k => k !== "format" && k !== "callback" && k !== "api_sig" && params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort();

  let str = "";
  for (const k of keys) {
    str += `${k}${params[k]}`;
  }
  str += secret;

  return crypto.createHash("md5").update(str, "utf8").digest("hex");
}

// Call Last.fm 2.0 API with signature
export async function callLastFm(method: string, params: Record<string, any> = {}, isPost = true) {
  const apiKey = getActiveApiKey(params.apiKey);
  const apiSecret = getActiveSecret(params.apiSecret);

  // Clean params
  delete params.apiKey;
  delete params.apiSecret;

  const payload: Record<string, any> = {
    method,
    api_key: apiKey,
    ...params
  };

  const apiSig = generateApiSignature(payload, apiSecret);
  payload.api_sig = apiSig;
  payload.format = "json";

  const formBody = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined && v !== null) {
      formBody.append(k, String(v));
    }
  }

  const url = isPost ? LASTFM_API_URL : `${LASTFM_API_URL}?${formBody.toString()}`;
  const options: RequestInit = isPost
    ? {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody.toString()
      }
    : { method: "GET" };

  const res = await fetch(url, options);
  const data = await res.json();

  if (data.error) {
    throw new Error(data.message || `Last.fm error code: ${data.error}`);
  }

  return data;
}

// GET /api/lastfm/config
lastFmRouter.get("/config", (_req, res) => {
  res.json({
    enabled: lastFmConfig.enabled,
    username: lastFmConfig.username || null,
    hasSession: Boolean(lastFmConfig.sessionKey),
    apiKey: lastFmConfig.apiKey || "",
    scrobblePercentage: lastFmConfig.scrobblePercentage || 50
  });
});

// POST /api/lastfm/config
lastFmRouter.post("/config", (req, res) => {
  const { enabled, apiKey, apiSecret, scrobblePercentage } = req.body;
  if (typeof enabled === "boolean") lastFmConfig.enabled = enabled;
  if (typeof apiKey === "string") lastFmConfig.apiKey = apiKey.trim() || undefined;
  if (typeof apiSecret === "string") lastFmConfig.apiSecret = apiSecret.trim() || undefined;
  if (typeof scrobblePercentage === "number") lastFmConfig.scrobblePercentage = scrobblePercentage;

  saveLastFmConfig(lastFmConfig);
  res.json({ success: true, config: lastFmConfig });
});

// POST /api/lastfm/auth/mobile (Authenticate using Username & Password)
lastFmRouter.post("/auth/mobile", async (req, res) => {
  try {
    const { username, password, apiKey, apiSecret } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const data = await callLastFm("auth.getMobileSession", {
      username: username.trim(),
      password: password.trim(),
      apiKey,
      apiSecret
    });

    if (data.session && data.session.key) {
      lastFmConfig.sessionKey = data.session.key;
      lastFmConfig.username = data.session.name;
      lastFmConfig.enabled = true;
      if (apiKey) lastFmConfig.apiKey = apiKey.trim();
      if (apiSecret) lastFmConfig.apiSecret = apiSecret.trim();

      saveLastFmConfig(lastFmConfig);

      console.log(`[Last.fm] Authenticated successfully as: ${lastFmConfig.username}`);
      return res.json({
        success: true,
        username: lastFmConfig.username,
        sessionKey: lastFmConfig.sessionKey
      });
    }

    res.status(400).json({ error: "Failed to obtain session key from Last.fm" });
  } catch (err: any) {
    console.error("[Last.fm Auth Error]:", err.message);
    res.status(400).json({ error: err.message || "Last.fm authentication failed" });
  }
});

// POST /api/lastfm/auth/token (Browser Web Auth Flow)
lastFmRouter.post("/auth/token", async (req, res) => {
  try {
    const { apiKey, apiSecret } = req.body;
    const key = getActiveApiKey(apiKey);
    const data = await callLastFm("auth.getToken", { apiKey: key, apiSecret });

    if (data.token) {
      const authUrl = `https://www.last.fm/api/auth/?api_key=${encodeURIComponent(key)}&token=${encodeURIComponent(data.token)}`;
      return res.json({ success: true, token: data.token, authUrl });
    }
    res.status(400).json({ error: "Failed to obtain request token from Last.fm" });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to start Last.fm web auth" });
  }
});

// POST /api/lastfm/auth/session (Complete Browser Auth Flow)
lastFmRouter.post("/auth/session", async (req, res) => {
  try {
    const { token, apiKey, apiSecret } = req.body;
    if (!token) return res.status(400).json({ error: "Token is required" });

    const data = await callLastFm("auth.getSession", {
      token: token.trim(),
      apiKey,
      apiSecret
    });

    if (data.session && data.session.key) {
      lastFmConfig.sessionKey = data.session.key;
      lastFmConfig.username = data.session.name;
      lastFmConfig.enabled = true;
      if (apiKey) lastFmConfig.apiKey = apiKey.trim();
      if (apiSecret) lastFmConfig.apiSecret = apiSecret.trim();

      saveLastFmConfig(lastFmConfig);

      console.log(`[Last.fm] Web Session established for: ${lastFmConfig.username}`);
      return res.json({
        success: true,
        username: lastFmConfig.username,
        sessionKey: lastFmConfig.sessionKey
      });
    }

    res.status(400).json({ error: "Failed to authorize session with Last.fm" });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to complete Last.fm authentication" });
  }
});

// POST /api/lastfm/now-playing
lastFmRouter.post("/now-playing", async (req, res) => {
  if (!lastFmConfig.enabled || !lastFmConfig.sessionKey) {
    return res.json({ skipped: true, reason: "Last.fm scrobbling disabled or not logged in" });
  }

  try {
    const { artist, track, album, duration } = req.body;
    if (!artist || !track) {
      return res.status(400).json({ error: "Artist and track title are required" });
    }

    const payload: Record<string, any> = {
      sk: lastFmConfig.sessionKey,
      artist: artist.trim(),
      track: track.trim()
    };

    if (album) payload.album = album.trim();
    if (duration && typeof duration === "number") payload.duration = Math.round(duration);

    const data = await callLastFm("track.updateNowPlaying", payload);
    console.log(`[Last.fm Now Playing] ${artist} — ${track}`);
    res.json({ success: true, data });
  } catch (err: any) {
    console.warn(`[Last.fm Now Playing Warning]:`, err.message);
    res.status(200).json({ success: false, error: err.message });
  }
});

// POST /api/lastfm/scrobble
lastFmRouter.post("/scrobble", async (req, res) => {
  if (!lastFmConfig.enabled || !lastFmConfig.sessionKey) {
    return res.json({ skipped: true, reason: "Last.fm scrobbling disabled or not logged in" });
  }

  try {
    const { artist, track, album, duration, timestamp } = req.body;
    if (!artist || !track) {
      return res.status(400).json({ error: "Artist and track title are required" });
    }

    const ts = timestamp ? Math.round(Number(timestamp)) : Math.floor(Date.now() / 1000);

    const payload: Record<string, any> = {
      sk: lastFmConfig.sessionKey,
      artist: artist.trim(),
      track: track.trim(),
      timestamp: ts
    };

    if (album) payload.album = album.trim();
    if (duration && typeof duration === "number") payload.duration = Math.round(duration);

    const data = await callLastFm("track.scrobble", payload);
    console.log(`[Last.fm Scrobble] Scrobbled: ${artist} — ${track} (ts: ${ts})`);
    res.json({ success: true, data });
  } catch (err: any) {
    console.warn(`[Last.fm Scrobble Warning]:`, err.message);
    res.status(200).json({ success: false, error: err.message });
  }
});

// POST /api/lastfm/love
lastFmRouter.post("/love", async (req, res) => {
  if (!lastFmConfig.sessionKey) {
    return res.status(400).json({ error: "Not logged into Last.fm" });
  }

  try {
    const { artist, track, loved } = req.body;
    if (!artist || !track) {
      return res.status(400).json({ error: "Artist and track are required" });
    }

    const method = loved === false ? "track.unlove" : "track.love";
    const data = await callLastFm(method, {
      sk: lastFmConfig.sessionKey,
      artist: artist.trim(),
      track: track.trim()
    });

    console.log(`[Last.fm Love] ${loved ? "Loved" : "Unloved"}: ${artist} — ${track}`);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/lastfm/disconnect
lastFmRouter.post("/disconnect", (_req, res) => {
  lastFmConfig.sessionKey = undefined;
  lastFmConfig.username = undefined;
  lastFmConfig.enabled = false;
  saveLastFmConfig(lastFmConfig);

  console.log("[Last.fm] Disconnected session.");
  res.json({ success: true });
});

// GET /api/lastfm/user
lastFmRouter.get("/user", async (_req, res) => {
  if (!lastFmConfig.sessionKey || !lastFmConfig.username) {
    return res.json({ authenticated: false });
  }

  try {
    const data = await callLastFm("user.getInfo", {
      user: lastFmConfig.username,
      sk: lastFmConfig.sessionKey
    }, false);

    res.json({
      authenticated: true,
      user: data.user
    });
  } catch (err: any) {
    res.json({
      authenticated: true,
      username: lastFmConfig.username,
      error: err.message
    });
  }
});
