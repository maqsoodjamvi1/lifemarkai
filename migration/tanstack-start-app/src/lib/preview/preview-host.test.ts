import { describe, expect, it } from "vitest";
import { isSandboxPreviewHost } from "./preview-host";

const opts = {
  previewDomain: "preview.lifemarkai.com",
  appHost: "https://lifemarkai.com",
};

describe("isSandboxPreviewHost", () => {
  it("claims a project's preview hostname", () => {
    expect(isSandboxPreviewHost("43a14e3e.preview.lifemarkai.com", opts)).toBe(true);
  });

  it("ignores the port the proxy may append", () => {
    expect(isSandboxPreviewHost("43a14e3e.preview.lifemarkai.com:443", opts)).toBe(true);
  });

  it("is case-insensitive, as hostnames are", () => {
    expect(isSandboxPreviewHost("43A14E3E.Preview.LifemarkAI.com", opts)).toBe(true);
  });

  // The whole point is to stop hijacking the app itself. These are the ways
  // that could go wrong, and each one would take the product down.
  it("leaves the app's own host alone", () => {
    expect(isSandboxPreviewHost("lifemarkai.com", opts)).toBe(false);
    expect(isSandboxPreviewHost("www.lifemarkai.com", opts)).toBe(false);
  });

  it("leaves the bare preview domain alone — it is not a project", () => {
    expect(isSandboxPreviewHost("preview.lifemarkai.com", opts)).toBe(false);
  });

  it("leaves the app alone even when served under the preview domain", () => {
    expect(
      isSandboxPreviewHost("app.preview.lifemarkai.com", {
        ...opts,
        appHost: "https://app.preview.lifemarkai.com",
      }),
    ).toBe(false);
  });

  it("does not match a lookalike domain that merely ends the same way", () => {
    expect(isSandboxPreviewHost("x.evil-preview.lifemarkai.com", opts)).toBe(false);
    expect(isSandboxPreviewHost("preview.lifemarkai.com.evil.test", opts)).toBe(false);
  });

  it("only matches a single label — we never issue deeper names", () => {
    expect(isSandboxPreviewHost("a.b.preview.lifemarkai.com", opts)).toBe(false);
  });

  // Config is written by hand and pasted from DNS; neither shape should
  // silently turn the whole check off.
  it("accepts a wildcard-shaped or URL-shaped domain setting", () => {
    expect(
      isSandboxPreviewHost("abc.preview.lifemarkai.com", {
        ...opts,
        previewDomain: "*.preview.lifemarkai.com",
      }),
    ).toBe(true);
    expect(
      isSandboxPreviewHost("abc.preview.lifemarkai.com", {
        ...opts,
        previewDomain: "https://preview.lifemarkai.com/",
      }),
    ).toBe(true);
  });

  it("does nothing when no preview domain is configured", () => {
    expect(isSandboxPreviewHost("abc.preview.lifemarkai.com", { previewDomain: "" })).toBe(false);
    expect(isSandboxPreviewHost("abc.preview.lifemarkai.com", {})).toBe(false);
  });

  it("tolerates missing or malformed hosts", () => {
    expect(isSandboxPreviewHost(null, opts)).toBe(false);
    expect(isSandboxPreviewHost("", opts)).toBe(false);
    expect(isSandboxPreviewHost("   ", opts)).toBe(false);
  });
});
