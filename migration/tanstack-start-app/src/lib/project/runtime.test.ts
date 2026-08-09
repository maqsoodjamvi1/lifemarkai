import test from "node:test";
import assert from "node:assert/strict";
import { isStaticProject, resolveProjectRuntime, runtimeForFramework } from "./runtime.ts";

test("runtimeForFramework maps only browser-native frameworks to static", () => {
  assert.equal(runtimeForFramework("static"), "static");
  assert.equal(runtimeForFramework("react"), "framework");
  assert.equal(runtimeForFramework("tanstack-start"), "framework");
});

test("isStaticProject detects imported dependency-free HTML projects", () => {
  assert.equal(isStaticProject("react", [{ path: "index.html" }, { path: "styles.css" }]), true);
  assert.equal(isStaticProject("react", [{ path: "index.html" }, { path: "package.json" }]), false);
});

test("persisted runtime wins over legacy framework and file inference", () => {
  assert.equal(resolveProjectRuntime("static", "react", [{ path: "package.json" }]), "static");
  assert.equal(resolveProjectRuntime("framework", "static", [{ path: "index.html" }]), "framework");
  assert.equal(resolveProjectRuntime(null, "static", [{ path: "index.html" }]), "static");
});
