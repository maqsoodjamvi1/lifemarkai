/**
 * Electron preload — runs in renderer context with Node.js access.
 * Exposes a minimal, typed bridge via contextBridge so the web app can
 * detect it's running inside Electron and call safe IPC methods.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  /** True when running inside the Electron wrapper */
  isElectron: true,

  /** Open a URL in the system default browser */
  openExternal: (url) => ipcRenderer.invoke("open-external", url),

  /** "darwin" | "win32" | "linux" */
  platform: () => ipcRenderer.invoke("get-platform"),
});
