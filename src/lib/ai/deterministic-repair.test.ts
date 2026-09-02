/**
 * The free tier must fix what it can and touch NOTHING else. The failure modes
 * pinned here are both directions of overreach: rewriting files on error
 * classes it cannot address, and letting the support-file pass rename modules
 * on a live project where the old path would survive as a duplicate.
 *
 *   node --import tsx --test src/lib/ai/deterministic-repair.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  deterministicRepair,
  hasDeterministicallyFixableErrors,
} from "./deterministic-repair.ts";

const f = (path: string, content: string) => ({ path, content });

const IMPORT_ERROR = 'src/App.tsx:2 — imports "./Card", but no such file exists in the project';
const EXPORT_ERROR = '"formatPrice" is imported by src/App.tsx but is not exported from src/lib/utils';
const RUNTIME_ERROR = "TypeError: Cannot read properties of undefined (reading 'map')";

describe("error-class gate", () => {
  it("recognises all four fixable message shapes", () => {
    for (const msg of [
      IMPORT_ERROR,
      EXPORT_ERROR,
      "src/App.tsx:1:1 — TS2307: Cannot find module './Card' or its corresponding type declarations.",
      "src/App.tsx:1:10 — TS2305: Module '\"./lib/utils\"' has no exported member 'formatPrice'.",
    ]) {
      assert.ok(hasDeterministicallyFixableErrors([msg]), msg);
    }
  });

  it("a runtime crash with no local defects is NOT rewritten", () => {
    assert.equal(hasDeterministicallyFixableErrors([RUNTIME_ERROR]), false);
    const files = [f("src/App.tsx", "export default function App() { return <div>ok</div>; }")];
    const out = deterministicRepair(files, [RUNTIME_ERROR]);
    assert.equal(out.files, files); // identity — not even a copy
    assert.deepEqual(out.changedPaths, []);
    assert.deepEqual(out.createdPaths, []);
  });

  it("still repairs a missing import when the reported error is a runtime crash", () => {
    const files = [f("src/App.tsx", 'import { formatPrice } from "./lib/utils";\nexport default () => <div>{formatPrice(1)}</div>;')];
    const out = deterministicRepair(files, [RUNTIME_ERROR]);
    assert.ok(out.createdPaths.some((path) => /lib\/utils/.test(path)));
  });
});

describe("import repointing — zero model involvement", () => {
  it("repoints a misplaced relative import at the file that exists", () => {
    const files = [
      f("src/App.tsx", 'import Card from "./Card";\nexport default () => <Card />;'),
      f("src/components/Card.tsx", "export default function Card() { return null; }"),
    ];
    const out = deterministicRepair(files, [IMPORT_ERROR]);
    assert.deepEqual(out.changedPaths, ["src/App.tsx"]);
    const app = out.files.find((x) => x.path === "src/App.tsx")!;
    assert.match(app.content!, /from "\.\/components\/Card"/);
    // the target file itself is untouched
    const card = out.files.find((x) => x.path === "src/components/Card.tsx")!;
    assert.equal(card.content, files[1].content);
  });

  it("is idempotent — running it on its own output changes nothing", () => {
    const files = [
      f("src/App.tsx", 'import Card from "./Card";\nexport default () => <Card />;'),
      f("src/components/Card.tsx", "export default function Card() { return null; }"),
    ];
    const once = deterministicRepair(files, [IMPORT_ERROR]);
    const twice = deterministicRepair(once.files, [IMPORT_ERROR]);
    assert.deepEqual(twice.changedPaths, []);
    assert.deepEqual(twice.createdPaths, []);
  });
});

describe("support-file creation", () => {
  it("creates a utils module for a named import that resolves nowhere", () => {
    const files = [
      f(
        "src/App.tsx",
        'import { formatPrice } from "./lib/utils";\nexport default () => <div>{formatPrice(1)}</div>;',
      ),
    ];
    const out = deterministicRepair(files, [EXPORT_ERROR]);
    const utils = out.files.find((x) => /lib\/utils\.ts$/.test(x.path));
    assert.ok(utils, "expected a generated utils module");
    assert.match(utils!.content!, /formatPrice/);
    assert.ok(out.createdPaths.some((p) => /lib\/utils\.ts$/.test(p)));
  });

  it("never renames an existing file — a rename forfeits the support pass", () => {
    // JSX inside a .ts file: ensureCommonGeneratedSupportFiles would rename it
    // to .tsx, which on the repair path would leave the old row alive as a
    // duplicate module. The import rewrite may still apply; the rename must not.
    const files = [
      f("src/widget.ts", "export const w = () => <div/>;"),
      f("src/App.tsx", 'import { w } from "./widget";\nexport default () => null;'),
    ];
    const out = deterministicRepair(files, [IMPORT_ERROR]);
    assert.ok(
      out.files.some((x) => x.path === "src/widget.ts"),
      "original path must survive",
    );
    assert.ok(
      !out.files.some((x) => x.path === "src/widget.tsx"),
      "renamed duplicate must not appear",
    );
  });
});

describe("library maturity", () => {
  const PKG = JSON.stringify({ name: "app", dependencies: { react: "^19.0.0" } });
  const SANDBOX_TS2307 =
    "src/Chart.tsx:1:28 — TS2307: Cannot find module 'recharts' or its corresponding type declarations.";

  it("declares an allowed npm package in package.json instead of calling a model", () => {
    const files = [
      f("package.json", PKG),
      f("src/Chart.tsx", 'import { LineChart } from "recharts";\nexport default () => <LineChart/>;'),
    ];
    const out = deterministicRepair(files, [SANDBOX_TS2307]);
    assert.deepEqual(out.changedPaths, ["package.json"]);
    const pkg = JSON.parse(out.files.find((x) => x.path === "package.json")!.content!);
    assert.equal(pkg.dependencies.recharts, "^2.12.7"); // the allowlist pin
  });

  it("creates a placeholder for a missing image without a model", () => {
    const files = [
      f("src/App.tsx", 'import logo from "./logo.png";\nexport default () => <img src={logo} />;'),
    ];
    const out = deterministicRepair(files, []);
    assert.ok(out.createdPaths.some((path) => path.endsWith(".svg")));
    const app = out.files.find((file) => file.path === "src/App.tsx")!;
    assert.match(app.content!, /\.svg/);
  });

  it("never adds a refused package — that error must reach the model as a rewrite", () => {
    const files = [
      f("package.json", PKG),
      f("src/a.ts", 'import m from "moment";\nexport const x = m;'),
    ];
    const out = deterministicRepair(files, [
      "src/a.ts:1:15 — TS2307: Cannot find module 'moment' or its corresponding type declarations.",
    ]);
    assert.deepEqual(out.changedPaths, []);
    assert.deepEqual(out.createdPaths, []);
  });
});

describe("jsx preview gate — zero model involvement", () => {
  it("rewrites HTML class attributes in TSX without a model", () => {
    const files = [f("src/App.tsx", 'export default () => <div class="hero">Hi</div>;')];
    const out = deterministicRepair(files, []);
    assert.deepEqual(out.changedPaths, ["src/App.tsx"]);
    assert.match(out.files[0]!.content!, /className="hero"/);
  });
});
