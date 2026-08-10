import { test } from "node:test";
import assert from "node:assert/strict";
import {
frameworkForMobileMode,
initialWebFramework,
isRnFramework,
} from "./mobile-framework.ts";

test("isRnFramework recognizes react-native and legacy expo only", () => {
  assert.equal(isRnFramework("react-native"), true);
  assert.equal(isRnFramework("expo"), true);
  assert.equal(isRnFramework("react"), false);
  assert.equal(isRnFramework("nextjs"), false);
  assert.equal(isRnFramework(null), false);
  assert.equal(isRnFramework(undefined), false);
});

test("initialWebFramework keeps a real web framework", () => {
  assert.equal(initialWebFramework("nextjs"), "nextjs");
  assert.equal(initialWebFramework("vue"), "vue");
  assert.equal(initialWebFramework("tanstack-start"), "tanstack-start");
});

test("initialWebFramework falls back to 'react' for RN and null — never 'web'", () => {
  // Regression: projects_framework_check has never accepted "web"; a project
  // that STARTED in mobile mode must restore to a value Postgres accepts.
  assert.equal(initialWebFramework("react-native"), "react");
  assert.equal(initialWebFramework(null), "react");
  assert.equal(initialWebFramework(undefined), "react");
});

test("frameworkForMobileMode persists RN when on, remembered web framework when off", () => {
  assert.equal(frameworkForMobileMode(true, "nextjs"), "react-native");
  assert.equal(frameworkForMobileMode(false, "nextjs"), "nextjs");
  assert.equal(frameworkForMobileMode(false, "react"), "react");
});
