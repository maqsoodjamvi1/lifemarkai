import test from "node:test";
import assert from "node:assert/strict";
import {
describePreviewError,
shouldShowRawPreviewDiagnostics,
} from "./preview-error-copy.ts";

/**
 * These are verbatim strings the docker provider produces. If one of them ever
 * reaches a customer's screen unmapped, that is the bug this file exists to
 * prevent — so they are asserted literally rather than paraphrased.
 */
const REAL_ERRORS = {
  noPort: "No free port in 3100-3200. Raise SANDBOX_PORT_RANGE.",
  notConfigured:
    "Docker sandbox needs SANDBOX_PREVIEW_DOMAIN (proxy mode) or SANDBOX_PUBLIC_HOST (port mode) set.",
  createFailed: 'docker create failed (409): {"message":"Conflict. The container name is already in use"}',
  startFailed:
    'docker start failed (500): {"message":"driver failed programming external connectivity: Bind for 0.0.0.0:3107 failed: port is already allocated"}',
  npmInstall: "npm install failed (exit 1).",
  notReady: "[preview] dev server did not answer in time.",
  emptyUpload:
    "Upload reported success but /home/node/app is empty — the archive did not extract",
  gone: "Modal Sandbox with container ID ta-01KY not found. This means this Sandbox has already shut down.",
};

test("no mapped message leaks infrastructure vocabulary", () => {
  // The words a customer must never see, whatever rule matched.
  const forbidden = [
    /docker/i, /container/i, /sandbox/i, /traefik/i, /modal/i,
    /SANDBOX_[A-Z_]+/, /\bport\b/i, /0\.0\.0\.0/, /exit \d/i, /\bnpm\b/,
    /localhost/i, /127\.0\.0\.1/, /\/home\//,
  ];
  for (const [name, raw] of Object.entries(REAL_ERRORS)) {
    const { title, description } = describePreviewError(raw);
    for (const pattern of forbidden) {
      assert.ok(
        !pattern.test(title),
        `title for ${name} leaked ${pattern}: ${title}`,
      );
      assert.ok(
        !pattern.test(description),
        `description for ${name} leaked ${pattern}: ${description}`,
      );
    }
  }
});

test("capacity and configuration failures are never blamed on the user", () => {
  for (const raw of [REAL_ERRORS.noPort, REAL_ERRORS.notConfigured, REAL_ERRORS.createFailed, REAL_ERRORS.startFailed]) {
    assert.equal(describePreviewError(raw).blame, "platform", raw);
  }
});

test("a broken package.json is correctly the project's problem", () => {
  const copy = describePreviewError(REAL_ERRORS.npmInstall);
  assert.equal(copy.blame, "project");
  // Must point at the thing the user can actually change.
  assert.match(copy.description, /package\.json/);
});

test("an app that never serves is the project's problem, not ours", () => {
  assert.equal(describePreviewError(REAL_ERRORS.notReady).blame, "project");
  assert.equal(describePreviewError("[preview] container OOMKilled=true").blame, "project");
});

test("a reclaimed session reads as paused, not as a crash", () => {
  const copy = describePreviewError(REAL_ERRORS.gone);
  assert.equal(copy.blame, "platform");
  assert.equal(copy.title, "Still building?");
  assert.match(copy.description, /idle|paused|resume/i);
});

test("a failed upload tells the user nothing was lost", () => {
  const copy = describePreviewError(REAL_ERRORS.emptyUpload);
  assert.equal(copy.blame, "platform");
  assert.match(copy.description, /nothing was lost/i);
});

test("unknown, empty and null errors all get the safe fallback", () => {
  const fallback = describePreviewError(null);
  assert.equal(describePreviewError(undefined).title, fallback.title);
  assert.equal(describePreviewError("").title, fallback.title);
  assert.equal(describePreviewError("   ").title, fallback.title);
  assert.equal(describePreviewError("something nobody anticipated").title, fallback.title);
  // The fallback still has to reassure — this is the message most users see.
  assert.match(fallback.description, /safe/i);
});

test("every rule produces a description long enough to be an actual sentence", () => {
  for (const raw of Object.values(REAL_ERRORS)) {
    const { title, description } = describePreviewError(raw);
    assert.ok(title.length > 4, title);
    assert.ok(description.length > 40, description);
  }
});

test("raw diagnostics are shown only to developers", () => {
  assert.equal(shouldShowRawPreviewDiagnostics(true), true);
  assert.equal(shouldShowRawPreviewDiagnostics(false), false);
});
