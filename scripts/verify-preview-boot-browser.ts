import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

const root = process.cwd();
const reportDir = resolve("artifacts/core-loop");
await mkdir(reportDir, { recursive: true });
const fixture = await mkdtemp(join(reportDir, "boot-browser-"));
const entry = `import React from 'react';
import { createRoot } from 'react-dom/client';
import { PreviewBooting } from '${resolve("src/components/preview-booting.tsx").replace(/\\/g, "/")}';
createRoot(document.getElementById('root')).render(<PreviewBooting />);`;
await writeFile(join(fixture, "index.html"), '<!doctype html><html><body><iframe src="/boot.html" style="width:900px;height:600px"></iframe></body></html>');
await writeFile(join(fixture, "boot.html"), '<!doctype html><html><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
await writeFile(join(fixture, "main.tsx"), entry);
const server = await createServer({
  configFile: false, root: fixture, plugins: [react()], logLevel: "error",
  resolve: { alias: { "@": resolve("src") } },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  const url = server.resolvedUrls!.local[0];
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL });
  const results = await Promise.all([false, true].map(async (blockedStorage) => {
    const context = await browser!.newContext();
    if (blockedStorage) await context.addInitScript(() => {
      Object.defineProperty(window, "sessionStorage", { get() { throw new DOMException("Blocked storage", "SecurityError"); } });
    });
    const page = await context.newPage();
    const errors: string[] = [];
    const navigations: number[] = [];
    const started = Date.now();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("framenavigated", (frame) => {
      if (frame.url().endsWith("/boot.html")) navigations.push(Date.now() - started);
    });
    await page.goto(url);
    const frame = page.frameLocator("iframe");
    await frame.getByRole("heading", { name: "This preview is starting", exact: true }).waitFor();
    await frame.getByRole("heading", { name: "This preview isn't running", exact: true }).waitFor({ timeout: 145_000 });
    const gaveUpMs = Date.now() - started;
    assert.ok(gaveUpMs >= 120_000 && gaveUpMs < 140_000, `unexpected give-up time: ${gaveUpMs}`);
    assert.ok(navigations.length >= 8 && navigations.length < 20, `unbounded or missing reloads: ${navigations.length}`);
    const gaps = navigations.slice(1).map((time, i) => time - navigations[i]);
    assert.ok(gaps[2] > gaps[0], "reload intervals must increase across page loads");
    const count = navigations.length;
    await page.waitForTimeout(17_000);
    assert.equal(navigations.length, count, "give-up must stop automatic reloads");
    assert.deepEqual(errors, [], "boot page must not throw with blocked storage");
    await frame.getByRole("button", { name: "Try again", exact: true }).click();
    await frame.getByRole("heading", { name: "This preview is starting", exact: true }).waitFor();
    const child = page.frames().find((f) => f.url().endsWith("/boot.html"))!;
    const stateCleared = await child.evaluate((blocked) => blocked
      ? !window.name.startsWith("lm-preview-boot:")
      : sessionStorage.getItem(`lm.preview-boot.${location.host}`) === null, blockedStorage);
    assert.equal(stateCleared, true, "manual retry must clear the previous episode");
    await context.close();
    return { blockedStorage, gaveUpMs, navigations, passed: true };
  }));
  await writeFile(join(reportDir, "boot-browser.json"), JSON.stringify({ results }, null, 2));
  console.log(JSON.stringify({ passed: true, results }));
} finally {
  await browser?.close();
  await server.close();
  await rm(fixture, { recursive: true, force: true });
}
