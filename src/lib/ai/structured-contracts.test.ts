import { describe,it } from "node:test";
import assert from "node:assert/strict";

import {
filePatchesSchema,
generatedFilesSchema,
parseStructuredResponse,
planSchema,
} from "./structured-contracts.ts";

describe("generatedFilesSchema", () => {
  it("accepts a well-formed payload", () => {
    const result = parseStructuredResponse(generatedFilesSchema, JSON.stringify({
      files: [{ path: "src/App.tsx", content: "export default function App(){return null}", language: "tsx" }],
    }));
    assert.equal(result.ok, true);
    assert.equal(result.data!.files[0].path, "src/App.tsx");
  });

  it("rejects unsafe paths through the SAME contract the legacy path uses", () => {
    for (const path of ["../escape.ts", "/etc/passwd", "node_modules/x.js", ".git/config", "src/../../up.ts"]) {
      const result = parseStructuredResponse(generatedFilesSchema, JSON.stringify({
        files: [{ path, content: "x" }],
      }));
      assert.equal(result.ok, false, `${path} must be rejected`);
    }
  });

  it("rejects an empty file list and a missing files key", () => {
    assert.equal(parseStructuredResponse(generatedFilesSchema, '{"files":[]}').ok, false);
    assert.equal(parseStructuredResponse(generatedFilesSchema, '{"paths":[]}').ok, false);
  });

  it("unwraps a markdown fence the model was told not to add", () => {
    const raw = '```json\n{"files":[{"path":"a.ts","content":"x"}]}\n```';
    assert.equal(parseStructuredResponse(generatedFilesSchema, raw).ok, true);
  });

  it("reports compact, model-feedable errors", () => {
    const result = parseStructuredResponse(generatedFilesSchema, JSON.stringify({
      files: [{ path: "", content: 5 }],
    }));
    assert.equal(result.ok, false);
    assert.ok(result.errors!.length >= 1);
    assert.match(result.errors![0], /^files\.0\./);
  });

  it("never throws on garbage", () => {
    assert.equal(parseStructuredResponse(generatedFilesSchema, "not json at all").ok, false);
    assert.equal(parseStructuredResponse(generatedFilesSchema, "").ok, false);
  });
});

describe("filePatchesSchema", () => {
  it("defaults occurrences to exactly one", () => {
    const result = parseStructuredResponse(filePatchesSchema, JSON.stringify({
      patches: [{ path: "src/a.ts", find: "old", replace: "new" }],
    }));
    assert.equal(result.ok, true);
    assert.equal(result.data!.patches[0].occurrences, 1);
  });

  it("rejects an empty find (an empty find matches everywhere)", () => {
    const result = parseStructuredResponse(filePatchesSchema, JSON.stringify({
      patches: [{ path: "src/a.ts", find: "", replace: "new" }],
    }));
    assert.equal(result.ok, false);
  });
});

describe("planSchema", () => {
  it("accepts a minimal plan and fills defaults", () => {
    const result = parseStructuredResponse(planSchema, JSON.stringify({
      summary: "Add auth",
      steps: [{ title: "Create login page" }],
    }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.data!.steps[0].files, []);
  });
});
