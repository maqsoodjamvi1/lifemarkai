/**
 * Fixture experiment for the generation contract.
 *
 * Live 20–50 LLM runs need API keys and minutes each; this module measures the
 * same failure families against deterministic apps so first-boot success,
 * repair-slice width, and defect clustering are observable in CI.
 */
import { tanstackStartScaffold } from "../templates/tanstack-start-scaffold.ts";
import {
  buildFallbackProjectContract,
  ensureContractFile,
  parseProjectContract,
  type ProjectContract,
} from "./project-contract.ts";
import {
  restrictGeneratedFilesToContract,
  validateFilesAgainstProjectContract,
} from "./project-contract-validate.ts";
import { selectRepairSlice } from "./repair-slice.ts";
import { fingerprintValidation } from "./failure-fingerprint.ts";
import { clusterFailures, type FailureFamily } from "./failure-cluster.ts";

export type ContractExperimentFamily =
  | "valid"
  | "missing-export"
  | "fabricated-import"
  | "undeclared-file"
  | "missing-file"
  | "undeclared-package"
  | "invalid-package"
  | "missing-route"
  | "undeclared-edge"
  | "preview-timeout"
  | "typecheck"
  | "build";

export interface ContractExperimentFixture {
  id: string;
  family: ContractExperimentFamily;
  prompt: string;
  files: Array<{ path: string; content: string; language?: string }>;
  contract: ProjectContract;
  expectFirstBoot: boolean;
  injectedErrors?: Array<{ type?: string; message: string; file?: string | null }>;
}

export interface ContractExperimentRun {
  id: string;
  family: ContractExperimentFamily;
  classifiedFamily: FailureFamily | "none";
  firstBootSuccess: boolean;
  repairCount: number;
  durationMs: number;
  errorCount: number;
  sliceWidth: number;
  fingerprints: string[];
  clusters: FailureFamily[];
}

export interface ContractExperimentReport {
  runs: number;
  firstBootSuccesses: number;
  firstBootSuccessRate: number;
  meanRepairCount: number;
  meanDurationMs: number;
  meanSliceWidth: number;
  byFamily: Record<string, { runs: number; firstBootSuccesses: number }>;
  byCluster: Record<string, number>;
  results: ContractExperimentRun[];
}

type File = { path: string; content: string; language?: string };

function baseApp(prompt: string): { files: File[]; contract: ProjectContract } {
  const contract = buildFallbackProjectContract(prompt);
  return { files: ensureContractFile(tanstackStartScaffold({}, "Experiment"), contract), contract };
}

function withFile(files: File[], path: string, content: string): File[] {
  const language = path.endsWith("tsx") ? "typescriptreact" : path.endsWith("ts") ? "typescript" : "json";
  const index = files.findIndex((file) => file.path === path);
  const next = { path, content, language };
  if (index >= 0) {
    const copy = files.slice();
    copy[index] = next;
    return copy;
  }
  return [...files, next];
}

function withoutFile(files: File[], path: string): File[] {
  return files.filter((file) => file.path !== path);
}

export const CONTRACT_EXPERIMENT_PROMPTS = [
  "Build a neighborhood bakery landing page",
  "Build a dental clinic marketing site",
  "Build a fitness coaching landing page",
  "Build a coffee shop website",
  "Build a law firm landing page",
  "Build a florist shop website",
  "Build a yoga studio landing page",
  "Build a real estate agency site",
  "Build a pet grooming landing page",
  "Build a photography studio website",
] as const;

function validFixtures(): ContractExperimentFixture[] {
  return CONTRACT_EXPERIMENT_PROMPTS.map((prompt, index) => {
    const app = baseApp(prompt);
    return {
      id: `valid-${index + 1}`,
      family: "valid",
      prompt,
      files: app.files,
      contract: app.contract,
      expectFirstBoot: true,
    };
  });
}

