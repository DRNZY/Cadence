import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import * as mm from "music-metadata";
import type { LibraryData, ScanProgress, ScanResult, Track, WindowAction } from "../src/types";

// Wayland & Linux GPU acceleration
app.commandLine.appendSwitch("enable-features", "UseOzonePlatform,VaapiVideoDecoder");
app.commandLine.appendSwitch("ozone-platform-hint", "auto");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let mainWindow: BrowserWindow | null = null;

const USER_DATA = app.getPath("userData");
const DB_FILE = path.join(USER_DATA, "library.json");
const ART_CACHE = new Map<string, string>(); // trackId -> dataUrl

const AUDIO_EXTS = new Set([".flac", ".mp3", ".wav", ".m4a", ".ogg", ".opus", ".aac", ".alac", ".aif", ".aiff", ".ape", ".wma"]);

function loadDb(): LibraryData {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    }
  } catch (err) {
    console.error("[Cadence Main] Error reading library DB:", err);
  }
  const defaultMusic = app.getPath("music");
  return {
    folders: fs.existsSync(defaultMusic) ? [defaultMusic] : [],
    tracks: [],
    lastScanAt: undefined,
  };
}

function saveDb(data: LibraryData) {
  try {
    fs.mkdirSync(USER_DATA, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[Cadence Main] Error saving library DB:", err);
  }
}

function sha1(str: string): string {
  return crypto.createHash("sha1").update(str).digest("hex");
}

async function extractTrackMeta(filePath: string): Promise<Track | null> {
  try {
    const stat = await fs.promises.stat(filePath);
    const metadata = await mm.parseFile(filePath, { skipCovers: false });
    const common = metadata.common;
    const format = metadata.format;

    let artThumbDataUrl: string | undefined;
    const pic = common.picture?.[0];
    if (pic) {
      const b64 = Buffer.from(pic.data).toString("base64");
      const fullArt = `data:${pic.format};base64,${b64}`;
      const trackId = sha1(filePath);
      ART_CACHE.set(trackId, fullArt);
      artThumbDataUrl = fullArt;
    }

    const ext = path.extname(filePath).toLowerCase().replace(".", "");
    const isLossless = ["flac", "wav", "alac", "aif", "aiff", "ape"].includes(ext) || format.lossless === true;

    return {
      id: sha1(filePath),
      path: filePath,
      fileName: path.basename(filePath),
      title: common.title || path.parse(filePath).name,
      artist: common.artist || common.albumartist || "Unknown Artist",
      album: common.album || "Unknown Album",
      albumArtist: common.albumartist,
      year: common.year,
      genre: common.genre?.[0],
      trackNo: common.track?.no ?? undefined,
      discNo: common.disk?.no ?? undefined,
      durationSec: format.duration || 0,
      bitrateKbps: format.bitrate ? Math.round(format.bitrate / 1000) : undefined,
      sampleRateHz: format.sampleRate,
      bitDepth: format.bitsPerSample,
      codec: format.codec || ext,
      container: format.container || ext,
      lossless: isLossless,
      artThumbDataUrl,
    };
  } catch {
    const ext = path.extname(filePath).toLowerCase().replace(".", "");
    return {
      id: sha1(filePath),
      path: filePath,
      fileName: path.basename(filePath),
      title: path.parse(filePath).name,
      artist: "Unknown Artist",
      album: "Unknown Album",
      durationSec: 0,
      codec: ext,
      container: ext,
      lossless: false,
    };
  }
}

async function scanFolders(folders: string[], sendProgress?: (p: ScanProgress) => void): Promise<Track[]> {
  const filePaths: string[] = [];

  async function walk(dir: string) {
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
            await walk(full);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (AUDIO_EXTENSIONS_SET.has(ext)) {
            filePaths.push(full);
          }
        }
      }
    } catch {}
  }

  const AUDIO_EXTENSIONS_SET = AUDIO_EXTS;
  for (const f of folders) {
    if (fs.existsSync(f)) await walk(f);
  }

  const tracks: Track[] = [];
  let done = 0;
  for (const p of filePaths) {
    const track = await extractTrackMeta(p);
    if (track) tracks.push(track);
    done++;
    if (sendProgress && done % 5 === 0) {
      sendProgress({ done, total: filePaths.length, currentFile: path.basename(p) });
    }
  }

  return tracks;
}

