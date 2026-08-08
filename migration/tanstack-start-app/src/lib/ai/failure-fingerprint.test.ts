import { test } from "node:test";
import assert from "node:assert/strict";

import {
distinctFingerprints,
fingerprintDiagnostic,
fingerprintError,
fingerprintValidation,
scoreRepair,
} from "./failure-fingerprint.ts";

test("the same diagnostic in two files is one failure", () => {
  const a = fingerprintDiagnostic({
    code: 2305,
    message: `Module '"@tanstack/react-router"' has no exported member 'Body'.`,
    file: "src/routes/__root.tsx",
  });
  const b = fingerprintDiagnostic({
    code: 2305,
    message: `Module '"@tanstack/react-router"' has no exported member 'Body'.`,
    file: "src/routes/about.tsx",
  });

  assert.equal(a.fingerprint, b.fingerprint, "same model mistake, one bug");
  assert.equal(a.kind, "typecheck");
});

test("different missing members are different failures", () => {
  const body = fingerprintDiagnostic({
    code: 2305,
    message: `Module '"@tanstack/react-router"' has no exported member 'Body'.`,
    file: "src/routes/__root.tsx",
  });
  const html = fingerprintDiagnostic({
    code: 2305,
    message: `Module '"@tanstack/react-router"' has no exported member 'Html'.`,
    file: "src/routes/__root.tsx",
  });

  assert.notEqual(
    body.fingerprint,
    html.fingerprint,
    "the quoted identifier IS the bug — normalising it away would merge every missing-export error into one bucket",
  );
});

test("a different package with the same shape is a different failure", () => {
  const one = fingerprintDiagnostic({
    code: 2305,
    message: `Module '"@tanstack/react-router"' has no exported member 'Body'.`,
  });
  const two = fingerprintDiagnostic({
    code: 2305,
    message: `Module '"react-router-dom"' has no exported member 'Body'.`,
  });
  assert.notEqual(one.fingerprint, two.fingerprint);
});

test("line and column movement does not create a new failure", () => {
  const before = fingerprintError(
    "TypeError: Cannot read properties of undefined (reading '_addFileChildren')\n    at eval (/home/node/app/src/routeTree.gen.ts:34:4)",
  );
  const after = fingerprintError(
    "TypeError: Cannot read properties of undefined (reading '_addFileChildren')\n    at eval (/home/node/app/src/routeTree.gen.ts:41:9)",
  );
  assert.equal(before.fingerprint, after.fingerprint);
});

test("bundle hashes and cache-busting query strings are noise", () => {
  const a = fingerprintError(
    "Error: Hydration failed\n    at beginWork (https://x.preview.lifemarkai.com/node_modules/.vite/deps/chunk-UAD7S5IU.js?v=7daf3511:15983:22)",
  );
  const b = fingerprintError(
    "Error: Hydration failed\n    at beginWork (https://y.preview.lifemarkai.com/node_modules/.vite/deps/chunk-QQ11ZZ99.js?v=deadbeef:16104:31)",
  );
  assert.equal(a.fingerprint, b.fingerprint, "two loads of one bug");
});

test("genuinely different runtime errors stay apart", () => {
  const a = fingerprintError("TypeError: Cannot read properties of undefined (reading 'map')");
  const b = fingerprintError("ReferenceError: Icon is not defined");
  assert.notEqual(a.fingerprint, b.fingerprint);
});

test("validation issues keep their issue type in the identity", () => {
  const a = fingerprintValidation({ type: "broken_import", message: "x" });
  const b = fingerprintValidation({ type: "missing_named_export", message: "x" });
  assert.notEqual(a.fingerprint, b.fingerprint);
  assert.match(a.label, /^broken_import: /);
});

test("fingerprints are short and index-safe", () => {
  const id = fingerprintDiagnostic({ code: 2305, message: "x".repeat(5_000) });
  assert.ok(id.fingerprint.length <= 32);
  assert.match(id.fingerprint, /^[a-z0-9-]+$/);
  assert.ok(id.label.length <= 300);
});

test("distinctFingerprints dedupes and preserves first-seen order", () => {
  const mk = (m: string) => fingerprintDiagnostic({ code: 2305, message: m });
  const list = [mk("a"), mk("b"), mk("a"), mk("c")];
  assert.equal(distinctFingerprints(list).length, 3);
  assert.deepEqual(distinctFingerprints(list), [
    mk("a").fingerprint,
    mk("b").fingerprint,
    mk("c").fingerprint,
  ]);
});

test("scoreRepair separates what a fix cleared from what it caused", () => {
  const mk = (m: string) => fingerprintDiagnostic({ code: 2305, message: m });

  // A round that fixed one error and broke something else. The COUNT is
  // unchanged, which is exactly why counts are the wrong label.
  const before = [mk("missing Body"), mk("missing Html")];
  const after = [mk("missing Html"), mk("brand new problem")];

  const score = scoreRepair(before, after);
  assert.deepEqual(score.resolved, [mk("missing Body").fingerprint]);
  assert.deepEqual(score.introduced, [mk("brand new problem").fingerprint]);
  assert.deepEqual(score.remaining, [mk("missing Html").fingerprint]);
  assert.equal(before.length, after.length, "count-based scoring would call this neutral");
});

test("a clean repair reports no introductions", () => {
  const mk = (m: string) => fingerprintDiagnostic({ code: 2305, message: m });
  const score = scoreRepair([mk("a"), mk("b")], []);
  assert.equal(score.resolved.length, 2);
  assert.equal(score.introduced.length, 0);
  assert.equal(score.remaining.length, 0);
});
