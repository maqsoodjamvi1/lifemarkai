/**
 * Unit tests for lib/security/static-scan.
 *
 * Runs with Node 22's built-in type-stripping (no compiler required):
 *
 *   node --test lib/security/static-scan.test.ts
 *
 * Or, if your repo gains vitest/jest later, this file's structure (describe-less
 * top-level test() calls from `node:test`) translates directly.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { staticScan, countFindings, SECURITY_PATTERNS } from "./static-scan.ts";

// Tests use a stripped-down shape compatible with the bits staticScan touches.
// We deliberately do NOT import the real ProjectFile type — staticScan only
// reads `.path` and `.content`, and pinning the type here keeps the tests stable
// if the DB type evolves.
interface TestFile { path: string; content: string }
const f = (path: string, content: string): TestFile => ({ path, content });

test("returns empty array for clean files", () => {
  const findings = staticScan([
    f("src/index.ts", "export const greet = (name: string) => `Hello ${name}`;"),
    f("src/utils.ts", "// nothing dangerous here\nexport function add(a, b) { return a + b; }"),
  ] as never);
  assert.deepEqual(findings, []);
  assert.equal(countFindings([] as never), 0);
});

test("detects exposed OpenAI key as critical", () => {
  const findings = staticScan([
    f("config.ts", `const key = "sk-abcdefghijklmnopqrstuvwxyz123456";`),
  ] as never);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "critical");
  assert.equal(findings[0].title, "Exposed OpenAI API Key");
  assert.equal(findings[0].file, "config.ts");
  assert.equal(findings[0].line, 1);
});

test("detects exposed Anthropic key as critical", () => {
  const findings = staticScan([
    f("ai.ts", `const k = "sk-ant-aaaaaaaaaaaaaaaaaaaaaa";`),
  ] as never);
  assert.equal(findings[0].severity, "critical");
  assert.equal(findings[0].title, "Exposed Anthropic API Key");
});

test("detects Stripe live secret key as critical", () => {
  const findings = staticScan([
    f("server.ts", `process.env.NEW_KEY = "sk_live_abcdefghij1234567890XYZ";`),
  ] as never);
  // The live-secret pattern is the one we care about; it must be present.
  const titles = findings.map((x) => x.title);
  assert.ok(titles.includes("Exposed Stripe Live Secret Key"), `Got: ${titles.join(", ")}`);
});

test("flags dangerouslySetInnerHTML as high", () => {
  const findings = staticScan([
    f("Page.tsx", `return <div dangerouslySetInnerHTML={{ __html: raw }} />;`),
  ] as never);
  assert.equal(findings[0].severity, "high");
  assert.equal(findings[0].title, "XSS Risk: dangerouslySetInnerHTML");
});

test("flags eval as high", () => {
  const findings = staticScan([
    f("danger.ts", `eval(userInput);`),
  ] as never);
  assert.equal(findings[0].severity, "high");
  assert.equal(findings[0].title, "Dangerous: eval() usage");
});

test("flags localStorage token storage as medium", () => {
  const findings = staticScan([
    f("auth.ts", `localStorage.setItem("authToken", token);`),
  ] as never);
  const titles = findings.map((x) => x.title);
  assert.ok(titles.includes("Sensitive Data in localStorage"));
  const finding = findings.find((x) => x.title === "Sensitive Data in localStorage")!;
  assert.equal(finding.severity, "medium");
});

test("flags non-localhost http URLs as low", () => {
  const findings = staticScan([
    f("api.ts", `fetch("http://api.example.com/items");`),
  ] as never);
  const finding = findings.find((x) => x.title === "Insecure HTTP URL");
  assert.ok(finding, "Insecure HTTP URL should fire");
  assert.equal(finding!.severity, "low");
});

test("does NOT flag http://localhost as insecure", () => {
  const findings = staticScan([
    f("dev.ts", `fetch("http://localhost:3000/api");`),
  ] as never);
  const httpFinding = findings.find((x) => x.title === "Insecure HTTP URL");
  assert.equal(httpFinding, undefined);
});

test("dedupes the same finding type within a single file", () => {
  // Three lines, each a hardcoded password — should produce ONE finding, not three.
  const findings = staticScan([
    f("legacy.ts", [
      `const a = password = "abc1234";`,
      `const b = password = "xyz9999";`,
      `const c = password = "qrs7777";`,
    ].join("\n")),
  ] as never);
  const matches = findings.filter((x) => x.title === "Hardcoded Password");
  assert.equal(matches.length, 1, `expected 1 dedup'd finding, got ${matches.length}`);
});

test("the SAME finding across DIFFERENT files is NOT deduped", () => {
  // Dedup key is title + file, so two files with the same issue should yield two findings.
  const findings = staticScan([
    f("one.ts", `eval(x);`),
    f("two.ts", `eval(y);`),
  ] as never);
  const evalFindings = findings.filter((x) => x.title === "Dangerous: eval() usage");
  assert.equal(evalFindings.length, 2);
  assert.deepEqual(evalFindings.map((x) => x.file).sort(), ["one.ts", "two.ts"]);
});

test("findings are sorted critical → high → medium → low → info", () => {
  const findings = staticScan([
    f("a.ts", `fetch("http://api.example.com");`),                  // low
    f("b.ts", `localStorage.setItem("authToken", t);`),             // medium
    f("c.tsx", `<div dangerouslySetInnerHTML={{ __html: x }} />`),  // high
    f("d.ts", `const k = "sk-aaaaaaaaaaaaaaaaaaaaaa";`),            // critical
  ] as never);
  const order = findings.map((x) => x.severity);
  // Each severity must appear; critical first, info-or-low last.
  assert.equal(order[0], "critical", `expected critical first; got ${order.join(",")}`);
  // Confirm overall non-decreasing severity rank.
  const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  for (let i = 1; i < order.length; i++) {
    assert.ok(
      rank[order[i]] >= rank[order[i - 1]],
      `severity order broke at index ${i}: ${order.join(",")}`,
    );
  }
});

test("line numbers are 1-indexed and point at the offending line", () => {
  const findings = staticScan([
    f("multi.ts", ["// line 1", "// line 2", `eval(x); // line 3`].join("\n")),
  ] as never);
  const evalFinding = findings.find((x) => x.title === "Dangerous: eval() usage")!;
  assert.equal(evalFinding.line, 3);
});

test("countFindings agrees with staticScan(...).length", () => {
  const files = [
    f("x.ts", `eval(x);`),
    f("y.ts", `localStorage.setItem("authToken", t); eval(z);`),
  ] as never;
  assert.equal(countFindings(files), staticScan(files).length);
});

test("ignores files with empty/undefined content gracefully", () => {
  const findings = staticScan([
    { path: "empty.ts", content: "" } as never,
    { path: "nullish.ts", content: null } as never,
  ] as never);
  // Should not throw; should yield no findings.
  assert.deepEqual(findings, []);
});

test("SECURITY_PATTERNS export is non-empty and unique by title", () => {
  // Defensive: the count badge is built on the assumption that titles disambiguate findings.
  assert.ok(SECURITY_PATTERNS.length > 0);
  const titles = SECURITY_PATTERNS.map((p) => p.title);
  assert.equal(new Set(titles).size, titles.length, "pattern titles must be unique");
});
