import assert from "node:assert/strict";
import test from "node:test";
import { selectPreviewEngine } from "../../components/editor/use-preview-engine-policy.ts";
import { validateGenerationStage } from "../ai/chat/validation-service.ts";
import {
  CORE_LOOP_API_SURFACE,
  isCoreLoopApiRequest,
} from "../reliability/core-loop-api-surface.ts";
import { getCoreLoopPolicy } from "../reliability/core-loop-policy.ts";
import { selectSandboxProvider } from "../sandbox/provider-policy.ts";

test("release-proof sandbox selection cannot fall back from Docker", () => {
  assert.equal(
    selectSandboxProvider({
      coreLoop: true,
      requested: "modal",
      dockerEnabled: false,
      modalEnabled: true,
      e2bEnabled: true,
      e2bAllowed: true,
    }),
    "docker",
  );
});

test("operator selection outside the core loop remains explicit", () => {
  const base = {
    coreLoop: false,
    dockerEnabled: true,
    modalEnabled: true,
    e2bEnabled: true,
    e2bAllowed: true,
  };
  assert.equal(selectSandboxProvider({ ...base, requested: "docker" }), "docker");
  assert.equal(selectSandboxProvider({ ...base, requested: "modal" }), "modal");
  assert.equal(selectSandboxProvider({ ...base, requested: "e2b" }), "e2b");
});

test("WebContainer is one explicit fallback and never outranks the sandbox", () => {
  const base = {
    hasFiles: true,
    staticRuntime: false,
    webContainerEnabled: true,
  };
  assert.equal(
    selectPreviewEngine({
      ...base,
      sandboxEnabled: true,
      explicitWebContainerFallback: true,
    }),
    "sandbox",
  );
  assert.equal(
    selectPreviewEngine({
      ...base,
      sandboxEnabled: false,
      explicitWebContainerFallback: false,
    }),
    "unavailable",
  );
  assert.equal(
    selectPreviewEngine({
      ...base,
      sandboxEnabled: false,
      explicitWebContainerFallback: true,
    }),
    "webcontainer",
  );
});

test("the core loop can call only its narrow method/path surface", () => {
  for (const endpoint of CORE_LOOP_API_SURFACE) {
    assert.equal(
      isCoreLoopApiRequest(endpoint.method, endpoint.path.replace(":projectId", "project-123")),
      true,
      `expected ${endpoint.method} ${endpoint.path} to be allowed`,
    );
  }

  assert.equal(isCoreLoopApiRequest("GET", "/api/projects"), false);
  assert.equal(isCoreLoopApiRequest("POST", "/api/agent"), false);
  assert.equal(
    isCoreLoopApiRequest("GET", "/api/projects/project-123/sandbox-preview/logs"),
    false,
  );
  assert.equal(
    isCoreLoopApiRequest("POST", "/api/projects/project-123/security-scan"),
    false,
  );
});

test("the published core-loop policy matches the behavioral contract", () => {
  const policy = getCoreLoopPolicy({});
  assert.equal(policy.contractVersion, 2);
  assert.equal(policy.sandboxProvider, "docker");
  assert.equal(policy.browserFallback, "webcontainer");
  assert.equal(policy.previewStrategy, "server-verified");
  assert.deepEqual(
    policy.apiSurface,
    CORE_LOOP_API_SURFACE.map((endpoint) => `${endpoint.method} ${endpoint.path}`),
  );
});

test("generation validation exposes correctness failures to the repair stage", () => {
  const candidate = [
    {
      path: "src/App.tsx",
      language: "typescriptreact",
      content:
        "import React from 'react';\nexport default function App() { const [n] = useState(0); return <div>{n}</div>; }",
    },
  ];
  const existing = [
    { path: "index.html", language: "html", content: "<div id=\"root\"></div>" },
    { path: "vite.config.ts", language: "typescript", content: "export default {}" },
    { path: "tsconfig.json", language: "json", content: "{}" },
    {
      path: "package.json",
      language: "json",
      content: JSON.stringify({
        scripts: { dev: "vite" },
        dependencies: { react: "latest", "react-dom": "latest", vite: "latest" },
      }),
    },
    { path: "src/main.tsx", language: "typescriptreact", content: "import './App';" },
  ];

  const result = validateGenerationStage(candidate, existing, { minFiles: 1 });
  assert.ok(
    result.correctnessErrors.some(
      (error) => error.type === "missing_react_hook_import",
    ),
  );
  assert.equal(
    result.validationErrors.length,
    result.correctnessErrors.length + result.richnessErrors.length,
  );
});

test("a live sandbox outranks the static srcdoc renderer", () => {
  // Regression: static won outright, so a vanilla HTML app rendered in the
  // srcdoc iframe even while its own sandbox was live. That iframe has no
  // allow-same-origin (correctly — srcdoc inherits the embedder's origin), so
  // its opaque origin makes localStorage throw and the LifemarkData SDK
  // silently reads back nothing: the editor showed an empty app that persisted
  // nothing while the preview subdomain showed the same app fully populated.
  const staticProject = {
    hasFiles: true,
    staticRuntime: true,
    webContainerEnabled: false,
    explicitWebContainerFallback: false,
  };
  assert.equal(
    selectPreviewEngine({ ...staticProject, sandboxEnabled: true }),
    "sandbox",
    "a static project must use the real-origin sandbox when one is available",
  );
  // …but with no sandbox, srcdoc is still the right (and only) renderer.
  assert.equal(
    selectPreviewEngine({ ...staticProject, sandboxEnabled: false }),
    "static",
  );
  // An empty project never renders anything, sandbox or not.
  assert.equal(
    selectPreviewEngine({ ...staticProject, hasFiles: false, sandboxEnabled: true }),
    "unavailable",
  );
  // WebContainer stays strictly behind the sandbox for static projects too.
  assert.equal(
    selectPreviewEngine({
      ...staticProject,
      sandboxEnabled: false,
      webContainerEnabled: true,
      explicitWebContainerFallback: true,
    }),
    "static",
    "static rendering beats the WebContainer fallback when no sandbox exists",
  );
});
