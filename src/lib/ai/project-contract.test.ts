import assert from "node:assert/strict";
import test from "node:test";
import { tanstackStartScaffold } from "../templates/tanstack-start-scaffold.ts";
import {
  buildFallbackProjectContract,
  collectContractSmokeRoutes,
  contractAsProjectFile,
  ensureContractFile,
  extractJsonObject,
  parseProjectContract,
  PROJECT_CONTRACT_PATH,
  serializeProjectContract,
  shouldGenerateProjectContract,
} from "./project-contract.ts";
import {
  applyGeneratedContract,
  constrainRepairFiles,
  dropForbiddenTanStackMergeFiles,
  extendProjectContract,
  formatProjectContractErrors,
  isForbiddenTanStackEntry,
  scoreContractAgainstScaffold,
  shouldLiveStreamGeneratedPath,
  restrictGeneratedFilesToContract,
  undeclaredFileErrors,
  validateFilesAgainstProjectContract,
} from "./project-contract-validate.ts";
import { renderProjectContractPromptBlock } from "./project-contract-prompt.ts";
import { selectRepairSlice } from "./repair-slice.ts";
import { runContractExperiment, CONTRACT_EXPERIMENT_FIXTURES, CONTRACT_EXPERIMENT_PROMPTS, type ContractExperimentFamily } from "./project-contract-experiment.ts";

function filesFromScaffold() {
  return tanstackStartScaffold({}, "Neighborhood Bakery");
}

test("fallback TanStack contract is structurally valid and acyclic", () => {
  const parsed = parseProjectContract(buildFallbackProjectContract("Build a bakery site"));
  assert.equal(parsed.issues.filter((issue) => issue.severity === "error").length, 0);
  assert.ok(parsed.generationOrder.includes("src/lib/utils.ts"));
  assert.ok(parsed.generationOrder.indexOf("src/components/layout/SiteChrome.tsx") >
    parsed.generationOrder.indexOf("src/components/layout/Header.tsx"));
  assert.ok(parsed.contract.routes.some((route) => route.path === "/" && route.file === "src/routes/index.tsx"));
});

test("parseProjectContract accepts CodeTeam-style SDS fields", () => {
  const parsed = parseProjectContract({
    tech_stack: { framework: "TanStack Start" },
    files: [
      {
        path: "src/components/Hero.tsx",
        purpose: "hero",
        owner: "product",
        public_api: ["Hero"],
        depends_on: ["src/lib/utils.ts"],
      },
    ],
    routes: [{ path: "/about", file: "src/routes/about.tsx" }],
  }, { prompt: "Build a bakery with about page" });
  assert.ok(parsed.contract.files.some((file) => file.path === "src/components/Hero.tsx"));
  assert.ok(parsed.contract.files.find((file) => file.path === "src/components/Hero.tsx")?.exports.some((item) => item.name === "Hero"));
  assert.equal(parsed.issues.some((issue) => issue.code === "route-file-missing"), true);
});

test("cyclic dependsOn is rejected", () => {
  const fallback = buildFallbackProjectContract("Build a CRM");
  const parsed = parseProjectContract({
    files: [
      { path: "src/a.ts", exports: [], dependsOn: ["src/b.ts"] },
      { path: "src/b.ts", exports: [], dependsOn: ["src/a.ts"] },
    ],
  }, { fallback });
  assert.ok(parsed.issues.some((issue) => issue.code === "dependency-cycle"));
});

test("disallowed packages fail the contract", () => {
  const parsed = parseProjectContract({
    packages: [{ name: "axios" }],
  }, { prompt: "Build a site" });
  assert.ok(parsed.issues.some((issue) => issue.code === "disallowed-package"));
});

test("shouldGenerateProjectContract is limited to greenfield TanStack builds", () => {
  assert.equal(shouldGenerateProjectContract({ mode: "build", greenfield: true, framework: "tanstack-start" }), true);
  assert.equal(shouldGenerateProjectContract({ mode: "chat", greenfield: true, framework: "tanstack-start" }), false);
  assert.equal(shouldGenerateProjectContract({ mode: "build", greenfield: false, framework: "tanstack-start" }), false);
  assert.equal(shouldGenerateProjectContract({ mode: "build", greenfield: true, framework: "react" }), false);
});

