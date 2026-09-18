import assert from "node:assert/strict";
import test from "node:test";
import {
  PREVIEW_GATE_WINDOW,
  previewGateWindowStats,
  recordPreviewGateSample,
  resetPreviewGateMetrics,
} from "./preview-gate-metrics.ts";

test("records first-boot, repair acceptance, false-green, duration and cost over 50 generations", () => {
  resetPreviewGateMetrics();
  for (let i = 0; i < 40; i++) {
    recordPreviewGateSample({
      firstBootSuccess: i % 2 === 0,
      repairAccepted: i % 5 === 0 ? true : i % 5 === 1 ? false : null,
      falseGreen: i % 10 === 0,
      durationMs: 1_000 + i,
      costCredits: 1,
    });
  }
  const mid = previewGateWindowStats();
  assert.equal(mid.n, 40);
  assert.equal(mid.firstBootSuccessRate, 0.5);
  assert.ok(mid.repairAcceptanceRate > 0);
  assert.equal(mid.falseGreenRate, 0.1);
  assert.equal(mid.totalCostCredits, 40);
  assert.equal(mid.meanCostCredits, 1);

  for (let i = 0; i < 20; i++) {
    recordPreviewGateSample({
      firstBootSuccess: true,
      repairAccepted: true,
      falseGreen: false,
      durationMs: 500,
      costCredits: 2,
    });
  }
  const windowed = previewGateWindowStats();
  assert.equal(windowed.n, PREVIEW_GATE_WINDOW);
  assert.ok(windowed.firstBootSuccessRate > mid.firstBootSuccessRate);
  assert.equal(windowed.falseGreenRate, 0.06);
  resetPreviewGateMetrics();
  assert.equal(previewGateWindowStats().n, 0);
});
