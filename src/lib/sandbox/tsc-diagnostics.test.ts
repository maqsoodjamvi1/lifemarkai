import { test } from "node:test";
import assert from "node:assert/strict";

import {
formatDiagnostics,
isFatal,
parseTscOutput,
rankDiagnostics,
summariseDiagnostics,
} from "./tsc-diagnostics.ts";

/** The exact failure that cost hours tonight, in tsc's own words. */
const TONIGHT = [
  `/home/node/app/src/routes/__root.tsx(4,3): error TS2305: Module '"@tanstack/react-router"' has no exported member 'Head'.`,
  `/home/node/app/src/routes/__root.tsx(5,3): error TS2305: Module '"@tanstack/react-router"' has no exported member 'Html'.`,
  `/home/node/app/src/routes/__root.tsx(6,3): error TS2305: Module '"@tanstack/react-router"' has no exported member 'Body'.`,
  "",
  "Found 3 errors in the same file, starting at: src/routes/__root.tsx:4",
].join("\n");

test("parses the Body/Html/Head regression with file, line and code", () => {
  const diags = parseTscOutput(TONIGHT, { appDir: "/home/node/app" });

  assert.equal(diags.length, 3);
  assert.deepEqual(
    diags.map((d) => d.file),
    ["src/routes/__root.tsx", "src/routes/__root.tsx", "src/routes/__root.tsx"],
  );
  assert.deepEqual(diags.map((d) => d.line), [4, 5, 6]);
  assert.deepEqual(diags.map((d) => d.code), [2305, 2305, 2305]);
  assert.ok(diags.every((d) => d.category === "error"));
  assert.ok(diags.every(isFatal), "a missing export stops the app from running");
  assert.match(diags[2].message, /has no exported member 'Body'/);
});

test("drops the container path prefix so paths match the project's own", () => {
  const [d] = parseTscOutput(
    "/home/node/app/src/lib/utils.ts(3,1): error TS2304: Cannot find name 'clsx'.",
    { appDir: "/home/node/app" },
  );
  assert.equal(d.file, "src/lib/utils.ts");
});

test("relativises a path tsc reported from a different cwd", () => {
  // Real output, captured by running the actual compiler against a real
  // reproduction of tonight's bug from outside the project directory. tsc
  // reports relative to ITS cwd, so the app dir shows up mid-path.
  const [d] = parseTscOutput(
    `../../../../tmp/tsprobe/src/routes/__root.tsx(1,47): error TS2305: Module '"@tanstack/react-router"' has no exported member 'Body'.`,
    { appDir: "/tmp/tsprobe" },
  );
  assert.equal(d.file, "src/routes/__root.tsx");
  assert.equal(d.line, 1);
  assert.equal(d.column, 47);
});

test("ignores diagnostics from installed dependencies", () => {
  const raw = [
    "/home/node/app/node_modules/@types/react/index.d.ts(12,5): error TS2717: Subsequent property declarations must have the same type.",
    "/home/node/app/src/App.tsx(9,1): error TS2307: Cannot find module './Missing'.",
  ].join("\n");

  const diags = parseTscOutput(raw, { appDir: "/home/node/app" });
  assert.equal(diags.length, 1);
  assert.equal(diags[0].file, "src/App.tsx");
});

test("keeps config-level errors that have no file", () => {
  const diags = parseTscOutput(
    "error TS18003: No inputs were found in config file 'tsconfig.json'.",
  );
  assert.equal(diags.length, 1);
  assert.equal(diags[0].file, null);
  assert.equal(diags[0].code, 18003);
});

test("folds indented elaboration into the diagnostic above it", () => {
  const raw = [
    "src/components/Card.tsx(14,7): error TS2322: Type 'string' is not assignable to type 'number'.",
    "  Type 'string' is not assignable to type 'number'.",
  ].join("\n");

  const diags = parseTscOutput(raw);
  assert.equal(diags.length, 1);
  assert.match(diags[0].message, /not assignable to type 'number'\. Type 'string'/);
});

test("survives pretty-mode colour escapes", () => {
  const raw =
    "[96msrc/App.tsx[0m(2,1): [91merror[0m TS2307: Cannot find module 'x'.";
  const diags = parseTscOutput(raw);
  assert.equal(diags.length, 1);
  assert.equal(diags[0].code, 2307);
});

test("ignores tsc's own summary and npm chatter", () => {
  const raw = [
    "npm warn exec The following package was not found and will be installed: typescript",
    "",
    "Found 0 errors.",
  ].join("\n");
  assert.deepEqual(parseTscOutput(raw), []);
});

test("ranking puts app-breaking errors before merely-wrong ones", () => {
  const raw = [
    "src/z.tsx(1,1): error TS7006: Parameter 'x' implicitly has an 'any' type.",
    "src/a.tsx(9,1): error TS2307: Cannot find module './Missing'.",
  ].join("\n");

  const ranked = rankDiagnostics(parseTscOutput(raw));
  assert.equal(ranked[0].code, 2307);
  assert.equal(ranked[1].code, 7006);
});

test("formatting caps the list and says how many it hid", () => {
  const raw = Array.from(
    { length: 25 },
    (_, i) => `src/f${i}.tsx(1,1): error TS2307: Cannot find module './m${i}'.`,
  ).join("\n");

  const text = formatDiagnostics(parseTscOutput(raw), { limit: 5 });
  assert.equal(text.split("\n").length, 6);
  assert.match(text, /…and 20 more/);
  assert.match(text, /^- src\/f\d+\.tsx:1:1 — TS2307/m);
});

test("summary distinguishes fatal from merely wrong", () => {
  assert.equal(summariseDiagnostics([]), "No type errors");

  const fatal = parseTscOutput(TONIGHT, { appDir: "/home/node/app" });
  assert.equal(
    summariseDiagnostics(fatal),
    "3 type errors (3 that stop the app from running)",
  );

  const soft = parseTscOutput(
    "src/z.tsx(1,1): error TS7006: Parameter 'x' implicitly has an 'any' type.",
  );
  assert.equal(summariseDiagnostics(soft), "1 type error");
});

test("clean output produces nothing", () => {
  assert.deepEqual(parseTscOutput(""), []);
  assert.equal(formatDiagnostics([]), "");
});
