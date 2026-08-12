/**
 * Scaffold Capacitor + Electron packaging files into a generated app's project_files.
 */

export type ScaffoldFile = { path: string; content: string; language: string };

export function buildCapacitorScaffoldFiles(opts: {
  appName: string;
  appId?: string;
  serverUrl: string;
}): ScaffoldFile[] {
  const name = (opts.appName || "Lifemark App").trim() || "Lifemark App";
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24) || "app";
  const appId = opts.appId?.trim() || `app.lifemarkai.${slug}`;
  const serverUrl = opts.serverUrl.replace(/\/$/, "");

  const capacitorConfig = `import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: ${JSON.stringify(appId)},
  appName: ${JSON.stringify(name)},
  webDir: "dist",
  server: {
    url: ${JSON.stringify(serverUrl)},
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
`;

  const nativeReadme = `# Native packaging (Capacitor + Electron)

This project was scaffolded by LifemarkAI for App Store / Play / desktop shells.

## Prerequisites
- Deploy the web app first (Publish) so \`server.url\` points at a live HTTPS URL.
- Install Capacitor CLI deps in this project, then add platforms.

## Commands
\`\`\`bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android --save
npx cap add ios
npx cap add android
npx cap sync
npx cap open ios
npx cap open android
\`\`\`

## Desktop (Electron)
See \`electron/main.cjs\` — run \`npm run electron:dev\` after adding the scripts below to package.json.

## Notes
- Capacitor loads your **published** URL by default (same pattern as Lovable native packaging).
- Update \`capacitor.config.ts\` \`server.url\` when the deploy URL changes.
`;

  const electronMain = `"use strict";
const { app, BrowserWindow } = require("electron");

const START_URL = process.env.ELECTRON_START_URL || ${JSON.stringify(serverUrl)};

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL(START_URL);
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
`;

  const packageScriptsHint = `{
  "scripts": {
    "cap:sync": "npx cap sync",
    "cap:add:ios": "npx cap add ios",
    "cap:add:android": "npx cap add android",
    "cap:open:ios": "npx cap open ios",
    "cap:open:android": "npx cap open android",
    "electron:dev": "electron electron/main.cjs",
    "electron:build:mac": "echo Add electron-builder for production packaging",
    "electron:build:win": "echo Add electron-builder for production packaging"
  }
}
`;

  return [
    { path: "capacitor.config.ts", content: capacitorConfig, language: "typescript" },
    { path: "NATIVE.md", content: nativeReadme, language: "markdown" },
    { path: "electron/main.cjs", content: electronMain, language: "javascript" },
    {
      path: "native-package-scripts.json",
      content: packageScriptsHint,
      language: "json",
    },
  ];
}
