import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isTransientNpmInstallFailure,
  npmInstallShell,
  parseNpmInstallExit,
} from "./npm-install.ts";

describe("sandbox npm install", () => {
  it("raises fetch timeouts and records LM_NPM_EXIT", () => {
    const shell = npmInstallShell(600);
    assert.match(shell, /npm_config_fetch_timeout=600000/);
    assert.match(shell, /npm_config_fetch_retries=5/);
    assert.match(shell, /timeout 600 npm install/);
    assert.match(shell, /LM_NPM_EXIT/);
  });

  it("retries registry idle timeouts but not a hard wall-clock kill", () => {
    const idle =
      "npm error code EIDLETIMEOUT\nnpm error Idle timeout reached for host `registry.npmjs.org:443`\nLM_NPM_EXIT:1";
    assert.equal(isTransientNpmInstallFailure(idle, 1), true);
    assert.equal(
      isTransientNpmInstallFailure("npm error process terminated\nnpm error signal SIGTERM", 1),
      true,
    );
    assert.equal(isTransientNpmInstallFailure("npm error code ERESOLVE", 1), false);
    assert.equal(isTransientNpmInstallFailure("killed", 124), false);
  });

  it("parses the install exit marker", () => {
    assert.equal(parseNpmInstallExit("LM_NPM_EXIT:1\n", ""), 1);
    assert.equal(parseNpmInstallExit("", "ok\nLM_NPM_EXIT:0"), 0);
  });
});
