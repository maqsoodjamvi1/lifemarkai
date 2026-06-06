/**
 * LifemarkAI Desktop — Electron main process
 *
 * Wraps the Next.js web app in a native Electron window.
 * In production the app loads from the hosted URL; in dev it loads from
 * localhost:3000 so hot-reload works as normal.
 *
 * Build:
 *   npm run electron:build   (creates dist/ packages for macOS / Windows / Linux)
 * Dev:
 *   npm run electron:dev     (starts Next.js dev server then opens Electron)
 */

const { app, BrowserWindow, shell, Menu, nativeTheme, ipcMain } = require("electron");
const path = require("path");

// ── Config ────────────────────────────────────────────────────────────────────

const PROD_URL   = "https://lifemarkai.app";
const DEV_URL    = "http://localhost:3000";
const isDev      = process.env.NODE_ENV === "development" || !app.isPackaged;
const APP_URL    = isDev ? DEV_URL : PROD_URL;
const WINDOW_W   = 1440;
const WINDOW_H   = 900;

// ── Window factory ────────────────────────────────────────────────────────────

function createWindow() {
  nativeTheme.themeSource = "dark";

  const win = new BrowserWindow({
    width:  WINDOW_W,
    height: WINDOW_H,
    minWidth:  1024,
    minHeight: 640,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#0d0d14",
    icon: path.join(__dirname, "../public/icons/icon-512.png"),
    webPreferences: {
      preload:            path.join(__dirname, "preload.js"),
      contextIsolation:   true,
      nodeIntegration:    false,
      webSecurity:        true,
      // Allow loading the hosted app in an iframe (for the preview pane)
      allowRunningInsecureContent: false,
    },
    show: false, // show after ready-to-show to avoid flash
  });

  // Show only once the renderer is ready
  win.once("ready-to-show", () => win.show());

  win.loadURL(APP_URL);

  // Open external links in the default browser, not in Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http") && !url.includes("lifemarkai")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // Dev tools in development
  if (isDev) win.webContents.openDevTools({ mode: "detach" });

  return win;
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  buildMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ── IPC handlers ──────────────────────────────────────────────────────────────

// Allow renderer to request opening external URLs safely
ipcMain.handle("open-external", (_e, url) => {
  const safe = url.startsWith("https://") || url.startsWith("http://");
  if (safe) shell.openExternal(url);
});

// Allow renderer to get platform info
ipcMain.handle("get-platform", () => process.platform);

// ── App menu ──────────────────────────────────────────────────────────────────

function buildMenu() {
  const isMac = process.platform === "darwin";

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    }] : []),
    {
      label: "File",
      submenu: [
        isMac ? { role: "close" } : { role: "quit" },
        { type: "separator" },
        {
          label: "New Project",
          accelerator: "CmdOrCtrl+N",
          click(_item, win) {
            win?.webContents.executeJavaScript(
              `window.location.href = "/dashboard?action=new"`
            );
          },
        },
        {
          label: "Open Dashboard",
          accelerator: "CmdOrCtrl+D",
          click(_item, win) {
            win?.webContents.executeJavaScript(
              `window.location.href = "/dashboard"`
            );
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...(isMac ? [
          { role: "pasteAndMatchStyle" },
          { role: "delete" },
          { role: "selectAll" },
        ] : [
          { role: "delete" },
          { type: "separator" },
          { role: "selectAll" },
        ]),
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(isDev ? [{ type: "separator" }, { role: "toggleDevTools" }] : []),
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac ? [
          { type: "separator" },
          { role: "front" },
        ] : [
          { role: "close" },
        ]),
      ],
    },
    {
      role: "help",
      submenu: [
        {
          label: "LifemarkAI Documentation",
          click: () => shell.openExternal("https://lifemarkai.app/docs"),
        },
        {
          label: "Report an Issue",
          click: () => shell.openExternal("https://lifemarkai.app/feedback"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
