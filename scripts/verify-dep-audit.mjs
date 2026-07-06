/**
 * Regression suite for the dependency/supply-chain analyzer (lib/security/deps.ts).
 * Bundles the real TS via the local esbuild and asserts good/bad fixtures.
 *   node scripts/verify-dep-audit.mjs
 */
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "dep-"));
const out = join(tmp, "deps.mjs");
execSync(`${ROOT}/node_modules/.bin/esbuild ${ROOT}/lib/security/deps.ts --bundle --format=esm --platform=node --outfile=${out}`, { stdio: "pipe" });
const { auditDependencies } = await import(out);

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) pass++; else { fail++; console.log("FAIL:", name); } };
const rules = (fs) => new Set(fs.map((f) => f.rule));

// No manifest → no findings.
check("no package.json → []", auditDependencies([{ path: "src/App.tsx", content: "x" }]).length === 0);

// Bad manifest: unpinned, non-registry, risky pkg, no lockfile.
const bad = auditDependencies([{ path: "package.json", content: JSON.stringify({
  dependencies: { react: "^18.2.0", foo: "*", bar: "latest", request: "^2.88.0", mylib: "git+https://github.com/x/y.git" },
}, null, 2) }]);
const bR = rules(bad);
check("bad: flags unpinned", bR.has("dep-unpinned"));
check("bad: two unpinned (foo,bar)", bad.filter((f) => f.rule === "dep-unpinned").length === 2);
check("bad: flags non-registry (git url)", bad.some((f) => f.rule === "dep-non-registry" && f.title.includes("mylib")));
check("bad: flags risky package (request)", bad.some((f) => f.rule === "dep-risky-package" && f.title.includes("request")));
check("bad: flags missing lockfile", bR.has("dep-no-lockfile"));
check("bad: does NOT flag react (pinned caret)", !bad.some((f) => f.title.includes("react")));
check("bad: findings carry recommendations", bad.every((f) => typeof f.recommendation === "string" && f.recommendation.length > 0));
check("bad: kind is dependency", bad.every((f) => f.kind === "dependency"));

// Good manifest: pinned/caret + lockfile present → clean.
const good = auditDependencies([
  { path: "package.json", content: JSON.stringify({ dependencies: { react: "^18.2.0", next: "14.2.0" } }, null, 2) },
  { path: "package-lock.json", content: "{}" },
]);
check("good: no findings", good.length === 0);

// Invalid JSON → one parse finding.
const broken = auditDependencies([{ path: "package.json", content: "{ not json" }]);
check("broken: flags invalid JSON", broken.length === 1 && broken[0].rule === "package-json-invalid");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
