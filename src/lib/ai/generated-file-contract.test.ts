import assert from "node:assert/strict";
import test from "node:test";
import { enforceGeneratedFileContract,normalizeGeneratedPath } from "./generated-file-contract";

const file = (path: string, content = "export const value = 1;") => ({ path, content, language: "typescript" });

test("normalizes safe project-relative paths", () => {
  assert.equal(normalizeGeneratedPath("./src\\pages//Home.tsx"), "src/pages/Home.tsx");
});

test("rejects traversal, absolute, dependency and secret paths", () => {
  for (const path of ["../outside.ts", "/etc/passwd", "C:/secret.txt", "node_modules/pkg/index.js", ".git/config", ".env.local", "cert.pem"]) {
    assert.throws(() => enforceGeneratedFileContract([file(path)]), /Generated-file contract rejected/);
  }
  assert.doesNotThrow(() => enforceGeneratedFileContract([file(".env.example", "VITE_API_URL=")]));
});

test("rejects duplicate targets case-insensitively", () => {
  assert.throws(
    () => enforceGeneratedFileContract([file("src/App.tsx"), file("SRC/app.tsx")]),
    /multiple writes to the same case-insensitive path/,
  );
});

test("rejects destructive overwrites and invalid JSON", () => {
  assert.throws(
    () => enforceGeneratedFileContract([file("src/data.ts", "")], [file("src/data.ts", "export const data = [1];")]),
    /refused to blank/,
  );
  assert.throws(() => enforceGeneratedFileContract([file("package.json", "{bad")]), /unparseable JSON/);
});

test("accepts complete text files", () => {
  const result = enforceGeneratedFileContract([
    file("src/lib/data.ts"),
    file("package.json", JSON.stringify({ scripts: { dev: "vite" } })),
  ]);
  assert.deepEqual(result.map((entry) => entry.path), ["src/lib/data.ts", "package.json"]);
});