test("collectContractSmokeRoutes reads TanStack file routes and contracted extras", () => {
  const contract = buildFallbackProjectContract("Build a bakery");
  contract.routes.push({ path: "/about", file: "src/routes/about.tsx" });
  const routes = collectContractSmokeRoutes(
    [
      { path: "src/routes/index.tsx" },
      { path: "src/routes/__root.tsx" },
      { path: "src/routes/about.tsx" },
      { path: "src/routes/contact.tsx" },
      { path: "src/routes/$id.tsx" },
    ],
    contract,
  );
  assert.ok(routes.includes("/about"));
  assert.ok(routes.includes("/contact"));
  assert.equal(routes.includes("/"), false);
  assert.equal(routes.some((route) => route.includes("$")), false);
});

test("collectContractSmokeRoutes includes contracted acceptance-test targets", () => {
  const contract = buildFallbackProjectContract("Build a bakery");
  contract.acceptanceTests.push({
    id: "smoke-menu",
    description: "menu page",
    kind: "smoke",
    target: "/menu",
  });
  const routes = collectContractSmokeRoutes([{ path: "src/routes/index.tsx" }], contract);
  assert.ok(routes.includes("/menu"));
});

test("applyGeneratedContract injects project-contract.json and drops extras", () => {
  const contract = buildFallbackProjectContract("Build a bakery");
  const applied = applyGeneratedContract(
    [
      ...filesFromScaffold(),
      { path: "src/components/Ghost.tsx", content: "export const Ghost = 1;\n", language: "typescriptreact" },
    ],
    [],
    contract,
  );
  assert.ok(applied.dropped.includes("src/components/Ghost.tsx"));
  assert.ok(applied.files.some((file) => file.path === PROJECT_CONTRACT_PATH));
});

test("later edits keep requested routes and merge them into the contract", () => {
  const existing = filesFromScaffold();
  const contract = buildFallbackProjectContract("Build a bakery");
  const about = {
    path: "src/routes/about.tsx",
    content: `import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/about")({
  component: () => <main>About</main>,
});
`,
    language: "typescriptreact",
  };
  const ghost = { path: "src/components/Ghost.tsx", content: "export const Ghost = 1;\n", language: "typescriptreact" };
  const applied = applyGeneratedContract([...existing, about, ghost], existing, contract);
  assert.ok(applied.files.some((file) => file.path === "src/routes/about.tsx"));
  assert.ok(applied.dropped.includes("src/components/Ghost.tsx"));
  assert.ok(applied.contract.routes.some((route) => route.path === "/about" && route.file === "src/routes/about.tsx"));
  assert.ok(applied.contract.acceptanceTests.some((test) => test.target === "/about"));
});

test("extendProjectContract records new local edges on existing files", () => {
  const existing = filesFromScaffold();
  const contract = buildFallbackProjectContract("Build a bakery");
  const card = {
    path: "src/components/MenuCard.tsx",
    content: "export function MenuCard() { return <div>Card</div>; }\n",
    language: "typescriptreact",
  };
  const about = {
    path: "src/routes/about.tsx",
    content: `import { createFileRoute } from "@tanstack/react-router";
import { MenuCard } from "@/components/MenuCard";
export const Route = createFileRoute("/about")({
  component: () => <MenuCard />,
});
`,
    language: "typescriptreact",
  };
  const extended = extendProjectContract(contract, [...existing, about, card], existing);
  assert.ok(extended.files.some((file) => file.path === "src/components/MenuCard.tsx"));
  const aboutFile = extended.files.find((file) => file.path === "src/routes/about.tsx");
  assert.ok(aboutFile?.dependsOn.includes("src/components/MenuCard.tsx"));
});

