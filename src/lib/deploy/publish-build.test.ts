import test from "node:test";
import assert from "node:assert/strict";
import { publishBuild } from "./publish-build.ts";
import { tanstackStartScaffold } from "../templates/tanstack-start-scaffold.ts";

test("failed Vite compilation never publishes an error-page fallback", async () => {
  const logs: string[] = [];
  let compiled = false;
  const result = await publishBuild("test-project", tanstackStartScaffold({}), (line) => logs.push(line), "https://example.com/preview-by-slug/test", async (_files, onLog, url) => {
    compiled = true;
    assert.equal(url, "https://example.com/preview-by-slug/test");
    onLog?.("Missing export Contacts from lucide-react");
    return null;
  });
  assert.equal(compiled, true);
  assert.equal(result.ok, false);
  assert.equal(result.buildId, null);
  assert.equal(result.fileCount, 0);
  assert.equal(result.compiled, false);
  assert.ok(logs.some((line) => line.includes("Missing export Contacts")));
  assert.equal(logs.some((line) => line.includes("stored") || line.includes("publishing bundled")), false);
});
