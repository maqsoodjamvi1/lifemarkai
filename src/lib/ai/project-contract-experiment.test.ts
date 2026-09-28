import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CONTRACT_EXPERIMENT_FIXTURES,
  formatContractFailureReport,
  runContractExperiment,
  unexpectedContractOutcomes,
} from "./project-contract-experiment.ts";

test("all deterministic first-boot outcomes match declared expectations", () => {
  const report = runContractExperiment();
  assert.deepEqual(unexpectedContractOutcomes(report), [], formatContractFailureReport(report));
});

test("the gate catches false greens and false rejections regardless of fixture names", () => {
  const valid = CONTRACT_EXPERIMENT_FIXTURES.find((fixture) => fixture.expectFirstBoot)!;
  const invalid = CONTRACT_EXPERIMENT_FIXTURES.find((fixture) => !fixture.expectFirstBoot)!;
  const report = runContractExperiment([
    { ...valid, id: "broken-but-accepted", expectFirstBoot: false },
    { ...invalid, id: "valid-but-rejected", expectFirstBoot: true },
  ]);
  assert.equal(unexpectedContractOutcomes(report).length, 2);
  const summary = formatContractFailureReport(report);
  assert.match(summary, /2 unexpected first-boot outcomes/);
  assert.match(summary, /broken-but-accepted expected=false actual=true/);
  assert.match(summary, /valid-but-rejected expected=true actual=false/);
  assert.ok(summary.includes(`${invalid.family}: valid-but-rejected`));
});

const script = fileURLToPath(new URL("../../../scripts/generation-contract-experiment.ts", import.meta.url));

test("the release command runs deterministic fixtures without credentials", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", script, "--check"], {
    encoding: "utf8",
    env: { ...process.env, CI: "true", OPENAI_API_KEY: "", OPENROUTER_API_KEY: "" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /0 unexpected first-boot outcomes/);
});

test("CI and release checks reject live runs before loading credentials or providers", () => {
  for (const [args, ci] of [[[], "true"], [["--check"], ""]] as const) {
    const result = spawnSync(process.execPath, ["--import", "tsx", script, "--live", ...args], {
      encoding: "utf8",
      env: { ...process.env, CI: ci, GITHUB_ACTIONS: "", OPENAI_API_KEY: "not-a-real-key" },
    });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /Live paid-model experiments are disabled/);
  }
});

test("an unexpected fixture outcome exits nonzero and reports its family", () => {
  const fixturesUrl = new URL("./project-contract-experiment.ts", import.meta.url).href;
  const scriptUrl = new URL("../../../scripts/generation-contract-experiment.ts", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    const { CONTRACT_EXPERIMENT_FIXTURES } = await import(${JSON.stringify(fixturesUrl)});
    const fixture = CONTRACT_EXPERIMENT_FIXTURES[0];
    fixture.expectFirstBoot = !fixture.expectFirstBoot;
    await import(${JSON.stringify(scriptUrl)});
  `], { encoding: "utf8", env: { ...process.env, CI: "true" } });
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /1 unexpected first-boot outcomes/);
  assert.match(result.stdout, /valid: .* expected=false actual=true errors=0 clusters=none/);
});
