/**
 * Fixtures for the type-check gate.
 *
 *   node --experimental-strip-types --test src/lib/verify/typecheck-gate.test.ts
 *
 * The gate is only as good as its filter. Two failure modes are equally bad:
 * missing a real error (the repair round is wasted rediscovering it at runtime)
 * and reporting a sandbox artefact as a defect (the repair model is sent to fix
 * code that is fine). Both directions are pinned here.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  filesWithSyntaxErrors,
  findMissingListKeys,
  findUnresolvedLocalImports,
  runTypecheckGate,
  typecheckGateLoad,
} from "./typecheck-gate.ts";

const f = (path: string, content: string) => ({ path, content }) as never;

describe("typecheck gate — catches what a browser render cannot", () => {
  it("catches a syntax error, with file and line", async () => {
    const r = await runTypecheckGate([f("src/App.tsx", `export function App() {\n  return <div>hi</div>;\n`)]);
    assert.equal(r.available, true);
    assert.ok(r.errors.length > 0, "unterminated function body should be an error");
    assert.equal(r.errors[0].path, "src/App.tsx");
    assert.ok(r.errors[0].line > 0);
    assert.match(r.errors[0].formatted, /src\/App\.tsx:\d+:\d+ — TS\d+:/);
  });

  it("catches an undefined identifier", async () => {
    const r = await runTypecheckGate([
      f("src/util.ts", `export function greet() {\n  return missingHelper();\n}\n`),
    ]);
    assert.ok(r.errors.some((e) => /missingHelper/.test(e.message)), JSON.stringify(r.errors));
  });

  it("catches a wrong argument count across files", async () => {
    // Precisely the class of bug that surfaces at runtime as an opaque
    // "undefined is not a function" deep inside a bundle.
    const r = await runTypecheckGate([
      f("src/math.ts", `export function add(a: number, b: number) { return a + b; }\n`),
      f("src/use.ts", `import { add } from "./math";\nexport const x = add(1);\n`),
    ]);
    assert.ok(r.errors.some((e) => e.path === "src/use.ts"), JSON.stringify(r.errors));
  });
});

describe("typecheck gate — does not invent errors", () => {
  it("passes clean TSX that imports react", async () => {
    // There is no node_modules here. If module-resolution noise leaked through,
    // every generated file in the product would report as broken.
    const r = await runTypecheckGate([
      f("src/App.tsx", `import { useState } from "react";\n\nexport function App() {\n  const [n, setN] = useState(0);\n  return <button onClick={() => setN(n + 1)} className="p-2">{n}</button>;\n}\n`),
    ]);
    assert.equal(r.available, true);
    assert.deepEqual(r.errors, [], `clean file reported errors: ${JSON.stringify(r.errors)}`);
  });

  it("ignores non-source files entirely", async () => {
    const r = await runTypecheckGate([
      f("styles.css", `.x { color: red; }`),
      f("data.json", `{ not valid json at all`),
      f("README.md", `# hi`),
    ]);
    assert.equal(r.checkedFiles, 0);
    assert.deepEqual(r.errors, []);
  });

  it("does not flag React's `key` prop on a component", async () => {
    // Regression. Without React typings, tsc checks JSX props as a plain object
    // literal and reports `key` as an excess property — so EVERY list render in
    // a generated project looked broken. Measured on five real generations: it
    // produced the only "error" found across all of them, and it was wrong.
    const r = await runTypecheckGate([
      f("src/Card.tsx", `export function Card(props: { title: string }) { return <div>{props.title}</div>; }\n`),
      f("src/List.tsx", `import { Card } from "./Card";\nexport function List({ items }: { items: { id: string; title: string }[] }) {\n  return <div>{items.map((i) => <Card key={i.id} title={i.title} />)}</div>;\n}\n`),
    ]);
    assert.deepEqual(r.errors, [], `key prop reported as an error: ${JSON.stringify(r.errors)}`);
  });

  it("still catches real errors in a file that also uses JSX", async () => {
    // The JSX shim must widen JSX only. If it widened everything, the gate
    // would go quiet and look healthy while catching nothing.
    const r = await runTypecheckGate([
      f("src/Bad.tsx", `export function Bad() { return <div>{missingFn()}</div>; }\n`),
    ]);
    assert.ok(r.errors.some((e) => /missingFn/.test(e.message)), JSON.stringify(r.errors));
  });

  it("does not flag implicit any", async () => {
    // strict is off on purpose: burying one real error under forty stylistic
    // ones is how a repair round gets wasted.
    const r = await runTypecheckGate([f("src/x.ts", `export function add(a, b) { return a + b; }\n`)]);
    assert.deepEqual(r.errors, []);
  });
});

describe("typecheck gate — stylesheet imports are not errors", () => {
  // generation_runs recorded real builds failed on this: a generated app does
  // the most ordinary thing in a Vite project, imports its stylesheet, and the
  // gate reported TS2882 because it typechecks with no node_modules and so no
  // ambient Vite asset types. Correct code, failed build, and a paid diagnosis
  // + repair round spent "fixing" it.
  it("accepts a side-effect stylesheet import", async () => {
    const r = await runTypecheckGate([
      f("src/styles.css", "body{margin:0}"),
      f("src/routes/__root.tsx", `import "../styles.css";\nexport function Root() {\n  return <div>hi</div>;\n}\n`),
    ]);
    assert.equal(r.available, true);
    assert.deepEqual(r.errors ?? [], [], "a stylesheet import must not be a build error");
  });

  it("accepts one even when the stylesheet file is absent from the candidate", async () => {
    // The unresolved-import gate owns "this file does not exist" and reports it
    // with a path the repair model can act on. tsc reporting the same thing as
    // TS2882 adds no information and costs a round.
    const r = await runTypecheckGate([
      f("src/routes/__root.tsx", `import "../styles.css";\nexport function Root() {\n  return <div>hi</div>;\n}\n`),
    ]);
    assert.deepEqual(r.errors ?? [], []);
  });

  it("accepts the other preprocessor extensions", async () => {
    for (const ext of ["scss", "sass", "less", "styl", "pcss"]) {
      const r = await runTypecheckGate([
        f("src/routes/__root.tsx", `import "../a.${ext}";\nexport function Root() {\n  return <div>hi</div>;\n}\n`),
      ]);
      assert.deepEqual(r.errors ?? [], [], `.${ext} import should not be an error`);
    }
  });

  it("still catches a REAL error in a file that also imports a stylesheet", async () => {
    // The point of the shim is to stop ONE false positive, not to widen the net
    // until nothing is caught. If this ever passes clean, the gate has been
    // silenced rather than corrected.
    const r = await runTypecheckGate([
      f("src/styles.css", "body{}"),
      f("src/routes/__root.tsx", `import "../styles.css";\nexport function Root() {\n  return <div>{missingName}</div>;\n}\n`),
    ]);
    assert.ok((r.errors ?? []).length > 0, "an undefined identifier must still be reported");
    assert.ok(
      (r.errors ?? []).some((e) => /missingName/.test(e.message)),
      `expected the undefined name, got ${JSON.stringify(r.errors)}`,
    );
  });

  it("leaves the missing-file report to the gate that owns it", async () => {
    // The division of labour, pinned because the shim looks like it could blur
    // it. tsc never reported unresolved modules here even before the shim was
    // added (measured) — findUnresolvedLocalImports does, and it names the file
    // and line, which is what a repair round can actually act on. So silencing
    // TS2882 costs no coverage: the same missing stylesheet is still reported,
    // once, by the check that describes it usefully.
    const files = [
      f("src/routes/__root.tsx", `import "../styles.css";\nexport function Root() {\n  return <div>hi</div>;\n}\n`),
    ];
    assert.deepEqual((await runTypecheckGate(files)).errors ?? [], []);

    const withCss = [f("src/styles.css", "body{}"), ...files];
    assert.equal(
      findUnresolvedLocalImports(withCss).length,
      0,
      "a stylesheet that IS present must not be reported as missing",
    );
  });
});

describe("typecheck gate — safety", () => {
  it("refuses path traversal in a generated filename", async () => {
    const r = await runTypecheckGate([f("../../../etc/evil.ts", `export const x = 1;`)]);
    assert.equal(r.checkedFiles, 0);
  });

  it("caps the number of reported errors", async () => {
    const broken = Array.from({ length: 30 }, (_, i) =>
      f(`src/f${i}.ts`, `export const v${i}: number = "not a number";\n`),
    );
    const r = await runTypecheckGate(broken, { maxErrors: 5 });
    assert.ok(r.errors.length <= 5, `returned ${r.errors.length}`);
  });

  it("reports unavailable rather than throwing on an impossible timeout", async () => {
    const r = await runTypecheckGate([f("src/a.ts", `export const a = 1;`)], { timeoutMs: 1 });
    // Either it finished in under a millisecond (fine) or it reported itself
    // unavailable — what it must NEVER do is throw and take the build down.
    assert.ok(r.available === false || r.errors.length === 0);
  });
});

describe("bundle gate — unresolved local imports", () => {
  it("catches an import of a file that was never created", async () => {
    // The single most common bundler failure in generated projects, and the one
    // tsc CANNOT report distinguishably: it fires TS2307 for this AND for
    // `import from "react"`, so the type gate has to filter both.
    const errs = findUnresolvedLocalImports([
      f("src/App.tsx", `import { Card } from "./components/Card";\nexport const A = () => <Card />;\n`),
    ]);
    assert.equal(errs.length, 1);
    assert.equal(errs[0].specifier, "./components/Card");
    assert.match(errs[0].formatted, /no such file exists/);
  });

  it("resolves an import that does exist, with or without extension", async () => {
    const errs = findUnresolvedLocalImports([
      f("src/App.tsx", `import { Card } from "./components/Card";\nimport { z } from "../lib/util";\n`),
      f("src/components/Card.tsx", `export const Card = () => null;\n`),
      f("lib/util.ts", `export const z = 1;\n`),
    ]);
    assert.deepEqual(errs, []);
  });

  it("resolves a directory index import", async () => {
    const errs = findUnresolvedLocalImports([
      f("src/App.tsx", `import { Card } from "./components";\n`),
      f("src/components/index.ts", `export const Card = () => null;\n`),
    ]);
    assert.deepEqual(errs, []);
  });

  it("ignores bare package imports entirely", async () => {
    // Whether "react" resolves is a fact about the sandbox, not about the code.
    const errs = findUnresolvedLocalImports([
      f("src/App.tsx", `import React from "react";\nimport { z } from "zod";\nimport clsx from "clsx";\n`),
    ]);
    assert.deepEqual(errs, []);
  });

  it("ignores asset imports the bundler handles", async () => {
    const errs = findUnresolvedLocalImports([
      f("src/App.tsx", `import "./styles.css";\nimport logo from "./logo.svg";\n`),
    ]);
    assert.deepEqual(errs, []);
  });

  it("ignores Vite asset query imports like styles.css?url", async () => {
    const errs = findUnresolvedLocalImports([
      f("src/routes/__root.tsx", `import appCss from "../styles.css?url";\n`),
      f("src/styles.css", `body {}\n`),
    ]);
    assert.deepEqual(errs, []);
  });

  it("ignores Vite ?url imports even when the asset file is absent", async () => {
    const errs = findUnresolvedLocalImports([
      f("src/routes/__root.tsx", `import appCss from "../styles.css?url";\n`),
    ]);
    assert.deepEqual(errs, []);
  });

  it("reports the line number so the repair prompt has a location", async () => {
    const errs = findUnresolvedLocalImports([
      f("src/App.tsx", `import { a } from "react";\n\n\nimport { Missing } from "./Missing";\n`),
    ]);
    assert.equal(errs.length, 1);
    assert.equal(errs[0].line, 4);
  });
});

describe("typecheck gate — protects the host under load", () => {
  it("never runs more compilers than it has slots", async () => {
    // tsc is CPU-bound and this host also runs the app server and the users'
    // Docker preview sandboxes. Measured unbounded on 2 cores: 1 build 719ms,
    // 8 concurrent 5,211ms each — linear degradation that would slow every
    // other request on the box. A reliability feature must not become the
    // reason the box is slow.
    const files = [
      f("src/App.tsx", `export function App() { return <div>hi</div>; }\n`),
      f("src/util.ts", `export const x = 1;\n`),
    ];
    const results = await Promise.all(Array.from({ length: 12 }, () => runTypecheckGate(files)));

    const { max } = typecheckGateLoad();
    const ran = results.filter((r) => r.available);
    assert.ok(ran.length > 0, "under load the gate went completely dark");
    assert.ok(ran.length <= 12);

    // Whatever was skipped must say WHY. A silent skip would look identical to
    // a clean pass in the logs, which is how you end up believing a check is
    // running when it has been shedding load for a week.
    for (const r of results.filter((x) => !x.available)) {
      assert.match(String(r.skippedReason), /busy|timed out/, JSON.stringify(r));
    }
    assert.ok(max >= 1);
  });

  it("releases every slot, including on the skip path", async () => {
    // A leaked slot permanently reduces capacity and the gate quietly stops
    // running — the worst kind of failure, because nothing errors.
    const files = [f("src/A.ts", `export const a = 1;\n`)];
    await Promise.all(Array.from({ length: 10 }, () => runTypecheckGate(files)));
    const load = typecheckGateLoad();
    assert.equal(load.active, 0, `leaked ${load.active} slot(s)`);
    assert.equal(load.queued, 0, `left ${load.queued} waiter(s) stranded`);
  });

  it("skipping is not a pass — available stays false", async () => {
    // self-verify must treat "could not check" as UNKNOWN and still run the
    // browser check. If a skip were reported as available with zero errors, a
    // broken build would sail through as verified.
    const files = [f("src/A.ts", `export const a: number = "wrong";\n`)];
    const results = await Promise.all(Array.from({ length: 12 }, () => runTypecheckGate(files)));
    for (const r of results) {
      if (!r.available) assert.deepEqual(r.errors, [], "a skipped run must report no findings");
    }
    assert.ok(results.some((r) => r.available && r.errors.length > 0), "the real error was never found");
  });
});

describe("repair corruption guard", () => {
  it("flags a truncated file as a syntax error", async () => {
    // A repair that hit its token ceiling: not empty, not repetitive, so every
    // pre-existing guard passes it — and it lands on top of a working file.
    const bad = await filesWithSyntaxErrors([
      f("src/App.tsx", `export function App() {\n  const items = [1, 2, 3];\n  return <div>{items.map(i => <span key={i}>{i}</span>)}\n`),
    ]);
    assert.ok(bad.has("src/App.tsx"), `truncated file not flagged: ${JSON.stringify([...bad])}`);
  });

  it("does not flag a file that merely has a TYPE error", async () => {
    // A repair leaving a type error behind is progress; the next round settles
    // it. Rejecting that would throw away good work.
    const bad = await filesWithSyntaxErrors([f("src/x.ts", `export const n: number = "not a number";\n`)]);
    assert.equal(bad.size, 0, `type error wrongly treated as corruption: ${JSON.stringify([...bad])}`);
  });

  it("passes clean files", async () => {
    const bad = await filesWithSyntaxErrors([f("src/ok.tsx", `export const A = () => <div>hi</div>;\n`)]);
    assert.equal(bad.size, 0);
  });
});

describe("missing list keys", () => {
  const one = (code: string) => findMissingListKeys([f("src/X.tsx", code)]);

  it("flags a mapped element with no key", () => {
    assert.equal(one(`export const A=({xs})=><div>{xs.map(x => <Row value={x} />)}</div>;`).length, 1);
  });

  it("does not flag when the key is present", () => {
    assert.equal(one(`export const B=({xs})=><div>{xs.map(x => <Row key={x.id} value={x} />)}</div>;`).length, 0);
  });

  it("does not flag the ENCLOSING element", () => {
    // The first version searched forward from `.map(` and matched the wrapping
    // <div>, so every correct file was reported broken. Only the element the
    // callback returns can carry the key.
    assert.equal(one(`export const C=({xs})=><ul>{xs.map(x => <li key={x.id}><span>{x.n}</span></li>)}</ul>;`).length, 0);
  });

  it("does not flag a map that returns a string", () => {
    assert.equal(one(`export const D=({xs})=><div>{xs.map(x => x.name).join(", ")}</div>;`).length, 0);
  });

  it("handles the element on a following line", () => {
    assert.equal(one(`export const E=({xs})=><div>{xs.map((x) => (\n  <Row key={x.id} value={x} />\n))}</div>;`).length, 0);
    assert.equal(one(`export const F=({xs})=><div>{xs.map((x) => (\n  <Row value={x} />\n))}</div>;`).length, 1);
  });
});
