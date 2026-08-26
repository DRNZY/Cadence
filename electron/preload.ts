import { contextBridge, ipcRenderer } from "electron";
import type { CadenceApi, LibraryData, ScanProgress, ScanResult, WindowAction } from "../src/types";

const api: CadenceApi = {
  loadLibrary: () => ipcRenderer.invoke("library:load"),
  pickAndScanFolder: () => ipcRenderer.invoke("library:pick-folder"),
  rescanAll: () => ipcRenderer.invoke("library:rescan-all"),
  removeFolder: (folder: string) => ipcRenderer.invoke("library:remove-folder", folder),
  getArt: (trackId: string) => ipcRenderer.invoke("track:get-art", trackId),
  onScanProgress: (cb: (p: ScanProgress) => void) => {
    const handler = (_: any, p: ScanProgress) => cb(p);
    ipcRenderer.on("library:progress", handler);
    return () => ipcRenderer.removeListener("library:progress", handler);
  },

  decode: (req) => ipcRenderer.invoke("audio:decode", req),
  stopDecode: () => ipcRenderer.invoke("audio:stop-decode"),
  onDecodeChunk: (cb) => {
    const handler = (_: any, streamId: string, chunk: ArrayBuffer) => cb(streamId, chunk);
    ipcRenderer.on("audio:chunk", handler);
    return () => ipcRenderer.removeListener("audio:chunk", handler);
  },
  onDecodeEnd: (cb) => {
    const handler = (_: any, streamId: string, code: number | null) => cb(streamId, code);
    ipcRenderer.on("audio:end", handler);
    return () => ipcRenderer.removeListener("audio:end", handler);
  },

  windowControl: (action: WindowAction) => ipcRenderer.send("window:control", action),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  onWindowStateChanged: (cb) => {
    const handler = (_: any, maximized: boolean) => cb(maximized);
    ipcRenderer.on("window:state-changed", handler);
    return () => ipcRenderer.removeListener("window:state-changed", handler);
  },

  openPath: (path: string) => ipcRenderer.invoke("app:open-path", path),
};

contextBridge.exposeInMainWorld("cadence", api);
