/**
 * Rolling preview-gate metrics over the last 50 generations.
 *
 * Tracks first-boot success, independent-verifier repair acceptance, false-green
 * rate, duration, and credit cost — the accept criteria for this week's gate.
 */
import { recordEvent } from "../observability/events.ts";

export const PREVIEW_GATE_WINDOW = 50;

export interface PreviewGateSample {
  at: number;
  firstBootSuccess: boolean;
  repairAccepted: boolean | null;
  falseGreen: boolean;
  durationMs: number;
  costCredits: number;
}

export interface PreviewGateWindowStats {
  n: number;
  firstBootSuccessRate: number;
  repairAcceptanceRate: number;
  falseGreenRate: number;
  medianDurationMs: number;
  totalCostCredits: number;
  meanCostCredits: number;
}

const samples: PreviewGateSample[] = [];

export function resetPreviewGateMetrics(): void {
  samples.length = 0;
}

export function recordPreviewGateSample(sample: Omit<PreviewGateSample, "at"> & { at?: number }): PreviewGateWindowStats {
  samples.push({
    at: sample.at ?? Date.now(),
    firstBootSuccess: sample.firstBootSuccess,
    repairAccepted: sample.repairAccepted,
    falseGreen: sample.falseGreen,
    durationMs: Math.max(0, sample.durationMs),
    costCredits: Math.max(0, sample.costCredits),
  });
  if (samples.length > PREVIEW_GATE_WINDOW) samples.splice(0, samples.length - PREVIEW_GATE_WINDOW);
  const stats = previewGateWindowStats();
  recordEvent("preview_gate_window", {
    n: stats.n,
    firstBootSuccessRate: stats.firstBootSuccessRate,
    repairAcceptanceRate: stats.repairAcceptanceRate,
    falseGreenRate: stats.falseGreenRate,
    medianDurationMs: stats.medianDurationMs,
    totalCostCredits: stats.totalCostCredits,
  });
  return stats;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function previewGateWindowStats(): PreviewGateWindowStats {
  const n = samples.length;
  if (n === 0) {
    return {
      n: 0,
      firstBootSuccessRate: 0,
      repairAcceptanceRate: 0,
      falseGreenRate: 0,
      medianDurationMs: 0,
      totalCostCredits: 0,
      meanCostCredits: 0,
    };
  }
  const repairs = samples.filter((sample) => sample.repairAccepted != null);
  const firstBoot = samples.filter((sample) => sample.firstBootSuccess).length;
  const accepted = repairs.filter((sample) => sample.repairAccepted === true).length;
  const falseGreen = samples.filter((sample) => sample.falseGreen).length;
  const totalCostCredits = samples.reduce((sum, sample) => sum + sample.costCredits, 0);
  return {
    n,
    firstBootSuccessRate: firstBoot / n,
    repairAcceptanceRate: repairs.length === 0 ? 0 : accepted / repairs.length,
    falseGreenRate: falseGreen / n,
    medianDurationMs: median(samples.map((sample) => sample.durationMs)),
    totalCostCredits,
    meanCostCredits: totalCostCredits / n,
  };
}
