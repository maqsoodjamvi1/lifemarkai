import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createServer as httpServer } from "node:http";
import { createServer } from "vite";
import { chromium } from "playwright";
import ts from "typescript";
import { attachPreviewRevision } from "../src/lib/preview/preview-revision.ts";
import { injectVebBridgeIntoHtml } from "../src/lib/preview/veb-bridge.ts";
import { monacoAssets } from "./vite-monaco-assets.ts";

const fixture = await mkdtemp(join(tmpdir(), "lifemark-preview-revision-"));
const app = (text: string) => `document.getElementById('root').innerHTML = '<h1>${text}</h1><p>Rendered fixture</p>'; if (import.meta.hot) import.meta.hot.accept();`;
let vite: Awaited<ReturnType<typeof createServer>> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const parent = httpServer((_req, res) => { res.setHeader("Content-Type", "text/html"); res.end("<!doctype html><body><iframe id='preview' style='width:800px;height:600px'></iframe></body>"); });
try {
  const initial = attachPreviewRevision([
    { path: "vite.config.js", content: "" },
    { path: "index.html", content: injectVebBridgeIntoHtml('<!doctype html><body><div id="root"></div><script type="module" src="/app.js"></script></body>') },
    { path: "app.js", content: app("Initial") },
  ], "first");
  for (const file of initial.files) await writeFile(join(fixture, file.path), file.content);
  vite = await createServer({ configFile: false, root: fixture, plugins: [monacoAssets(process.cwd())], server: { host: "127.0.0.1", port: 0, strictPort: false }, logLevel: "silent" });
  await vite.listen();
  const guest = vite.resolvedUrls!.local[0];
  await new Promise<void>((done) => parent.listen(0, "127.0.0.1", done));
  const address = parent.address() as { port: number };
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}`);
  const helpers = await Promise.all(["preview-revision.ts", "wait-for-preview-revision.ts"].map((name) => readFile(resolve("src/lib/preview", name), "utf8")));
  const source = helpers.join("\n").replace(/^import .*;\r?$/gm, "").replace(/export /g, "");
  await page.addScriptTag({ content: ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText });
  await page.locator("iframe").evaluate((frame, url) => { (frame as HTMLIFrameElement).src = url; }, guest);
  const verify = (revision: string, timeoutMs = 10_000) => page.evaluate(async ({ revision, guest, timeoutMs }) => {
    const host = window as unknown as { waitForPreviewRevision: (...args: any[]) => Promise<boolean> };
    return host.waitForPreviewRevision(revision, () => (document.getElementById("preview") as HTMLIFrameElement).contentWindow, () => guest, new AbortController().signal, window, timeoutMs);
  }, { revision, guest, timeoutMs });
  assert.equal(await verify("first"), true, "first render must acknowledge revision");
  assert.equal(await verify("wrong", 350), false, "a previous render cannot acknowledge a newer revision");
  const forged = verify("forged", 350);
  await page.evaluate(() => window.postMessage({ type: "lifemark-preview-revision-painted", revision: "forged" }, "*"));
  assert.equal(await forged, false, "an unrelated sender cannot satisfy rendering verification");
  let navigations = 0;
  page.on("framenavigated", () => { navigations++; });
  const framesBefore = page.frames().length;
  const start = performance.now();
  const update = attachPreviewRevision(initial.files, "second");
  await writeFile(join(fixture, "app.js"), app("Updated"));
  await writeFile(join(fixture, "__lifemark_preview_revision.js"), update.files.find((f) => f.path === "__lifemark_preview_revision.js")!.content);
  assert.equal(await verify("second"), true, "HMR must acknowledge new revision");
  assert.equal(await page.frameLocator("iframe").locator("h1").textContent(), "Updated");
  assert.equal(page.frames().length, framesBefore);
  assert.equal(navigations, 0, "source-only edit should preserve iframe navigation and state");
  const editToPaintMs = Math.round(performance.now() - start);
  await writeFile(join(fixture, "app.js"), "throw new Error('deliberate fixture crash'); if (import.meta.hot) import.meta.hot.accept();");
  await writeFile(join(fixture, "__lifemark_preview_revision.js"), attachPreviewRevision(initial.files, "broken").files.find((f) => f.path === "__lifemark_preview_revision.js")!.content);
  assert.equal(await verify("broken", 1800), false, "runtime failure must not acknowledge old visible content");
  await writeFile(join(fixture, "app.js"), app("Recovered"));
  await writeFile(join(fixture, "__lifemark_preview_revision.js"), attachPreviewRevision(initial.files, "recovered").files.find((f) => f.path === "__lifemark_preview_revision.js")!.content);
  assert.equal(await verify("recovered"), true, "a fixed app must recover without manual reload");
  assert.equal(await page.frameLocator("iframe").locator("h1").textContent(), "Recovered");
  await writeFile(join(fixture, "app.js"), "const = broken syntax;");
  await writeFile(join(fixture, "__lifemark_preview_revision.js"), attachPreviewRevision(initial.files, "syntax-error").files.find((f) => f.path === "__lifemark_preview_revision.js")!.content);
  assert.equal(await verify("syntax-error", 1800), false, "compile failure must not acknowledge old content");
  await writeFile(join(fixture, "app.js"), app("Compiled again"));
  await writeFile(join(fixture, "__lifemark_preview_revision.js"), attachPreviewRevision(initial.files, "syntax-fixed").files.find((f) => f.path === "__lifemark_preview_revision.js")!.content);
  assert.equal(await verify("syntax-fixed"), true, "compile failure should recover through HMR");
  await writeFile(join(fixture, "monaco-test.html"), `<!doctype html><div id="editor" style="height:500px"></div><script src="/monaco/vs/loader.js"></script><script>require.config({paths:{vs:'/monaco/vs'}});require(['vs/editor/editor.main'],function(){window.testEditor=monaco.editor.create(document.getElementById('editor'),{value:'const value: number = 42;',language:'typescript'});});</script>`);
  const codePage = await browser.newPage();
  const externalRequests: string[] = [];
  codePage.on("request", (request) => { if (/^https?:/.test(request.url()) && !request.url().startsWith(guest)) externalRequests.push(request.url()); });
  await codePage.goto(`${guest}monaco-test.html`);
  await codePage.waitForFunction(() => !!(window as any).testEditor, { timeout: 15_000 });
  assert.equal(await codePage.evaluate(() => (window as any).testEditor.getValue()), "const value: number = 42;");
  const diagnostics = await codePage.evaluate(async () => {
    const editor = (window as any).testEditor;
    const getWorker = await (window as any).monaco.languages.typescript.getTypeScriptWorker();
    const worker = await getWorker(editor.getModel().uri);
    return worker.getSyntacticDiagnostics(editor.getModel().uri.toString());
  });
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(externalRequests, [], "Monaco and workers must load from the app, without a CDN");
  console.log(JSON.stringify({ ok: true, cases: ["initial paint", "stale revision rejected", "unrelated sender rejected", "HMR rendered without navigation", "runtime failure rejected", "HMR recovery", "compile failure rejected and recovered", "local Monaco and TypeScript worker"], editToPaintMs }));
} finally {
  await browser?.close();
  await vite?.close();
  parent.close();
  if (resolve(dirname(fixture)) === resolve(tmpdir()) && fixture.includes("lifemark-preview-revision-")) await rm(fixture, { recursive: true, force: true });
}
