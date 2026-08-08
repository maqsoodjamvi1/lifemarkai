import { describe,it } from "node:test";
import assert from "node:assert/strict";

import { isSandboxPreviewHost } from "./preview-host.ts";

const opts = {
  previewDomain: "preview.lifemarkai.com",
  appHost: "https://lifemarkai.com",
};

describe("isSandboxPreviewHost", () => {
  it("claims a project's preview hostname", () => {
    assert.equal(isSandboxPreviewHost("43a14e3e.preview.lifemarkai.com", opts), true);
  });

  it("ignores the port the proxy may append", () => {
    assert.equal(isSandboxPreviewHost("43a14e3e.preview.lifemarkai.com:443", opts), true);
  });

  it("is case-insensitive, as hostnames are", () => {
    assert.equal(isSandboxPreviewHost("43A14E3E.Preview.LifemarkAI.com", opts), true);
  });

  // The whole point is to stop hijacking the app itself. These are the ways
  // that could go wrong, and each one would take the product down.
  it("leaves the app's own host alone", () => {
    assert.equal(isSandboxPreviewHost("lifemarkai.com", opts), false);
    assert.equal(isSandboxPreviewHost("www.lifemarkai.com", opts), false);
  });

  it("leaves the bare preview domain alone — it is not a project", () => {
    assert.equal(isSandboxPreviewHost("preview.lifemarkai.com", opts), false);
  });

  it("leaves the app alone even when served under the preview domain", () => {
    assert.equal(
      isSandboxPreviewHost("app.preview.lifemarkai.com", {
        ...opts,
        appHost: "https://app.preview.lifemarkai.com",
      }),
      false,
    );
  });

  it("does not match a lookalike domain that merely ends the same way", () => {
    assert.equal(isSandboxPreviewHost("x.evil-preview.lifemarkai.com", opts), false);
    assert.equal(isSandboxPreviewHost("preview.lifemarkai.com.evil.test", opts), false);
  });

  it("only matches a single label — we never issue deeper names", () => {
    assert.equal(isSandboxPreviewHost("a.b.preview.lifemarkai.com", opts), false);
  });

  // Config is written by hand and pasted from DNS; neither shape should
  // silently turn the whole check off.
  it("accepts a wildcard-shaped or URL-shaped domain setting", () => {
    assert.equal(
      isSandboxPreviewHost("abc.preview.lifemarkai.com", {
        ...opts,
        previewDomain: "*.preview.lifemarkai.com",
      }),
      true,
    );
    assert.equal(
      isSandboxPreviewHost("abc.preview.lifemarkai.com", {
        ...opts,
        previewDomain: "https://preview.lifemarkai.com/",
      }),
      true,
    );
  });

  it("does nothing when no preview domain is configured", () => {
    assert.equal(isSandboxPreviewHost("abc.preview.lifemarkai.com", { previewDomain: "" }), false);
    assert.equal(isSandboxPreviewHost("abc.preview.lifemarkai.com", {}), false);
  });

  it("tolerates missing or malformed hosts", () => {
    assert.equal(isSandboxPreviewHost(null, opts), false);
    assert.equal(isSandboxPreviewHost("", opts), false);
    assert.equal(isSandboxPreviewHost("   ", opts), false);
  });
});
