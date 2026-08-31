import assert from "node:assert/strict";
import test from "node:test";
import { derivePreviewPages } from "./derive-pages.ts";

// Regression: nested <Route> children resolve their relative `path` against
// their PARENT's path (idiomatic react-router-dom), not against root. The
// old scanner treated every match independently and just prepended "/" to
// any non-absolute path, turning a child route like `path="settings"` nested
// under `path="/dashboard"` into "/settings" instead of "/dashboard/settings"
// — a page offered in the dropdown that doesn't exist at that URL.
test("derivePreviewPages resolves nested <Route> children against their parent path", () => {
  const content = `
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dashboard" element={<Layout />}>
        <Route path="settings" element={<Settings />} />
        <Route path="billing" element={<Billing />} />
      </Route>
      <Route path="about" element={<About />} />
    </Routes>
  `;
  const pages = derivePreviewPages([{ path: "src/App.tsx", content }]);
  const paths = pages.map((p) => p.path).sort();
  assert.deepEqual(paths, ["/", "/about", "/dashboard", "/dashboard/billing", "/dashboard/settings"]);
});

test("derivePreviewPages resolves multiple levels of nesting", () => {
  const content = `
    <Route path="/a">
      <Route path="b">
        <Route path="c" element={<C />} />
      </Route>
    </Route>
  `;
  const pages = derivePreviewPages([{ path: "src/App.tsx", content }]);
  assert.deepEqual(pages.map((p) => p.path).sort(), ["/a", "/a/b", "/a/b/c"]);
});

test("derivePreviewPages does not misparse a nested self-closing JSX attribute as the Route tag's own end", () => {
  // `element={<Layout />}` contains its own ">" before the real end of the
  // <Route ...> tag — a naive `[^>]*` scan stops there and corrupts parsing
  // of everything after it in the file.
  const content = `<Route path="/dashboard" element={<Layout />}><Route path="settings" element={<Settings />} /></Route>`;
  const pages = derivePreviewPages([{ path: "src/App.tsx", content }]);
  assert.deepEqual(pages.map((p) => p.path).sort(), ["/dashboard", "/dashboard/settings"]);
});

test("derivePreviewPages still skips dynamic segments, including nested ones", () => {
  const content = `<Route path="/blog"><Route path=":slug" element={<Post />} /></Route>`;
  const pages = derivePreviewPages([{ path: "src/App.tsx", content }]);
  assert.deepEqual(pages.map((p) => p.path), ["/blog"]);
});

test("derivePreviewPages still resolves ordinary top-level routes without leading slash", () => {
  const content = `<Route path="about" element={<About />} />`;
  const pages = derivePreviewPages([{ path: "src/App.tsx", content }]);
  assert.deepEqual(pages.map((p) => p.path), ["/about"]);
});
