import assert from "node:assert/strict";
import test from "node:test";
import { attachPreviewRevision, isPreviewFrameMessage } from "./preview-revision.ts";

test("revision changes update the observer module without rewriting the entry", () => {
  const initial = attachPreviewRevision([{ path: "vite.config.ts", content: "custom" }, { path: "index.html", content: "<body><div id='root'></div></body>" }], "first");
  const updated = attachPreviewRevision(initial.files, "second");
  assert.equal(initial.requiresReload, false);
  assert.equal(updated.files.find((f) => f.path === "index.html")?.content, initial.files.find((f) => f.path === "index.html")?.content);
  assert.match(updated.files.find((f) => f.path === "__lifemark_preview_revision.js")!.content, /second/);
});
test("paint evidence must come from the current window and origin", () => {
  const frame = {} as Window;
  assert.equal(isPreviewFrameMessage({ source: frame, origin: "https://preview.test" }, frame, "https://preview.test/path"), true);
  assert.equal(isPreviewFrameMessage({ source: {} as Window, origin: "https://preview.test" }, frame, "https://preview.test"), false);
  assert.equal(isPreviewFrameMessage({ source: frame, origin: "https://other.test" }, frame, "https://preview.test"), false);
  assert.equal(isPreviewFrameMessage({ source: null, origin: "https://preview.test" }, null, "https://preview.test"), false);
});

test("SSR document instrumentation requests reload only when its document changes", () => {
  const result = attachPreviewRevision([
    { path: "vite.config.ts", content: "export default {}" },
    { path: "src/routes/__root.tsx", content: "export function Shell() { return <Html><Body><main>Bakery</main></Body></Html> }" },
  ], "first");
  assert.deepEqual(result.reloadWhenChanged, ["src/routes/__root.tsx"]);
  assert.equal(result.requiresReload, false);
  const document = result.files.find((f) => f.path === "src/routes/__root.tsx")!.content;
  assert.match(document, /data-lifemark-revision="true"/);
  assert.match(document, /\/><\/Body>/);
  const updated = attachPreviewRevision(result.files, "second");
  assert.equal(updated.files.find((f) => f.path === "src/routes/__root.tsx")!.content, document);
  assert.deepEqual(updated.reloadWhenChanged, result.reloadWhenChanged);
});

test("TanStack route and document edits reload while framework components retain HMR", () => {
  const files = [
    { path: "package.json", content: '{"dependencies":{"@tanstack/react-start":"1.0.0"}}' },
    { path: "vite.config.ts", content: "export default { plugins: [tanstackStart()] }" },
    { path: "src/routes/index.tsx", content: "import { createFileRoute } from '@tanstack/react-router'; export const Route = createFileRoute('/')({ component: Home });" },
    { path: "src/routes/__root.tsx", content: "export function Shell() { return <html><body><Outlet /></body></html> }" },
    { path: "src/components/Card.tsx", content: "export function Card() { return <article>Hello</article> }" },
    { path: "src/components/Nav.jsx", content: "import { Link } from '@tanstack/react-router'; export function Nav() { return <Link to='/'>Home</Link> }" },
    { path: "src/components/layout.tsx", content: "export function Layout() { return <main>Hello</main> }" },
    { path: "src/lib/utils.ts", content: "export const identity = (value: string) => value;" },
  ];
  const initial = attachPreviewRevision(files, "first");
  assert.equal(initial.requiresReload, false);
  assert.deepEqual(initial.reloadWhenChanged, ["src/routes/index.tsx", "src/routes/__root.tsx"]);

  const updated = attachPreviewRevision(initial.files, "second");
  assert.equal(updated.requiresReload, false);
  assert.deepEqual(updated.reloadWhenChanged, initial.reloadWhenChanged);
});
