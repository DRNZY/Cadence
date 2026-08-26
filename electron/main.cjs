const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { fork, spawn } = require("child_process");

// Set Application Name
app.name = "AuraDeck";

let mainWindow = null;
let serverProcess = null;
const SERVER_PORT = 3001;
const DEV_URL = "http://localhost:5173";
const PROD_URL = `http://localhost:${SERVER_PORT}`;

// Enable Wayland & GPU Acceleration on Linux
app.commandLine.appendSwitch("enable-features", "UseOzonePlatform,VaapiVideoDecoder");
app.commandLine.appendSwitch("ozone-platform-hint", "auto");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
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

  if (fs.existsSync(serverMjs)) {
    serverProcess = fork(serverMjs, [], {
      cwd: projectRoot,
      env: { ...process.env, PORT: SERVER_PORT.toString(), NODE_ENV: "production" },
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

async function createWindow() {
  const iconPath = path.join(__dirname, "../packaging/auradeck.png");

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 650,
    backgroundColor: "#08090e",
    title: "AuraDeck — Studio Hi-Fi Linux Audio Engine",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Allow local audio streaming and CORS
    }
  });

  // Determine target URL
  let targetUrl = PROD_URL;
  const isDevRunning = await checkUrl(DEV_URL);
  if (isDevRunning) {
    targetUrl = DEV_URL;
  } else {
    // Wait for production backend to respond
    for (let i = 0; i < 40; i++) {
      if (await checkUrl(PROD_URL)) {
        break;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  console.log(`[AuraDeck Electron] Loading UI from: ${targetUrl}`);
  mainWindow.loadURL(targetUrl);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const isServerRunning = await checkUrl(PROD_URL);
  if (!isServerRunning) {
    startBackendServer();
  }

  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (serverProcess) {
    try {
      serverProcess.kill("SIGTERM");
    } catch {}
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (serverProcess) {
    try {
      serverProcess.kill("SIGTERM");
    } catch {}
  }
});