test("constrainRepairFiles drops TanStack Vite entries and unused extras", () => {
  const existing = filesFromScaffold();
  const contract = buildFallbackProjectContract("Build a bakery");
  const constrained = constrainRepairFiles(
    [
      { path: "src/App.tsx", content: "export default function App() { return null; }\n", language: "typescriptreact" },
      { path: "src/routes/index.tsx", content: existing.find((file) => file.path === "src/routes/index.tsx")?.content ?? "", language: "typescriptreact" },
      {
        path: "src/routes/about.tsx",
        content: `import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/about")({ component: () => <main>About</main> });
`,
        language: "typescriptreact",
      },
    ],
    existing,
    contract,
  );
  assert.ok(constrained.dropped.includes("src/App.tsx"));
  assert.ok(constrained.files.some((file) => file.path === "src/routes/index.tsx"));
  assert.ok(constrained.files.some((file) => file.path === "src/routes/about.tsx"));
  assert.ok(constrained.contract?.routes.some((route) => route.path === "/about"));
});

test("constrainRepairFiles drops Vite entries even when only the proposed set is TanStack", () => {
  const constrained = constrainRepairFiles(
    [
      {
        path: "src/routes/__root.tsx",
        content: "export const Route = { component: () => null };\n",
        language: "typescriptreact",
      },
      { path: "src/App.tsx", content: "export default function App() { return null; }\n", language: "typescriptreact" },
      { path: "src/main.tsx", content: "import App from './App'\n", language: "typescriptreact" },
    ],
    [],
    null,
  );
  assert.ok(constrained.dropped.includes("src/App.tsx"));
  assert.ok(constrained.dropped.includes("src/main.tsx"));
  assert.ok(constrained.files.some((file) => file.path === "src/routes/__root.tsx"));
});

test("constrainRepairFiles keeps an explicitly requested component and still drops App.tsx", () => {
  const existing = filesFromScaffold();
  const contract = buildFallbackProjectContract("Build a bakery");
  const constrained = constrainRepairFiles(
    [
      {
        path: "src/components/Pricing.tsx",
        content: "export function Pricing() { return null; }\n",
        language: "typescriptreact",
      },
      { path: "src/App.tsx", content: "export default function App() { return null; }\n", language: "typescriptreact" },
    ],
    existing,
    contract,
    ["src/components/Pricing.tsx", "src/App.tsx"],
  );
  assert.ok(constrained.files.some((file) => file.path === "src/components/Pricing.tsx"));
  assert.ok(constrained.dropped.includes("src/App.tsx"));
  assert.ok(constrained.contract?.files.some((file) => file.path === "src/components/Pricing.tsx"));
});

test("constrainRepairFiles keeps a requested .env.local on a contracted app", () => {
  const existing = filesFromScaffold();
  const contract = buildFallbackProjectContract("Build a bakery");
  const constrained = constrainRepairFiles(
    [{ path: ".env.local", content: "VITE_SUPABASE_URL=https://example.supabase.co\n", language: "plaintext" }],
    existing,
    contract,
    [".env.local"],
  );
  assert.ok(constrained.files.some((file) => file.path === ".env.local"));
  assert.ok(constrained.contract?.files.some((file) => file.path === ".env.local"));
});

test("constrainRepairFiles keeps a requested non-code manifest on a contracted app", () => {
  const existing = filesFromScaffold();
  const contract = buildFallbackProjectContract("Build a bakery");
  const constrained = constrainRepairFiles(
    [{ path: ".lifemark/mcp/manifest.json", content: "{\"name\":\"app-mcp\"}\n", language: "json" }],
    existing,
    contract,
    [".lifemark/mcp/manifest.json"],
  );
  assert.ok(constrained.files.some((file) => file.path === ".lifemark/mcp/manifest.json"));
  assert.ok(constrained.contract?.files.some((file) => file.path === ".lifemark/mcp/manifest.json"));
});

test("dropForbiddenTanStackMergeFiles keeps extras but strips Vite entries on Start apps", () => {
  const merged = dropForbiddenTanStackMergeFiles(
    [
      { path: "src/App.tsx", content: "export default function App() { return null; }" },
      { path: "src/components/Imported.tsx", content: "export function Imported() { return null; }" },
      { path: "index.html", content: "<div id='root'></div>" },
    ],
    [{ path: "src/routes/__root.tsx" }],
  );
  assert.deepEqual(merged.dropped.sort(), ["index.html", "src/App.tsx"]);
  assert.equal(merged.files.length, 1);
  assert.equal(merged.files[0]?.path, "src/components/Imported.tsx");
});

