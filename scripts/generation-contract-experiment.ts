#!/usr/bin/env node
/**
 * Generation-contract experiment.
 *
 * Default: run the deterministic fixture suite (40+ known first-boot
 * failure families, clustered) and print first-boot success, repair count,
 * duration, slice width, and defect-family clusters.
 *
 * Live architect runs (20–50 greenfield TanStack Start prompts) are opt-in:
 *   npx tsx scripts/generation-contract-experiment.ts --live --runs=20
 * They require OPENROUTER_API_KEY or OPENAI_API_KEY and are not part of CI.
 * Each run is one architect pass + scaffold validation, not a full build.
 * The live module is imported only on --live so CI fixture runs never load
 * the generation provider.
 */
import { readFileSync } from "node:fs";
import {
  formatContractExperimentReport,
  formatContractFailureReport,
  runContractExperiment,
  unexpectedContractOutcomes,
} from "../src/lib/ai/project-contract-experiment.ts";

function loadEnv(path = ".env.local") {
  try {
    for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* CI and shells can supply env without a local file */
  }
}

function argValue(name: string, fallback: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (!raw) return fallback;
  const parsed = Number(raw.slice(name.length + 1));
  return Number.isFinite(parsed) ? parsed : fallback;
}

const live = process.argv.includes("--live");
if (live) {
  if (process.env.CI || process.env.GITHUB_ACTIONS || process.argv.includes("--check")) {
    console.error("Live paid-model experiments are disabled in CI/release checks.");
    process.exit(2);
  }
  loadEnv();
  if (!process.env.OPENROUTER_API_KEY?.trim() && !process.env.OPENAI_API_KEY?.trim()) {
    console.error("Live architect runs need OPENROUTER_API_KEY or OPENAI_API_KEY.");
    console.error("Fixture suite remains: npm run experiment:generation-contract");
    process.exit(2);
  }
  const { formatLiveArchitectReport, runLiveArchitectExperiment } =
    await import("../src/lib/ai/project-contract-live.ts");
  const runs = Math.min(50, Math.max(1, argValue("--runs", 20)));
  const report = await runLiveArchitectExperiment({ runs });
  console.log(formatLiveArchitectReport(report));
  process.exit(0);
}

const report = runContractExperiment();
console.log(formatContractExperimentReport(report));
console.log(formatContractFailureReport(report));
const mismatched = unexpectedContractOutcomes(report);
if (mismatched.length > 0) {
  process.exit(1);
}
