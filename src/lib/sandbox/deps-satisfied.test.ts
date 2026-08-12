import test from "node:test";
import assert from "node:assert/strict";
import { dependenciesAlreadySatisfied } from "./deps-satisfied.ts";

const BASE = JSON.stringify({
  name: "lifemark-sandbox-base",
  version: "1.0.0",
  dependencies: { react: "^19.2.0", "react-dom": "^19.2.0", "lucide-react": "^0.468.0" },
  devDependencies: { vite: "^5.4.19", typescript: "^5.8.3", "@types/react": "^19.0.0" },
});

/** Same deps, different name/version/scripts — which is every generated app. */
const MATCHING_PROJECT = JSON.stringify({
  name: "my-calorie-tracker",
  version: "0.0.1",
  scripts: { dev: "vite", build: "vite build" },
  dependencies: { react: "^19.2.0", "react-dom": "^19.2.0", "lucide-react": "^0.468.0" },
  devDependencies: { vite: "^5.4.19", typescript: "^5.8.3", "@types/react": "^19.0.0" },
});

test("identical dependency sets skip the install", () => {
  const r = dependenciesAlreadySatisfied(BASE, MATCHING_PROJECT, true);
  assert.equal(r.satisfied, true);
  assert.match(r.reason, /match/);
});

test("a different name, version and scripts do not block the skip", () => {
  // This is the whole point: the scaffold always differs from the image in
  // metadata and always matches it in dependencies.
  assert.equal(dependenciesAlreadySatisfied(BASE, MATCHING_PROJECT, true).satisfied, true);
});

test("key order and whitespace in specs do not block the skip", () => {
  const reordered = JSON.stringify({
    devDependencies: { "@types/react": " ^19.0.0 ", typescript: "^5.8.3", vite: "^5.4.19" },
    dependencies: { "lucide-react": "^0.468.0", "react-dom": "^19.2.0", react: "^19.2.0" },
  });
  assert.equal(dependenciesAlreadySatisfied(BASE, reordered, true).satisfied, true);
});

// ── Every difference must fall through to a real install ────────────────────

test("an added package forces the install", () => {
  const p = JSON.parse(MATCHING_PROJECT);
  p.dependencies.recharts = "^2.15.0";
  const r = dependenciesAlreadySatisfied(BASE, JSON.stringify(p), true);
  assert.equal(r.satisfied, false);
  assert.match(r.reason, /added/);
  assert.match(r.reason, /recharts/);
});

test("a changed version spec forces the install", () => {
  const p = JSON.parse(MATCHING_PROJECT);
  p.dependencies.react = "^18.3.1";
  const r = dependenciesAlreadySatisfied(BASE, JSON.stringify(p), true);
  assert.equal(r.satisfied, false);
  assert.match(r.reason, /changed/);
});

test("a REMOVED package forces the install — npm prunes, which is real work", () => {
  const p = JSON.parse(MATCHING_PROJECT);
  delete p.dependencies["lucide-react"];
  const r = dependenciesAlreadySatisfied(BASE, JSON.stringify(p), true);
  assert.equal(r.satisfied, false);
  assert.match(r.reason, /removed/);
});

test('a "latest" dist-tag forces the install even if the name matches', () => {
  // ensureTailwindPluginDeps injects "latest" for unpinned plugins; npm must
  // contact the registry to resolve a dist-tag, so this can never be skipped.
  const p = JSON.parse(MATCHING_PROJECT);
  p.devDependencies.vite = "latest";
  assert.equal(dependenciesAlreadySatisfied(BASE, JSON.stringify(p), true).satisfied, false);
});

test("moving a package between dependencies and devDependencies is still a match", () => {
  // npm installs both into the same tree, so this genuinely changes nothing.
  const p = {
    dependencies: {
      react: "^19.2.0",
      "react-dom": "^19.2.0",
      "lucide-react": "^0.468.0",
      vite: "^5.4.19",
    },
    devDependencies: { typescript: "^5.8.3", "@types/react": "^19.0.0" },
  };
  assert.equal(dependenciesAlreadySatisfied(BASE, JSON.stringify(p), true).satisfied, true);
});

// ── Fail closed on anything unclear ─────────────────────────────────────────

test("no node_modules never skips", () => {
  const r = dependenciesAlreadySatisfied(BASE, MATCHING_PROJECT, false);
  assert.equal(r.satisfied, false);
  assert.match(r.reason, /node_modules/);
});

test("an unreadable baseline never skips", () => {
  for (const bad of [null, undefined, "", "   ", "not json", "[1,2,3]", '"a string"']) {
    assert.equal(
      dependenciesAlreadySatisfied(bad, MATCHING_PROJECT, true).satisfied,
      false,
      `baseline ${JSON.stringify(bad)}`,
    );
  }
});

test("an unreadable project package.json never skips", () => {
  for (const bad of [null, undefined, "", "{ broken", "42"]) {
    assert.equal(
      dependenciesAlreadySatisfied(BASE, bad, true).satisfied,
      false,
      `project ${JSON.stringify(bad)}`,
    );
  }
});

test("a malformed dependencies section never skips", () => {
  const arrayDeps = JSON.stringify({ dependencies: ["react"] });
  assert.equal(dependenciesAlreadySatisfied(BASE, arrayDeps, true).satisfied, false);
  const nonStringSpec = JSON.stringify({ dependencies: { react: 19 } });
  assert.equal(dependenciesAlreadySatisfied(BASE, nonStringSpec, true).satisfied, false);
});

test("two dependency-free package.jsons match", () => {
  const empty = JSON.stringify({ name: "x" });
  const r = dependenciesAlreadySatisfied(empty, JSON.stringify({ name: "y" }), true);
  assert.equal(r.satisfied, true);
});

test("a dependency-free project against a stocked image does NOT match", () => {
  // Everything in the image would be pruned.
  const r = dependenciesAlreadySatisfied(BASE, JSON.stringify({ name: "y" }), true);
  assert.equal(r.satisfied, false);
  assert.match(r.reason, /removed/);
});