test("dropForbiddenTanStackMergeFiles is a no-op on Vite projects", () => {
  const merged = dropForbiddenTanStackMergeFiles(
    [{ path: "src/App.tsx", content: "export default function App() { return null; }" }],
    [{ path: "src/main.tsx" }],
  );
  assert.deepEqual(merged.dropped, []);
  assert.equal(merged.files[0]?.path, "src/App.tsx");
});

test("formatProjectContractErrors surfaces omitted product files for self-verify repair", () => {
  const scaffold = filesFromScaffold();
  const contract = buildFallbackProjectContract("Build a bakery");
  contract.files.push({
    path: "src/components/Hero.tsx",
    purpose: "Hero section",
    owner: "product",
    exports: [{ name: "Hero", kind: "named" }],
    dependsOn: [],
  });
  const messages = formatProjectContractErrors(scaffold, contract);
  assert.ok(messages.some((message) => message.includes("src/components/Hero.tsx")));
  assert.equal(formatProjectContractErrors(scaffold, null).length, 0);
  const complete = [...scaffold, { path: "src/components/Hero.tsx", content: "export function Hero() { return null; }" }];
  assert.equal(
    formatProjectContractErrors(complete, contract).some((message) => message.includes("src/components/Hero.tsx")),
    false,
  );
});

test("scoreContractAgainstScaffold treats extra product files as planned work, not a failed scaffold", () => {
  const scaffold = filesFromScaffold();
  const contract = buildFallbackProjectContract("Build a bakery");
  contract.files.push({
    path: "src/components/Hero.tsx",
    purpose: "Hero section",
    owner: "product",
    exports: [{ name: "Hero", kind: "named" }],
    dependsOn: [],
  });
  const score = scoreContractAgainstScaffold(contract, scaffold);
  assert.equal(score.requiredCovered, true);
  assert.deepEqual(score.forbidden, []);
  assert.ok(score.extraProduct.includes("src/components/Hero.tsx"));
});

test("isForbiddenTanStackEntry matches Vite entries TanStack Start must not emit", () => {
  assert.equal(isForbiddenTanStackEntry("src/App.tsx"), true);
  assert.equal(isForbiddenTanStackEntry("/src/main.tsx"), true);
  assert.equal(isForbiddenTanStackEntry("src\\App.tsx"), true);
  assert.equal(isForbiddenTanStackEntry("src/routes/index.tsx"), false);
});

test("shouldLiveStreamGeneratedPath blocks Vite entries on TanStack apps", () => {
  const existing = filesFromScaffold();
  assert.equal(shouldLiveStreamGeneratedPath("src/App.tsx", existing, null), false);
  assert.equal(shouldLiveStreamGeneratedPath("src/routes/index.tsx", existing, null), true);
  assert.equal(shouldLiveStreamGeneratedPath("src/App.tsx", [{ path: "src/pages/Index.tsx" }], null), true);
});

test("shouldLiveStreamGeneratedPath skips undeclared extras when a contract exists", () => {
  const existing = filesFromScaffold();
  const contract = buildFallbackProjectContract("Build a bakery");
  assert.equal(shouldLiveStreamGeneratedPath("src/pages/Ghost.tsx", existing, contract), false);
  assert.equal(shouldLiveStreamGeneratedPath("src/routes/index.tsx", existing, contract), true);
  assert.equal(
    shouldLiveStreamGeneratedPath(
      "src/routes/about.tsx",
      existing,
      contract,
      `import { createFileRoute } from "@tanstack/react-router";\nexport const Route = createFileRoute("/about")({ component: About });\n`,
    ),
    true,
  );
});

test("extendProjectContract keeps a companion test next to an existing file", () => {
  const existing = filesFromScaffold();
  const contract = buildFallbackProjectContract("Build a bakery");
  const testFile = {
    path: "src/routes/index.test.tsx",
    content: `import { describe, it, expect } from "vitest";
describe("home", () => { it("renders", () => { expect(true).toBe(true); }); });
`,
  };
  const extended = extendProjectContract(contract, [...existing, testFile], existing);
  assert.ok(extended.files.some((file) => file.path === "src/routes/index.test.tsx"));
});