// Register custom protocol for local audio streaming
protocol.registerSchemesAsPrivileged([
  {
    scheme: "cadence",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function registerCadenceProtocol() {
  protocol.handle("cadence", async (request) => {
    try {
      const rawPath = decodeURIComponent(request.url.replace(/^cadence:\/\//, ""));
      const filePath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
      if (!fs.existsSync(filePath)) {
        return new Response("File Not Found", { status: 404 });
      }

      const stat = await fs.promises.stat(filePath);
      const rangeHeader = request.headers.get("range");

      const mimeTypes: Record<string, string> = {
        ".flac": "audio/flac",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".ogg": "audio/ogg",
        ".opus": "audio/opus",
        ".aac": "audio/aac",
      };
      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || "audio/mpeg";

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunkSize = end - start + 1;

        const stream = fs.createReadStream(filePath, { start, end });
        return new Response(stream as any, {
          status: 206,
          headers: {
            "Content-Range": `bytes ${start}-${end}/${stat.size}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunkSize.toString(),
            "Content-Type": contentType,
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const stream = fs.createReadStream(filePath);
      return new Response(stream as any, {
        status: 200,
        headers: {
          "Content-Length": stat.size.toString(),
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err: any) {
      return new Response(err.message, { status: 500 });
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 880,
    minWidth: 1024,
    minHeight: 640,
    frame: false,
    transparent: false,
    backgroundColor: "#0d0e15",
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window:state-changed", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("window:state-changed", false);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  registerCadenceProtocol();

  // IPC Handlers
  ipcMain.handle("library:load", async () => {
    return loadDb();
  });

  ipcMain.handle("library:pick-folder", async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Select Music Folder",
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const picked = res.filePaths[0];

    const db = loadDb();
    if (!db.folders.includes(picked)) {
      db.folders.push(picked);
    }

    const sendProgress = (p: ScanProgress) => mainWindow?.webContents.send("library:progress", p);
    const tracks = await scanFolders(db.folders, sendProgress);
    const added = tracks.length - db.tracks.length;
    db.tracks = tracks;
    db.lastScanAt = Date.now();
    saveDb(db);

    return { added: Math.max(0, added), updated: tracks.length, removed: 0, total: tracks.length };
  });

  ipcMain.handle("library:rescan-all", async () => {
    const db = loadDb();
    const sendProgress = (p: ScanProgress) => mainWindow?.webContents.send("library:progress", p);
    const tracks = await scanFolders(db.folders, sendProgress);
    db.tracks = tracks;
    db.lastScanAt = Date.now();
    saveDb(db);
    return { added: 0, updated: tracks.length, removed: 0, total: tracks.length };
  });

  ipcMain.handle("library:remove-folder", async (_event, folder: string) => {
    const db = loadDb();
    db.folders = db.folders.filter((f) => f !== folder);
    const tracks = await scanFolders(db.folders);
    db.tracks = tracks;
    saveDb(db);
    return { added: 0, updated: tracks.length, removed: 0, total: tracks.length };
  });

  ipcMain.handle("track:get-art", (_event, trackId: string) => {
    return ART_CACHE.get(trackId) || null;
  });

  ipcMain.on("window:control", (_event, action: WindowAction) => {
    if (!mainWindow) return;
    if (action === "close") mainWindow.close();
    else if (action === "minimize") mainWindow.minimize();
    else if (action === "toggle-maximize") {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    }
  });

  ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() || false);

  ipcMain.handle("app:open-path", (_event, p: string) => shell.openPath(p));

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
