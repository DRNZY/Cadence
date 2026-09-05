const { app, BrowserWindow, shell, globalShortcut, ipcMain, Notification } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { spawn } = require("child_process");

// Set Application Name
app.name = "Cadence";

let mainWindow = null;
let serverProcess = null;
const SERVER_PORT = 3001;
const DEV_URL = "http://localhost:5173";
const PROD_URL = `http://localhost:${SERVER_PORT}`;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      const playIdx = commandLine.findIndex(arg => arg === "--play" || arg === "-p");
      if (playIdx !== -1 && commandLine[playIdx + 1]) {
        mainWindow.webContents.send("play-command", { query: commandLine[playIdx + 1] });
      }
    }
  });
}

// Clean Linux flags for Wayland & X11 compatibility
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

function checkUrl(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function startBackendServer() {
  const projectRoot = path.resolve(__dirname, "..");
  const serverMjs = path.join(projectRoot, "dist-server/index.mjs");
  const serverTs = path.join(projectRoot, "server/index.ts");

  // Use Electron's embedded Node runtime for self-contained execution (supports app.asar)
  const nodeRuntime = process.execPath;

  if (fs.existsSync(serverMjs)) {
    serverProcess = spawn(nodeRuntime, [serverMjs], {
      cwd: projectRoot,
      env: { 
        ...process.env, 
        ELECTRON_RUN_AS_NODE: "1", 
        PORT: SERVER_PORT.toString(), 
        NODE_ENV: "production" 
      },
      stdio: "inherit"
    });
  } else if (fs.existsSync(serverTs)) {
    const tsxBin = path.join(projectRoot, "node_modules/.bin/tsx");
    const cmd = fs.existsSync(tsxBin) ? tsxBin : "npx";
    const args = fs.existsSync(tsxBin) ? [serverTs] : ["tsx", serverTs];
    serverProcess = spawn(cmd, args, {
      cwd: projectRoot,
      env: { ...process.env, PORT: SERVER_PORT.toString() },
      stdio: "inherit"
    });
  }
}

function registerGlobalMediaKeys() {
  const mediaKeys = [
    { key: "MediaPlayPause", action: "play-pause" },
    { key: "MediaNextTrack", action: "next" },
    { key: "MediaPreviousTrack", action: "previous" },
    { key: "MediaStop", action: "stop" }
  ];

  for (const { key, action } of mediaKeys) {
    try {
      globalShortcut.register(key, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("mpris-media-key", action);
        }
      });
    } catch (err) {
      console.warn(`[Cadence Electron] Could not bind global shortcut ${key}:`, err);
    }
  }
}

async function createWindow() {
  const iconPath = path.join(__dirname, "../packaging/cadence.png");

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 650,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#08090e",
    title: "Cadence — Studio Hi-Fi Linux Audio Engine",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });

  // Forward renderer console to terminal
  mainWindow.webContents.on("console-message", (_event, level, message) => {
    console.log(`[Renderer Console] ${message}`);
  });

  // Determine target URL: always use production build unless CADENCE_DEV is explicitly set
  let targetUrl = PROD_URL;
  if (!app.isPackaged && process.env.CADENCE_DEV) {
    const isDevRunning = await checkUrl(DEV_URL);
    if (isDevRunning) {
      targetUrl = DEV_URL;
    }
  }

  if (targetUrl === PROD_URL) {
    // Wait for internal backend to respond
    for (let i = 0; i < 40; i++) {
      if (await checkUrl(PROD_URL)) {
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  console.log(`[Cadence Electron] Loading UI from: ${targetUrl}`);
  mainWindow.loadURL(targetUrl);

  mainWindow.webContents.on("did-finish-load", () => {
    const playIdx = process.argv.findIndex(arg => arg === "--play" || arg === "-p");
    if (playIdx !== -1 && process.argv[playIdx + 1]) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("play-command", { query: process.argv[playIdx + 1] });
        }
      }, 600);
    }
  });

  mainWindow.webContents.on("did-fail-load", () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(targetUrl);
      }
    }, 250);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.on("track-changed", (_event, track) => {
  if (Notification.isSupported() && track && track.title) {
    try {
      const iconPath = path.join(__dirname, "../packaging/cadence.png");
      const notif = new Notification({
        title: track.title,
        body: `${track.artist || "Unknown Artist"} • ${track.album || "Unknown Album"}\n[${track.format || "AUDIO"}]`,
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
        silent: true
      });
      notif.show();
    } catch {}
  }
});

ipcMain.on("window-minimize", () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});

ipcMain.on("window-maximize", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.on("window-close", () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

app.whenReady().then(async () => {
  const isServerRunning = await checkUrl(PROD_URL);
  if (!isServerRunning) {
    startBackendServer();
  }

  registerGlobalMediaKeys();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