test("constrainRepairFiles keeps a missing imported module the repair created", () => {
  const existing = filesFromScaffold().map((file) => {
    if (file.path !== "src/routes/index.tsx") return file;
    return {
      ...file,
      content: `import { createFileRoute } from "@tanstack/react-router";
import { Hours } from "../components/Hours";
export const Route = createFileRoute("/")({ component: () => <Hours /> });
`,
    };
  });
  const contract = buildFallbackProjectContract("Build a bakery");
  const constrained = constrainRepairFiles(
    [
      { path: "src/App.tsx", content: "export default function App() { return null; }\n", language: "typescriptreact" },
      { path: "src/components/Hours.tsx", content: "export function Hours() { return <p>9–5</p>; }\n", language: "typescriptreact" },
    ],
    existing,
    contract,
  );
  assert.ok(constrained.dropped.includes("src/App.tsx"));
  assert.ok(constrained.files.some((file) => file.path === "src/components/Hours.tsx"));
  assert.ok(constrained.contract?.files.some((file) => file.path === "src/components/Hours.tsx"));
});

test("extractJsonObject reads fenced JSON", () => {
  const raw = extractJsonObject("```json\n{\"framework\":\"tanstack-start\"}\n```");
  assert.deepEqual(raw, { framework: "tanstack-start" });
});

test("scaffold files pass the fallback contract", () => {
  const contract = buildFallbackProjectContract("Build a bakery landing page");
  const files = ensureContractFile(filesFromScaffold(), contract);
  const errors = validateFilesAgainstProjectContract(files, [], contract);
  assert.deepEqual(errors, [], errors.map((error) => error.message).join(" | "));
});

test("undeclared product files are dropped before install", () => {
  const contract = buildFallbackProjectContract("Build a bakery");
  const generated = [
    ...filesFromScaffold(),
    { path: "src/components/Hero.tsx", content: "export function Hero() { return <div /> }", language: "typescriptreact" },
  ];
  const restricted = restrictGeneratedFilesToContract(generated, filesFromScaffold(), contract);
  assert.deepEqual(restricted.dropped, ["src/components/Hero.tsx"]);
  assert.equal(restricted.files.some((file) => file.path === "src/components/Hero.tsx"), false);
  assert.equal(undeclaredFileErrors(restricted.dropped)[0]?.type, "undeclared_file");
});

test("fabricated local import fails the contract validator", () => {
  const contract = buildFallbackProjectContract("Build a bakery");
  const files = filesFromScaffold().map((file) => {
    if (file.path !== "src/routes/index.tsx") return file;
    return {
      ...file,
      content: `import { createFileRoute } from "@tanstack/react-router";
import { Ghost } from "../components/Ghost";
export const Route = createFileRoute("/")({ component: Home });
function Home() { return <Ghost />; }
`,
    };
  });
  const contracted = parseProjectContract({
    files: [
      { path: "src/components/Ghost.tsx", owner: "product", purpose: "ghost", exports: [{ name: "Ghost" }], dependsOn: [] },
      { path: "src/routes/index.tsx", dependsOn: ["src/components/Ghost.tsx"], exports: [{ name: "Route" }] },
    ],
  }, { fallback: contract }).contract;
  const errors = validateFilesAgainstProjectContract(ensureContractFile(files, contracted), [], contracted);
  assert.ok(
    errors.some((error) => error.type === "missing_contract_file" && error.file === "src/components/Ghost.tsx"),
    errors.map((error) => `${error.type}:${error.file}`).join(" | "),
  );
});

test("missing contracted export is reported before install", () => {
  const contract = buildFallbackProjectContract("Build a bakery");
  const files = filesFromScaffold().map((file) =>
    file.path === "src/lib/utils.ts" ? { ...file, content: "export const unused = 1;\n" } : file,
  );
  const errors = validateFilesAgainstProjectContract(ensureContractFile(files, contract), [], contract);
  assert.ok(errors.some((error) => error.type === "missing_contract_export" && /cn/.test(error.message)));
});

