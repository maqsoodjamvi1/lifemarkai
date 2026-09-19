import assert from "node:assert/strict";
import test from "node:test";
import { pinTanStackRuntimeManifest, TANSTACK_RUNTIME_PINS, TANSTACK_BUILD_VITE_PIN } from "./tanstack-runtime-pins.ts";
import { TANSTACK_START_DEPENDENCIES, TANSTACK_START_DEV_DEPENDENCIES } from "../templates/tanstack-start-scaffold.ts";
import { lockControlledDependencyVersions, resolveControlledTemplateForPrompt } from "../templates/controlled-registry.ts";

test("generated and published TanStack manifests use the same exact tested runtime", () => {
  const input = JSON.stringify({ name: "test", dependencies: { react: "^19.2.0", "@tanstack/react-start": "^1.168.0", clsx: "^2.1.1" }, devDependencies: { "react-dom": "^19.3.0", vite: "^7.0.0" } });
  const published = JSON.parse(pinTanStackRuntimeManifest(input));
  const generated = JSON.parse(lockControlledDependencyVersions(input, resolveControlledTemplateForPrompt("Build a bakery", "tanstack-start")).content);
  for (const [name, version] of Object.entries(TANSTACK_RUNTIME_PINS)) {
    assert.match(version, /^\d+\.\d+\.\d+$/);
    assert.equal(published.dependencies[name], version);
    assert.equal(published.devDependencies[name], undefined);
    assert.equal(generated.dependencies[name], version);
    assert.equal(TANSTACK_START_DEPENDENCIES[name], version);
  }
  assert.equal(published.devDependencies.vite, TANSTACK_BUILD_VITE_PIN);
  assert.equal(TANSTACK_START_DEV_DEPENDENCIES.vite, TANSTACK_BUILD_VITE_PIN);
  assert.equal(published.dependencies.clsx, "^2.1.1");
  const once = pinTanStackRuntimeManifest(input);
  assert.equal(pinTanStackRuntimeManifest(once), once);
});

test("runtime pinning leaves other frameworks and malformed manifests unchanged", () => {
  for (const input of ['{"dependencies":{"react":"^19.3.0"}}', "null", "[]", "broken"]) {
    assert.equal(pinTanStackRuntimeManifest(input), input);
  }
});
