import { test } from "node:test";
import assert from "node:assert/strict";

import {
  guardFileWrite,
  repeatedCopies,
  undefinedComponents,
} from "./guard-file-write.ts";

/**
 * The real shape of the production corruption, at the real size: a 1944-byte
 * package.json that arrived in the database three times over, seam `}{`, no
 * separator, total exactly 5832.
 */
const PKG = JSON.stringify(
  {
    name: "lifemarkai-app",
    version: "0.0.1",
    private: true,
    type: "module",
    scripts: { dev: "vite dev", build: "vite build" },
    dependencies: Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`pkg-number-${i}`, "^1.2.3"]),
    ),
  },
  null,
  2,
);

test("rejects the observed package.json triplication", () => {
  const corrupt = PKG.repeat(3);
  assert.equal(corrupt.length, PKG.length * 3);

  const verdict = guardFileWrite({
    path: "package.json",
    next: corrupt,
    previous: PKG,
  });

  assert.equal(verdict.ok, false);
  // Invalid JSON is checked before duplication, and both are true here.
  assert.equal(verdict.code, "invalid-json");
});

test("rejects a duplicated non-JSON file too", () => {
  const component = `import { useState } from "react";\n\nexport function Widget() {\n  const [n, setN] = useState(0);\n  return <button onClick={() => setN(n + 1)}>{n}</button>;\n}\n// padding to clear the minimum repeat unit ---------------------------------\n`;
  assert.ok(component.length >= 120);

  const verdict = guardFileWrite({
    path: "src/components/Widget.tsx",
    next: component.repeat(2),
    previous: component,
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, "duplicated-content");
});

test("rejects content that appends a whole copy of the previous version", () => {
  // Not an exact N-fold repeat — the trailing newline defeats rule 3, so rule 4
  // has to be the one that fires. Deliberately NOT a .json path, so the
  // earlier-returning invalid-JSON rule does not claim it first.
  const original = `export const config = {\n${Array.from(
    { length: 20 },
    (_, i) => `  key${i}: "value-${i}",`,
  ).join("\n")}\n};\n`;

  const verdict = guardFileWrite({
    path: "src/lib/config.ts",
    next: `${original}${original}\n`,
    previous: original,
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, "duplicated-content");
  assert.ok(verdict.reason?.includes("previous version"));
});

test("allows a normal edit to a valid package.json", () => {
  const edited = PKG.replace('"version": "0.0.1"', '"version": "0.0.2"');
  const verdict = guardFileWrite({
    path: "package.json",
    next: edited,
    previous: PKG,
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.code, undefined);
});

test("rejects unparseable JSON even when the old file was also broken", () => {
  const verdict = guardFileWrite({
    path: "tsconfig.json",
    next: "{ not json",
    previous: "{ also not json",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, "invalid-json");
});

test("refuses to blank a file that had content", () => {
  const verdict = guardFileWrite({
    path: "src/routes/index.tsx",
    next: "   \n",
    previous: "export const Route = 1;\n",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, "empty-overwrite");
});

test("allows creating a new file with no previous content", () => {
  const verdict = guardFileWrite({
    path: "src/lib/new.ts",
    next: "export const x = 1;\n",
  });

  assert.equal(verdict.ok, true);
});

test("rejects a rewrite that drops an import it still uses", () => {
  // The shape this rule is for: HeadContent survives in the body but vanishes
  // from the import clause.
  const broken = [
    'import { Outlet, createRootRoute } from "@tanstack/react-router";',
    "",
    "export const Route = createRootRoute({ component: RootComponent });",
    "",
    "function RootComponent() {",
    "  return (",
    "    <html>",
    "      <head>",
    "        <HeadContent />",
    "      </head>",
    "      <body>",
    "        <Outlet />",
    "      </body>",
    "    </html>",
    "  );",
    "}",
  ].join("\n");

  const verdict = guardFileWrite({ path: "src/routes/__root.tsx", next: broken });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, "undefined-component");
  assert.ok(verdict.reason?.includes("HeadContent"));
});

test("accepts the corrected root route", () => {
  const good = [
    'import type { ReactNode } from "react";',
    'import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";',
    'import appCss from "../styles.css?url";',
    'import { Header } from "../components/layout/Header";',
    'import { Footer } from "../components/layout/Footer";',
    "",
    "export const Route = createRootRoute({",
    "  head: () => ({ links: [{ rel: 'stylesheet', href: appCss }] }),",
    "  component: RootComponent,",
    "});",
    "",
    "function RootComponent() {",
    "  return (",
    "    <RootDocument>",
    "      <Header />",
    "      <Outlet />",
    "      <Footer />",
    "    </RootDocument>",
    "  );",
    "}",
    "",
    "function RootDocument({ children }: Readonly<{ children: ReactNode }>) {",
    "  return (",
    '    <html lang="en">',
    "      <head>",
    "        <HeadContent />",
    "      </head>",
    "      <body>",
    "        {children}",
    "        <Scripts />",
    "      </body>",
    "    </html>",
    "  );",
    "}",
  ].join("\n");

  const verdict = guardFileWrite({ path: "src/routes/__root.tsx", next: good });
  assert.equal(verdict.ok, true, verdict.reason);
});

test("namespace and aliased imports count as in scope", () => {
  const src = [
    'import * as Icons from "lucide-react";',
    'import { Button as Btn } from "./ui/button";',
    'import Default from "./Default";',
    "",
    "export function Row() {",
    "  return (",
    "    <div>",
    "      <Icons.Coffee />",
    "      <Btn />",
    "      <Default />",
    "    </div>",
    "  );",
    "}",
  ].join("\n");

  assert.deepEqual(undefinedComponents(src), []);
});

test("a component named only inside a comment or string is not a usage", () => {
  const src = [
    'import { Outlet } from "@tanstack/react-router";',
    "",
    "// Historically this rendered <LegacyShell /> before the rewrite.",
    'const note = "<AlsoNotReal />";',
    "",
    "export function View() {",
    "  return <Outlet />;",
    "}",
  ].join("\n");

  assert.deepEqual(undefinedComponents(src), []);
});

test("a destructuring rename counts as binding the name", () => {
  // `{ icon: Icon }` is how a dozen real files in this repo bind a component,
  // and an import-clause parser missed every one of them.
  const src = [
    'import { Coffee } from "lucide-react";',
    "",
    "const items = [{ icon: Coffee, label: 'Brew' }];",
    "",
    "export function List() {",
    "  return items.map(({ icon: Icon, label }) => <Icon key={label} />);",
    "}",
  ].join("\n");

  assert.deepEqual(undefinedComponents(src), []);
});

test("a regex literal containing quotes does not desync the scanner", () => {
  // The exact shape from performance-panel.tsx. Without regex-literal handling
  // the `'` inside the character class opens a phantom string, every later
  // literal is read as code, and <Image> inside a prompt string is reported as
  // an undefined component.
  const src = [
    'import { useMemo } from "react";',
    "",
    "export function Audit({ all }: { all: string }) {",
    "  const hasNextImage = /from ['\"]next\\/image['\"]/i.test(all);",
    '  const tip = "Replace <img> with the <Image> component from next/image.";',
    "  return <span>{hasNextImage ? tip : null}</span>;",
    "}",
  ].join("\n");

  assert.deepEqual(undefinedComponents(src), []);
});

test("tsconfig-style JSONC with comments and trailing commas is allowed", () => {
  const jsonc = [
    "{",
    '  // TypeScript accepts comments here, and so does this repo\'s tsconfig.',
    '  "compilerOptions": {',
    '    "strict": true,',
    "  },",
    "}",
  ].join("\n");

  const verdict = guardFileWrite({ path: "tsconfig.json", next: jsonc });
  assert.equal(verdict.ok, true, verdict.reason);
});

test("genuinely broken JSONC is still rejected", () => {
  const verdict = guardFileWrite({
    path: "tsconfig.json",
    next: '{ "compilerOptions": { "strict": true // never closed',
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, "invalid-json");
});

test("repeatedCopies ignores short strings and reports the real factor", () => {
  assert.equal(repeatedCopies("ab".repeat(50)), 1, "unit below the minimum");

  // A unit that is itself uniform ("xxxx…") is genuinely also a 2-fold repeat
  // of half of itself, so the factor reported for it is ambiguous by nature.
  // Use a unit with a distinguishing tail so only the true factor matches.
  const unit = `${"A".repeat(199)}B`;
  assert.equal(repeatedCopies(unit), 1);
  assert.equal(repeatedCopies(unit.repeat(2)), 2);
  assert.equal(repeatedCopies(unit.repeat(3)), 3);
});
