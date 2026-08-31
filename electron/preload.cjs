const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  onMediaKey: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on("mpris-media-key", handler);
    return () => ipcRenderer.removeListener("mpris-media-key", handler);
  },
  onPlayCommand: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("play-command", handler);
    return () => ipcRenderer.removeListener("play-command", handler);
  },
  sendTrackChange: (trackInfo) => {
    ipcRenderer.send("track-changed", trackInfo);
  },
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close")
});
