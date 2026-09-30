import assert from "node:assert/strict";
import test from "node:test";

import {
  CONNECTOR_REGISTRY,
  connectorAllowsMethod,
  resolveConnectorBaseUrl,
} from "./connector-registry";

const TOKEN_ENV = {
  GOOGLE_BUSINESS_PROFILE_ACCESS_TOKEN: "test-token",
};

const EXPECTED_BASE_URLS: Record<string, string> = {
  google_business_profile: "https://mybusinessaccountmanagement.googleapis.com/v1",
  google_business_information: "https://mybusinessbusinessinformation.googleapis.com/v1",
  google_business_engagement: "https://mybusiness.googleapis.com/v4",
  google_business_performance: "https://businessprofileperformance.googleapis.com/v1",
};

test("Google Business Profile surfaces remain pinned to approved Google hosts", () => {
  for (const [id, expectedBaseUrl] of Object.entries(EXPECTED_BASE_URLS)) {
    const spec = CONNECTOR_REGISTRY[id];
    assert.ok(spec, `missing connector registry entry: ${id}`);
    assert.deepEqual(spec.requiredEnv, ["GOOGLE_BUSINESS_PROFILE_ACCESS_TOKEN"]);
    assert.deepEqual(spec.allowedMethods, ["GET"]);
    assert.equal(resolveConnectorBaseUrl(spec, TOKEN_ENV), expectedBaseUrl);
    assert.deepEqual(spec.headers(TOKEN_ENV), {
      Authorization: "Bearer test-token",
    });
  }
});

test("Google Business Profile surfaces are read-only until approval and audit writes ship", () => {
  for (const id of Object.keys(EXPECTED_BASE_URLS)) {
    const spec = CONNECTOR_REGISTRY[id];
    assert.equal(connectorAllowsMethod(spec, "GET"), true);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      assert.equal(connectorAllowsMethod(spec, method), false, `${id} unexpectedly permits ${method}`);
    }
  }
});

test("Google Business Profile registry does not allow caller-selected hosts", () => {
  for (const id of Object.keys(EXPECTED_BASE_URLS)) {
    const spec = CONNECTOR_REGISTRY[id];
    assert.equal(typeof spec.baseUrl, "string");
    assert.match(resolveConnectorBaseUrl(spec, TOKEN_ENV), /^https:\/\/[a-z0-9.-]+\.googleapis\.com\//);
  }
});
