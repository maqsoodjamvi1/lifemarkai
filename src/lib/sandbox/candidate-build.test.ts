import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import { candidateBuildScript, normalizeRepeatedManifest, parseCandidateBuildResult, validCandidateFiles } from "./candidate-build.ts";

test("only identical repeated manifests are repaired", () => {
  const valid = JSON.stringify({ name: "bakery", scripts: { dev: "vite" }, type: "module" });
  assert.equal(normalizeRepeatedManifest(Array(6).fill(valid).join("\n")), valid + "\n");
  for (const text of [valid, valid + '{"name":"different"}', valid + 'junk', '{"broken":']) {
    assert.equal(normalizeRepeatedManifest(text), text);
  }
});

const require = createRequire(import.meta.url);

test("candidate archive rejects traversal, absolute paths and dependency injection", () => {
  for (const path of ["../app/a.ts", "/app/a.ts", "C:/a.ts", "src\\a.ts", "src/../../a.ts", "node_modules/vite/a.js", "src/./a.ts", "src//a.ts", "a\0b"]) {
    assert.equal(validCandidateFiles([{ path, content: "" }]), false, path);
  }
  assert.equal(validCandidateFiles([{ path: "src/routes/index.tsx", content: "hello" }]), true);
});

test("missing build output never passes", () => {
  for (const output of ["", "LM_CANDIDATE_RESULT:null", "LM_CANDIDATE_RESULT:{\"passed\":true}"]) {
    assert.equal(parseCandidateBuildResult(output).available, false);
  }
});

function fixture(options: { broken?: boolean; changedDeps?: boolean; timedOut?: boolean; repeatedLiveManifest?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "lm-candidate-test-"));
  const app = join(root, "app"), candidate = join(root, "candidate");
  mkdirSync(join(app, "node_modules/vite/bin"), { recursive: true });
  mkdirSync(candidate);
  const pkg = { dependencies: { "@tanstack/react-router": "1.0.0" } };
  writeFileSync(join(app, "package.json"), JSON.stringify(pkg).repeat(options.repeatedLiveManifest ? 6 : 1));
  writeFileSync(join(candidate, "package.json"), JSON.stringify(options.changedDeps ? { dependencies: {} } : pkg));
  writeFileSync(join(app, "page.txt"), "Featured Products");
  writeFileSync(join(candidate, "page.txt"), options.broken ? "BROKEN" : "Fresh from Our Oven");
  writeFileSync(join(app, "node_modules/vite/bin/vite.js"), `
    const fs = require('node:fs');
    const text = fs.readFileSync('page.txt','utf8');
    if (text === 'BROKEN') { console.error('Invalid candidate module'); process.exit(1); }
    if (text !== 'Fresh from Our Oven') { console.error('Compiled old files'); process.exit(2); }
    fs.mkdirSync('dist'); fs.writeFileSync('dist/output.txt', text);
  `);
  const lines: string[] = [];
  let calls = 0;
  try {
    runInNewContext(candidateBuildScript(app, candidate, 45), {
      process,
      console: { log: (line: string) => lines.push(line) },
      require: (id: string) => id === "node:child_process" ? {
        spawnSync(command: string, args: string[], opts: Parameters<typeof spawnSync>[2]) {
          calls++;
          assert.equal(command, "timeout");
          assert.equal(args[0], "45");
          assert.equal(opts?.cwd, candidate);
          if (options.timedOut) return { status: 124, stdout: "", stderr: "" };
          // The production command uses POSIX timeout. Run its actual Node
          // child directly in this cross-platform fixture.
          return spawnSync(args[1], args.slice(2), opts);
        },
      } : require(id),
    });
    assert.equal(readFileSync(join(app, "page.txt"), "utf8"), "Featured Products");
    assert.equal(existsSync(join(app, "dist")), false);
    return { result: parseCandidateBuildResult(lines.join("\n")), calls };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("build compiles candidate content without overwriting the live project", () => {
  assert.deepEqual(fixture().result, { available: true, passed: true, errors: [] });
});

test("repaired manifest can reuse the dependencies of an exactly repeated live manifest", () => {
  assert.equal(fixture({ repeatedLiveManifest: true }).result.passed, true);
});

test("a broken candidate fails even when the live version is good", () => {
  const { result } = fixture({ broken: true });
  assert.equal(result.available, true);
  assert.equal(result.passed, false);
  assert.match(result.errors.join("\n"), /Invalid candidate module/);
});

test("changed dependencies cannot be verified against the old installation", () => {
  const { result, calls } = fixture({ changedDeps: true });
  assert.equal(result.available, false);
  assert.equal(calls, 0);
});

test("timed out build is unknown, not a clean build", () => {
  const { result } = fixture({ timedOut: true });
  assert.equal(result.available, false);
  assert.equal(result.passed, false);
});
