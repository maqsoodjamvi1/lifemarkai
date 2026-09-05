import assert from "node:assert/strict";
import test from "node:test";
import { createPreviewFileSync } from "./sync-preview-files.ts";

const files = (content: string) => [{ path: "src/App.tsx", content }];

test("in-flight writes finish before newest snapshot; intermediate snapshots are skipped", async () => {
  const sent: string[] = [];
  let finish!: () => void;
  const sync = createPreviewFileSync(async (snapshot) => {
    sent.push(snapshot[0].content);
    if (sent.length === 1) await new Promise<void>((resolve) => { finish = resolve; });
    return { ok: true };
  });
  const first = sync(files("first"));
  await Promise.resolve();
  const middle = sync(files("middle"));
  const newest = sync(files("newest"));
  assert.deepEqual(sent, ["first"]);
  finish();
  await Promise.all([first, middle, newest]);
  assert.deepEqual(sent, ["first", "newest"]);
});

test("identical successful snapshots do not upload again; edits do", async () => {
  let calls = 0;
  const sync = createPreviewFileSync(async () => { calls++; return { ok: true }; });
  await sync(files("one"));
  await sync(files("one"));
  assert.equal(calls, 1);
  await sync(files("two"));
  assert.equal(calls, 2);
});

test("failed writes can be retried with the same content", async () => {
  let calls = 0;
  const sync = createPreviewFileSync(async () => ({ ok: ++calls > 1 }));
  assert.equal((await sync(files("one"))).ok, false);
  assert.equal((await sync(files("one"))).ok, true);
  assert.equal(calls, 2);
});

test("a thrown request does not poison subsequent writes", async () => {
  let calls = 0;
  const sync = createPreviewFileSync(async () => {
    if (++calls === 1) throw new Error("network");
    return { ok: true };
  });
  await assert.rejects(sync(files("one")), /network/);
  assert.equal((await sync(files("two"))).ok, true);
});

test("sends deltas and deletions against the acknowledged revision", async () => {
  const sent: unknown[] = [];
  const sync = createPreviewFileSync(async (snapshot, options) => {
    sent.push({ snapshot, options }); return { ok: true, revision: String(sent.length) };
  });
  await sync([...files("old"), { path: "src/Deleted.tsx", content: "remove" }]);
  await sync(files("new"));
  assert.deepEqual(sent[1], { snapshot: files("new"), options: { complete: false, deletedPaths: ["src/Deleted.tsx"], baseRevision: "1" } });
});

test("worker/cache changes retry a complete snapshot without losing unsaved files", async () => {
  const sent: Array<{ files: unknown; complete?: boolean }> = [];
  const sync = createPreviewFileSync(async (snapshot, options) => {
    sent.push({ files: snapshot, complete: options?.complete });
    return sent.length === 2 ? { ok: false, fullSyncRequired: true } : { ok: true, revision: "revision" };
  });
  const context = { path: "vite.config.ts", content: "custom" };
  await sync([...files("old"), context]);
  await sync([...files("new"), context]);
  assert.deepEqual(sent[2], { files: [...files("new"), context], complete: true });
});

test("returning from a historical preview restores current files and removes historical-only files", async () => {
  const disk = new Map<string, string>();
  const sync = createPreviewFileSync(async (snapshot, options) => {
    if (options?.complete) disk.clear();
    for (const path of options?.deletedPaths ?? []) disk.delete(path);
    for (const file of snapshot) disk.set(file.path, file.content);
    return { ok: true, revision: "acknowledged" };
  });
  const current = [...files("current"), { path: "package.json", content: '{"dependencies":{"react":"19"}}' }];
  const historical = [...files("historical"), { path: "package.json", content: '{"dependencies":{"react":"18"}}' }, { path: "src/Legacy.tsx", content: "legacy" }];
  await sync(current);
  await sync(historical);
  assert.equal(disk.get("src/App.tsx"), "historical");
  await sync(current);
  assert.deepEqual([...disk.entries()].sort(), current.map((file) => [file.path, file.content]).sort());
  assert.equal(current[1].content, '{"dependencies":{"react":"19"}}');
});
