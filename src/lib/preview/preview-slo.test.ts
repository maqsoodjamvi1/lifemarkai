import assert from "node:assert/strict";
import test from "node:test";
import { getPreviewSloSnapshot, recordPreviewSlo } from "./preview-slo.ts";

test("recordPreviewSlo appends and exposes last on the snapshot", () => {
  const rec = recordPreviewSlo("preview.boot_ms", { ms: 1200, projectId: "p1" });
  assert.equal(rec.event, "preview.boot_ms");
  assert.equal(rec.ms, 1200);
  const snap = getPreviewSloSnapshot();
  assert.equal(snap.last?.event, "preview.boot_ms");
  assert.ok(snap.recent.length >= 1);
});
