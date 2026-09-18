import test from "node:test";
import assert from "node:assert/strict";
import { preservePreviewDocuments } from "./preview-document-instrumentation.ts";
import { attachPreviewRevision } from "./preview-revision.ts";

test("background root saves preserve document instrumentation without changing revision", () => {
  const files = [{ path: "src/routes/__root.tsx", content: 'export function Root() { return <html><body><Outlet /></body></html> }' }];
  const once = preservePreviewDocuments(files);
  assert.equal(once.length, 1);
  assert.match(once[0].content, /data-lifemark-revision/);
  assert.match(once[0].content, /lifemark-preview-verify-revision/);
  assert.deepEqual(preservePreviewDocuments(once), once);
});

test("TanStack source edits request a fresh SSR document while ordinary Vite edits keep HMR", () => {
  const route = { path: "src/routes/index.tsx", content: `import {createFileRoute} from '@tanstack/react-router'; export const Route = createFileRoute('/')({component: Home});` };
  assert.ok(attachPreviewRevision([route], "r").reloadWhenChanged.includes(route.path));
  const app = { path: "src/App.tsx", content: 'export default function App() {return <h1>Hello</h1>}' };
  assert.equal(attachPreviewRevision([app], "r").reloadWhenChanged.length, 0);
});
