import test from "node:test";
import assert from "node:assert/strict";
import { requiresFrameworkRuntime } from "./requires-framework-runtime.ts";

test("a valid named TanStack file route requires the router, not a default App export", () => {
  assert.equal(requiresFrameworkRuntime([{ path: "src/routes/index.tsx", content: `import { createFileRoute } from '@tanstack/react-router'; export const Route = createFileRoute('/')({ component: Home }); function Home() { return <h1>Bakery</h1> }` }]), true);
});
test("detects framework runtime before routes have streamed in", () => {
  assert.equal(requiresFrameworkRuntime([{ path: "package.json", content: '{"dependencies":{"@tanstack/react-start":"^1.168.0"}}' }]), true);
});
test("ordinary React App modules retain instant preview", () => {
  assert.equal(requiresFrameworkRuntime([{ path: "src/App.tsx", content: 'export default function App() { return <h1>Bakery</h1> }' }]), false);
});
