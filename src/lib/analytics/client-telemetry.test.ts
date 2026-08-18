import { describe,it } from "node:test";
import assert from "node:assert/strict";

import { classifySurface,hashIdentifier,sanitizeProps } from "./client-telemetry.ts";

describe("classifySurface — surfaces, never raw URLs", () => {
  it("maps the product areas the plan compares", () => {
    assert.equal(classifySurface("/"), "marketing");
    assert.equal(classifySurface("/templates"), "marketing");
    assert.equal(classifySurface("/dashboard/projects"), "dashboard");
    assert.equal(classifySurface("/editor/8f2c1a"), "editor");
    assert.equal(classifySurface("/preview/anything/here"), "preview");
    assert.equal(classifySurface("/preview-by-slug/my-app"), "preview");
    assert.equal(classifySurface("/app/my-app"), "preview");
    assert.equal(classifySurface("/pricing"), "billing");
    assert.equal(classifySurface("/invite/tok123"), "onboarding");
    assert.equal(classifySurface("/login"), "auth");
    assert.equal(classifySurface("/some/random/path"), "other");
  });

  it("never returns the pathname itself", () => {
    const surfaces = new Set(["marketing","dashboard","editor","preview","billing","onboarding","auth","other"]);
    for (const path of ["/editor/secret-project-name", "/p/user/proj", "/u/someone"]) {
      assert.ok(surfaces.has(classifySurface(path)));
    }
  });
});

describe("hashIdentifier", () => {
  it("is stable, 8-hex, and not reversible to the input shape", () => {
    const h = hashIdentifier("6a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9");
    assert.match(h, /^[a-f0-9]{8}$/);
    assert.equal(hashIdentifier("6a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9"), h);
    assert.notEqual(hashIdentifier("another-id"), h);
  });
});

describe("sanitizeProps — the no-prompt-text guarantee, client edition", () => {
  it("keeps numbers, booleans, and enum-shaped strings", () => {
    assert.deepEqual(
      sanitizeProps({ durationMs: 1200, compiled: true, mode: "agent", framework: "vite" }),
      { durationMs: 1200, compiled: true, mode: "agent", framework: "vite" },
    );
  });

  it("drops anything that could carry free text", () => {
    const out = sanitizeProps({
      prompt: "build me a todo app with auth",   // spaces → dropped
      file: "src/components/App.tsx",             // slashes/dots → dropped
      error: "Cannot read property 'x' of null",  // spaces → dropped
      html: "<div>hi</div>",                       // symbols → dropped
      big: "x".repeat(41),                          // too long → dropped
      nested: { anything: 1 },                      // object → dropped
      ok: "yes",
    });
    assert.deepEqual(out, { ok: "yes" });
  });

  it("drops non-finite numbers", () => {
    assert.deepEqual(sanitizeProps({ a: Infinity, b: NaN, c: 3 }), { c: 3 });
  });
});