function mutationFixtures(): ContractExperimentFixture[] {
  const fixtures: ContractExperimentFixture[] = [];
  const prompt = CONTRACT_EXPERIMENT_PROMPTS[0];
  const app = baseApp(prompt);

  fixtures.push({
    id: "missing-export-cn",
    family: "missing-export",
    prompt,
    contract: app.contract,
    files: withFile(app.files, "src/lib/utils.ts", "export const unused = true;\n"),
    expectFirstBoot: false,
  });
  fixtures.push({
    id: "missing-export-header",
    family: "missing-export",
    prompt,
    contract: app.contract,
    files: withFile(app.files, "src/components/layout/Header.tsx", "export function Nav() { return <header />; }\n"),
    expectFirstBoot: false,
  });
  fixtures.push({
    id: "missing-export-getRouter",
    family: "missing-export",
    prompt,
    contract: app.contract,
    files: withFile(app.files, "src/router.tsx", "export const router = {};\n"),
    expectFirstBoot: false,
  });

  fixtures.push({
    id: "fabricated-import-missing-module",
    family: "fabricated-import",
    prompt,
    contract: parseProjectContract({
      files: [
        { path: "src/components/Ghost.tsx", owner: "product", purpose: "ghost", exports: [{ name: "Ghost" }], dependsOn: [] },
        { path: "src/routes/index.tsx", dependsOn: ["src/components/Ghost.tsx"], exports: [{ name: "Route" }] },
      ],
    }, { fallback: app.contract }).contract,
    files: withFile(
      app.files,
      "src/routes/index.tsx",
      `import { createFileRoute } from "@tanstack/react-router";
import { Ghost } from "../components/Ghost";
export const Route = createFileRoute("/")({ component: () => <Ghost /> });
`,
    ),
    expectFirstBoot: false,
  });
  fixtures.push({
    id: "fabricated-import-wrong-symbol",
    family: "fabricated-import",
    prompt,
    contract: app.contract,
    files: withFile(
      app.files,
      "src/routes/__root.tsx",
      app.files.find((file) => file.path === "src/routes/__root.tsx")!.content.replace("SiteChrome", "ChromeShell"),
    ),
    expectFirstBoot: false,
  });

  for (const extra of ["src/components/Hero.tsx", "src/pages/Home.tsx", "src/App.tsx", "lib/extra.ts", "src/main.tsx", "index.html"]) {
    fixtures.push({
      id: `undeclared-${extra.replace(/\W+/g, "-")}`,
      family: "undeclared-file",
      prompt,
      contract: app.contract,
      files: withFile(app.files, extra, "export const Extra = 1;\n"),
      expectFirstBoot: false,
    });
  }

  fixtures.push({
    id: "missing-home-route-file",
    family: "missing-file",
    prompt,
    contract: app.contract,
    files: withoutFile(app.files, "src/routes/index.tsx"),
    expectFirstBoot: false,
  });
  fixtures.push({
    id: "missing-utils",
    family: "missing-file",
    prompt,
    contract: app.contract,
    files: withoutFile(app.files, "src/lib/utils.ts"),
    expectFirstBoot: false,
  });

  fixtures.push({
    id: "undeclared-package-axios",
    family: "undeclared-package",
    prompt,
    contract: app.contract,
    files: withFile(
      app.files,
      "src/routes/index.tsx",
      `import { createFileRoute } from "@tanstack/react-router";
import axios from "axios";
export const Route = createFileRoute("/")({ component: () => <div>{String(axios)}</div> });
`,
    ),
    expectFirstBoot: false,
  });
  fixtures.push({
    id: "undeclared-package-lodash",
    family: "undeclared-package",
    prompt,
    contract: app.contract,
    files: withFile(
      app.files,
      "src/lib/utils.ts",
      `import _ from "lodash";
export function cn() { return _.join(["a"], " "); }
`,
    ),
    expectFirstBoot: false,
  });

  fixtures.push({
    id: "missing-route-about",
    family: "missing-route",
    prompt,
    contract: parseProjectContract({
      files: [{ path: "src/routes/about.tsx", owner: "product", exports: [{ name: "Route" }], dependsOn: [] }],
      routes: [{ path: "/about", file: "src/routes/about.tsx" }],
    }, { fallback: app.contract }).contract,
    files: app.files,
    expectFirstBoot: false,
  });
  fixtures.push({
    id: "missing-createFileRoute",
    family: "missing-route",
    prompt,
    contract: app.contract,
    files: withFile(app.files, "src/routes/index.tsx", "export function Home() { return <main />; }\n"),
    expectFirstBoot: false,
  });

  fixtures.push({
    id: "undeclared-edge-utils",
    family: "undeclared-edge",
    prompt,
    contract: app.contract,
    files: withFile(
      app.files,
      "src/routes/index.tsx",
      `import { createFileRoute } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
export const Route = createFileRoute("/")({ component: () => <div className={cn("p-8")} /> });
`,
    ),
    expectFirstBoot: false,
  });
  fixtures.push({
    id: "undeclared-edge-header",
    family: "undeclared-edge",
    prompt,
    contract: app.contract,
    files: withFile(
      app.files,
      "src/routes/index.tsx",
      `import { createFileRoute } from "@tanstack/react-router";
import { Header } from "../components/layout/Header";
export const Route = createFileRoute("/")({ component: () => <Header /> });
`,
    ),
    expectFirstBoot: false,
  });
  fixtures.push({
    id: "undeclared-edge-footer",
    family: "undeclared-edge",
    prompt,
    contract: app.contract,
    files: withFile(
      app.files,
      "src/routes/index.tsx",
      `import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "../components/layout/Footer";
export const Route = createFileRoute("/")({ component: () => <Footer /> });
`,
    ),
    expectFirstBoot: false,
  });

  fixtures.push({
    id: "missing-export-footer",
    family: "missing-export",
    prompt,
    contract: app.contract,
    files: withFile(app.files, "src/components/layout/Footer.tsx", "export function Bottom() { return <footer />; }\n"),
    expectFirstBoot: false,
  });
  fixtures.push({
    id: "missing-export-site-chrome",
    family: "missing-export",
    prompt,
    contract: app.contract,
    files: withFile(app.files, "src/components/layout/SiteChrome.tsx", "export function Shell() { return <div />; }\n"),
    expectFirstBoot: false,
  });

  fixtures.push({
    id: "fabricated-import-missing-helper",
    family: "fabricated-import",
    prompt,
    contract: parseProjectContract({
      files: [
        { path: "src/lib/pricing.ts", owner: "product", purpose: "ghost helper", exports: [{ name: "price" }], dependsOn: [] },
        { path: "src/routes/index.tsx", dependsOn: ["src/lib/pricing.ts"], exports: [{ name: "Route" }] },
      ],
    }, { fallback: app.contract }).contract,
    files: withFile(
      app.files,
      "src/routes/index.tsx",
      `import { createFileRoute } from "@tanstack/react-router";
import { price } from "../lib/pricing";
export const Route = createFileRoute("/")({ component: () => <div>{price()}</div> });
`,
    ),
    expectFirstBoot: false,
  });

  fixtures.push({
    id: "missing-header-file",
    family: "missing-file",
    prompt,
    contract: app.contract,
    files: withoutFile(app.files, "src/components/layout/Header.tsx"),
    expectFirstBoot: false,
  });
  fixtures.push({
    id: "missing-root-route",
    family: "missing-file",
    prompt,
    contract: app.contract,
    files: withoutFile(app.files, "src/routes/__root.tsx"),
    expectFirstBoot: false,
  });

  fixtures.push({
    id: "undeclared-package-moment",
    family: "undeclared-package",
    prompt,
    contract: app.contract,
    files: withFile(
      app.files,
      "src/routes/index.tsx",
      `import { createFileRoute } from "@tanstack/react-router";
import moment from "moment";
export const Route = createFileRoute("/")({ component: () => <div>{String(moment)}</div> });
`,
    ),
    expectFirstBoot: false,
  });

  fixtures.push({
    id: "invalid-package-left-pad",
    family: "invalid-package",
    prompt,
    contract: app.contract,
    files: withFile(
      app.files,
      "src/lib/utils.ts",
      `import leftPad from "left-pad";
export function cn() { return leftPad("x", 2); }
`,
    ),
    expectFirstBoot: false,
  });
  fixtures.push({
    id: "invalid-package-jquery",
    family: "invalid-package",
    prompt,
    contract: app.contract,
    files: withFile(
      app.files,
      "src/routes/index.tsx",
      `import { createFileRoute } from "@tanstack/react-router";
import $ from "jquery";
export const Route = createFileRoute("/")({ component: () => <div>{String($)}</div> });
`,
    ),
    expectFirstBoot: false,
  });

  fixtures.push({
    id: "missing-route-contact",
    family: "missing-route",
    prompt,
    contract: parseProjectContract({
      files: [{ path: "src/routes/contact.tsx", owner: "product", exports: [{ name: "Route" }], dependsOn: [] }],
      routes: [{ path: "/contact", file: "src/routes/contact.tsx" }],
    }, { fallback: app.contract }).contract,
    files: app.files,
    expectFirstBoot: false,
  });

  fixtures.push({
    id: "preview-timeout-boot",
    family: "preview-timeout",
    prompt,
    contract: app.contract,
    files: app.files,
    expectFirstBoot: false,
    injectedErrors: [{ type: "preview_timeout", message: "Preview timed out after 60000ms waiting for Vite ready" }],
  });
  fixtures.push({
    id: "preview-timeout-hang",
    family: "preview-timeout",
    prompt,
    contract: app.contract,
    files: app.files,
    expectFirstBoot: false,
    injectedErrors: [{ message: "sandbox boot timed out: ETIMEDOUT connecting to preview host" }],
  });
  fixtures.push({
    id: "typecheck-ts2304",
    family: "typecheck",
    prompt,
    contract: app.contract,
    files: app.files,
    expectFirstBoot: false,
    injectedErrors: [{ message: "src/routes/index.tsx:12:4 — TS2304: Cannot find name 'HeroTitle'." }],
  });
  fixtures.push({
    id: "typecheck-ts2305",
    family: "typecheck",
    prompt,
    contract: app.contract,
    files: app.files,
    expectFirstBoot: false,
    injectedErrors: [{ message: "src/router.tsx:3:10 — TS2305: Module has no exported member 'Body'." }],
  });
  fixtures.push({
    id: "build-vite-failed",
    family: "build",
    prompt,
    contract: app.contract,
    files: app.files,
    expectFirstBoot: false,
    injectedErrors: [{ message: "vite build failed to compile: Could not resolve ./Ghost.tsx" }],
  });

  return fixtures;
}

