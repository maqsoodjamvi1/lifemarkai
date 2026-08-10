import assert from "node:assert/strict";
import test from "node:test";
import { normalizePreviewError, normalizedErrorReport } from "./normalized-error.ts";

test("both preview engines return the same normalized error contract", () => {
  const staticError = normalizePreviewError("static", "Unexpected token");
  const frameworkError = normalizePreviewError("framework", new Error("Unexpected token"));
  assert.equal(staticError.message, frameworkError.message);
  assert.equal(normalizedErrorReport(staticError).formatted, normalizedErrorReport(frameworkError).formatted);
  assert.equal(staticError.engine, "static");
  assert.equal(frameworkError.engine, "framework");
});
