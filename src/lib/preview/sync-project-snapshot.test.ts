import assert from "node:assert/strict";
import test from "node:test";
import { mergePreviewSnapshot, validPreviewPath, previewDeleteCommand, previewDeleteScript } from "./sync-project-snapshot.ts";
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

test("deltas keep framework context and replace unsaved content before patching", () => {
  const result = mergePreviewSnapshot([{ path: "vite.config.ts", content: "custom" }, { path: "src/App.tsx", content: "old" }], [{ path: "src/App.tsx", content: "new" }], false, []);
  assert.deepEqual(result, [{ path: "vite.config.ts", content: "custom" }, { path: "src/App.tsx", content: "new" }]);
});
test("rename removes old path; complete snapshots omit stale database files", () => {
  const stored = [{ path: "src/Old.tsx", content: "old" }];
  const incoming = [{ path: "src/New.tsx", content: "new" }];
  assert.deepEqual(mergePreviewSnapshot(stored, incoming, false, ["src/Old.tsx"]), incoming);
  assert.deepEqual(mergePreviewSnapshot(stored, incoming, true, []), incoming);
});
test("sync refuses traversal, installed trees, absolute paths and reserved manifests", () => {
  for (const path of ["../secret", "src/../../secret", "/etc/passwd", "C:/secret", "node_modules/react/index.js", "src/../x", ".git/config", ".lm-sync-manifest.json", "src\\x", "src/\0x"]) {
    assert.equal(validPreviewPath(path), false, path);
    assert.throws(() => previewDeleteCommand([path]), /Invalid/);
  }
});

test("deletion removes a project file but refuses a symlinked parent escape", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "lifemark-delete-test-"));
  try {
    const workspace = join(fixture, "workspace");
    const outside = join(fixture, "outside");
    await mkdir(workspace); await mkdir(outside);
    await writeFile(join(workspace, "old.ts"), "old");
    await writeFile(join(outside, "keep.ts"), "keep");
    execFileSync(process.execPath, ["-e", previewDeleteScript(["old.ts"])], { cwd: workspace });
    await assert.rejects(readFile(join(workspace, "old.ts")), { code: "ENOENT" });
    await symlink(outside, join(workspace, "linked"), process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => execFileSync(process.execPath, ["-e", previewDeleteScript(["linked/keep.ts"])], { cwd: workspace, stdio: "pipe" }), /escaped project/);
    assert.equal(await readFile(join(outside, "keep.ts"), "utf8"), "keep");
  } finally {
    if (resolve(dirname(fixture)) === resolve(tmpdir()) && fixture.includes("lifemark-delete-test-")) await rm(fixture, { recursive: true, force: true });
  }
});