export const CONTRACT_EXPERIMENT_FIXTURES: ContractExperimentFixture[] = [
  ...validFixtures(),
  ...mutationFixtures(),
];

export function scoreContractFixture(fixture: ContractExperimentFixture): ContractExperimentRun {
  const started = Date.now();
  const restricted = restrictGeneratedFilesToContract(fixture.files, [], fixture.contract);
  const errors = [
    ...restricted.dropped.map((path) => ({
      type: "undeclared_file",
      file: path,
      message: `${path} was generated but is not listed in the contract`,
      severity: "error" as const,
    })),
    ...validateFilesAgainstProjectContract(restricted.files, [], fixture.contract),
    ...(fixture.injectedErrors ?? []).map((error) => ({
      type: error.type ?? "injected",
      file: error.file ?? null,
      message: error.message,
      severity: "error" as const,
    })),
  ];
  const firstBootSuccess = errors.length === 0;
  const slice = selectRepairSlice(restricted.files, errors.map((error) => error.message), fixture.contract);
  const clusters = clusterFailures(errors);
  return {
    id: fixture.id,
    family: fixture.family,
    classifiedFamily: clusters[0]?.family ?? "none",
    firstBootSuccess,
    repairCount: firstBootSuccess ? 0 : 1,
    durationMs: Date.now() - started,
    errorCount: errors.length,
    sliceWidth: slice.paths.length,
    fingerprints: errors.map((error) => fingerprintValidation(error).fingerprint),
    clusters: clusters.map((item) => item.family),
  };
}