test("undeclared dependency edges are rejected", () => {
  const fallback = buildFallbackProjectContract("Build a bakery");
  const files = filesFromScaffold().map((file) => {
    if (file.path !== "src/routes/index.tsx") return file;
    return {
      ...file,
      content: `import { createFileRoute } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
export const Route = createFileRoute("/")({ component: () => <div className={cn("p-4")} /> });
`,
    };
  });
  const errors = validateFilesAgainstProjectContract(ensureContractFile(files, fallback), [], fallback);
  assert.ok(errors.some((error) => error.type === "undeclared_dependency_edge"));
});

test("repair slice includes the broken file, importers, and config — not the whole repo", () => {
  const files = [
    { path: "package.json", content: "{}" },
    { path: "src/lib/utils.ts", content: "export function cn() { return ''; }" },
    { path: "src/components/Hero.tsx", content: `import { Missing } from "./Missing";\nexport function Hero() { return <Missing />; }` },
    { path: "src/routes/index.tsx", content: `import { Hero } from "../components/Hero";\nexport const Route = { component: () => <Hero /> };` },
    { path: "src/routes/about.tsx", content: "export const Route = { component: () => <p>About</p> };" },
  ];
  const slice = selectRepairSlice(files, [
    `"Missing" is imported by src/components/Hero.tsx but is not exported from src/components/Missing.tsx`,
  ]);
  assert.ok(slice.paths.includes("src/components/Hero.tsx"));
  assert.ok(slice.paths.includes("src/routes/index.tsx"));
  assert.ok(slice.paths.includes("package.json"));
  assert.equal(slice.paths.includes("src/routes/about.tsx"), false);
  assert.equal(slice.brokenSymbol, "Missing");
  assert.match(slice.brief, /Repair only this dependency slice/);
});

test("generation prompt block lists files in dependency order", () => {
  const parsed = parseProjectContract(buildFallbackProjectContract("Build a bakery"));
  const block = renderProjectContractPromptBlock(parsed.contract, parsed.generationOrder);
  assert.match(block, /MACHINE-CHECKABLE PROJECT CONTRACT/);
  assert.match(block, new RegExp(PROJECT_CONTRACT_PATH));
  assert.ok(block.indexOf("src/components/layout/Header.tsx") < block.indexOf("src/components/layout/SiteChrome.tsx") ||
    parsed.generationOrder.indexOf("src/components/layout/Header.tsx") < parsed.generationOrder.indexOf("src/components/layout/SiteChrome.tsx"));
});

test("contract JSON round-trips through project-contract.json", () => {
  const contract = buildFallbackProjectContract("Build a POS");
  const file = contractAsProjectFile(contract);
  assert.equal(file.path, PROJECT_CONTRACT_PATH);
  const parsed = parseProjectContract(JSON.parse(file.content));
  assert.equal(parsed.contract.framework, "tanstack-start");
  assert.equal(serializeProjectContract(parsed.contract).includes('"version": 1'), true);
});

test("contract experiment fixtures cover the known first-boot failure families", () => {
  const families = new Set(CONTRACT_EXPERIMENT_FIXTURES.map((fixture) => fixture.family));
  const required: ContractExperimentFamily[] = ["valid", "missing-export", "fabricated-import", "undeclared-file", "missing-file", "undeclared-package", "invalid-package", "missing-route", "preview-timeout", "typecheck", "build"];
  for (const family of required) {
    assert.ok(families.has(family), `missing family ${family}`);
  }
  assert.ok(CONTRACT_EXPERIMENT_FIXTURES.length >= 40, `expected at least 40 fixtures, got ${CONTRACT_EXPERIMENT_FIXTURES.length}`);
  const report = runContractExperiment();
  assert.equal(report.runs, CONTRACT_EXPERIMENT_FIXTURES.length);
  assert.ok(report.firstBootSuccessRate > 0);
  assert.ok(report.firstBootSuccessRate < 1, "the suite must include failing apps, not only green fixtures");
  assert.ok((report.byCluster["preview-timeout"] ?? 0) >= 1);
  assert.ok((report.byCluster["missing-export"] ?? 0) >= 1);
  assert.ok(CONTRACT_EXPERIMENT_PROMPTS.length >= 10);
});
