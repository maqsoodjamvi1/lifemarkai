import assert from "node:assert/strict";
import test from "node:test";
import { buildFallbackHtml } from "./build-fallback-html.ts";
import type { ProjectFile } from "../../types/database.ts";

function file(path: string, content: string): ProjectFile {
  return {
    id: `id-${path}`,
    project_id: "proj-1",
    path,
    content,
    language: "typescript",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as ProjectFile;
}

/**
 * The fallback preview's react-router-dom shim is generated as inline JS
 * text inside buildFallbackHtml's output HTML (it runs in the browser via
 * Babel-standalone, not compiled by our own build) — there's no exported
 * function to import directly. This extracts the real, shipped
 * `matchRouteParams` source (brace-depth aware, since the function body has
 * its own nested `{}` blocks that a naive regex would stop at) and executes
 * it standalone to pin its matching behavior.
 *
 * Regression: this function previously only supported an exact string match
 * or a trailing "/*" wildcard — a dynamic segment like "/blog/:slug" never
 * matched a real URL ("/blog/hello-world"), so any project using that
 * idiomatic react-router pattern rendered a blank page whenever this
 * fallback path ran. `useParams()` was also hardcoded to return `{}`.
 */
function extractMatchRouteParams(html: string): (pattern: string, pathname: string) => unknown {
  const startMarker = "function matchRouteParams(pattern, pathname) {";
  const start = html.indexOf(startMarker);
  assert.ok(start >= 0, "matchRouteParams not found in generated HTML");
  let i = start + startMarker.length;
  let depth = 1;
  while (depth > 0 && i < html.length) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") depth--;
    i++;
  }
  const body = html.slice(start + startMarker.length, i - 1);
  // eslint-disable-next-line no-new-func -- extracting real shipped shim source for a pinning test
  return new Function("pattern", "pathname", body) as (pattern: string, pathname: string) => unknown;
}

function fallbackHtmlWithRouterShim(): string {
  return buildFallbackHtml([
    file(
      "index.html",
      '<!doctype html><html><body><div id="root"></div>' +
        '<script type="module" src="/src/main.tsx"></script></body></html>',
    ),
    file("src/main.tsx", 'import App from "./App"; export default App;'),
    file("src/App.tsx", "export default function App(){ return null; }"),
  ]);
}

test("fallback preview router shim matches dynamic :param segments", () => {
  const matchRouteParams = extractMatchRouteParams(fallbackHtmlWithRouterShim());

  assert.deepEqual(matchRouteParams("/blog/:slug", "/blog/hello-world"), { slug: "hello-world" });
  assert.deepEqual(matchRouteParams("/users/:id/edit", "/users/42/edit"), { id: "42" });
  assert.equal(matchRouteParams("/blog/:slug", "/other"), null);
  assert.equal(matchRouteParams("/blog", "/blog/hello-world"), null, "a longer path must not match a shorter static pattern");
});

test("fallback preview router shim still matches static and wildcard patterns", () => {
  const matchRouteParams = extractMatchRouteParams(fallbackHtmlWithRouterShim());

  assert.deepEqual(matchRouteParams("/", "/"), {});
  assert.deepEqual(matchRouteParams("about", "/about"), {});
  assert.deepEqual(matchRouteParams("/blog/*", "/blog/2024/hello"), { "*": "2024/hello" });
  assert.equal(matchRouteParams("/blog/*", "/other"), null);
});

test("fallback preview HTML exposes useParams reading matched params, not a hardcoded {}", () => {
  const html = fallbackHtmlWithRouterShim();
  assert.ok(
    html.includes("useParams: function() { return React.useContext(ParamsCtx); }"),
    "useParams must read the route's matched params, not always return {}",
  );
});

// Regression: a single module's Babel-transform or eval failure inside
// run()'s per-file loop used to "return" out of run() ENTIRELY — the first
// broken file (whatever order it happened to be processed in) stopped every
// subsequent module from ever registering, including the app's own entry
// component, so the whole preview blanked out over one unrelated broken
// file. This pins the generated source: the per-file catch blocks must
// "continue" the loop, not "return" from the function.
test("fallback preview run() isolates a single broken module instead of aborting entirely", () => {
  const html = fallbackHtmlWithRouterShim();
  const runStart = html.indexOf("function run() {");
  assert.ok(runStart >= 0, "run() not found in generated HTML");
  const runBody = html.slice(runStart, runStart + 4000);

  // Both per-module failure sites (Babel transform, and eval of the
  // transformed code) must "continue" the loop rather than "return" from
  // run() — a "return" there aborts every subsequent module too.
  const transformCatch = runBody.indexOf("showError(file, (err && err.message) || err, err); continue;");
  assert.ok(transformCatch >= 0, "transform-failure catch must continue, not return");
  const secondOccurrence = runBody.indexOf(
    "showError(file, (err && err.message) || err, err); continue;",
    transformCatch + 1,
  );
  assert.ok(secondOccurrence >= 0, "eval-failure catch must also continue, not return");
});

// Regression: buildFallbackHtml redid its entire multi-pass pipeline (a
// project-wide contract-healing scan, CSS synthesis, ~40 regex transforms
// per file) on every call, even when called twice in a row with byte-
// identical input (the /preview/{id} route and self-verify's per-round loop
// both do this). Caching by content signature makes the second call for
// unchanged files return the SAME string instantly instead of rebuilding.
test("buildFallbackHtml returns a cached result for byte-identical input", () => {
  const files = [
    file(
      "index.html",
      '<!doctype html><html><body><div id="root"></div>' +
        '<script type="module" src="/src/main.tsx"></script></body></html>',
    ),
    file("src/main.tsx", 'import App from "./App"; export default App;'),
    file("src/App.tsx", "export default function App(){ return null; }"),
  ];
  const first = buildFallbackHtml(files);
  const second = buildFallbackHtml(files);
  assert.equal(first, second);
  // Different (unrelated) content must NOT hit the same cache entry.
  const third = buildFallbackHtml([
    ...files.slice(0, 2),
    file("src/App.tsx", "export default function App(){ return 'different marker'; }"),
  ]);
  assert.notEqual(third, first);
  assert.match(third, /different marker/);
});