export function runContractExperiment(
  fixtures: ContractExperimentFixture[] = CONTRACT_EXPERIMENT_FIXTURES,
): ContractExperimentReport {
  const results = fixtures.map(scoreContractFixture);
  const firstBootSuccesses = results.filter((result) => result.firstBootSuccess).length;
  const byFamily: ContractExperimentReport["byFamily"] = {};
  const byCluster: Record<string, number> = {};
  for (const result of results) {
    const bucket = byFamily[result.family] ?? { runs: 0, firstBootSuccesses: 0 };
    bucket.runs += 1;
    if (result.firstBootSuccess) bucket.firstBootSuccesses += 1;
    byFamily[result.family] = bucket;
    for (const family of result.clusters) {
      byCluster[family] = (byCluster[family] ?? 0) + 1;
    }
  }
  return {
    runs: results.length,
    firstBootSuccesses,
    firstBootSuccessRate: firstBootSuccesses / results.length,
    meanRepairCount: results.reduce((sum, result) => sum + result.repairCount, 0) / results.length,
    meanDurationMs: results.reduce((sum, result) => sum + result.durationMs, 0) / results.length,
    meanSliceWidth: results.reduce((sum, result) => sum + result.sliceWidth, 0) / results.length,
    byFamily,
    byCluster,
    results,
  };
}

export function formatContractExperimentReport(report: ContractExperimentReport): string {
  const families = Object.entries(report.byFamily)
    .map(([family, stats]) =>
      `  ${family.padEnd(22)} ${String(stats.firstBootSuccesses).padStart(2)}/${stats.runs} first-boot`,
    )
    .join("\n");
  const clusters = Object.entries(report.byCluster)
    .sort((a, b) => b[1] - a[1])
    .map(([family, count]) => `  ${family.padEnd(22)} ${count}`)
    .join("\n");
  return [
    `Generation-contract experiment: ${report.runs} runs`,
    `First-boot success: ${report.firstBootSuccesses}/${report.runs} (${(report.firstBootSuccessRate * 100).toFixed(1)}%)`,
    `Mean repair count: ${report.meanRepairCount.toFixed(2)}`,
    `Mean duration: ${report.meanDurationMs.toFixed(2)}ms`,
    `Mean repair-slice width: ${report.meanSliceWidth.toFixed(1)} files`,
    "By family:",
    families,
    "Clustered defect families:",
    clusters || "  (none)",
  ].join("\n");
}
