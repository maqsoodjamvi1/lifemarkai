/**
 * Tests for the Strategy 6 fence extraction in parseAIResponse.
 *
 *   node --test lib/ai/code-parser.test.ts
 *
 * These pin the actual response shapes we've seen models emit so the
 * "preview is blank because Strategy 6 missed the path label" bug stays
 * fixed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAIResponse } from "./code-parser.ts";

test("extracts files from backtick-labeled prose+fence response (Lovable style)", () => {
  // Exact shape the user pasted when reporting the bug:
  //   `src/Login.tsx`
  //
  //   ```tsx
  //   ...code...
  //   ```
  const raw = [
    "Let's create a fully functional login page.",
    "",
    "`src/Login.tsx`",
    "",
    "```tsx",
    "import React from 'react';",
    "import { useForm } from 'react-hook-form';",
    "export default function Login() { return <form />; }",
    "```",
    "",
    "Update `App.tsx` to use it:",
    "",
    "`src/App.tsx`",
    "",
    "```tsx",
    "import React from 'react';",
    "import Login from './Login';",
    "export default function App() { return <Login />; }",
    "```",
  ].join("\n");

  const parsed = parseAIResponse(raw);
  assert.equal(parsed.files.length, 2, "should extract 2 files");
  const paths = parsed.files.map((f) => f.path).sort();
  assert.deepEqual(paths, ["src/App.tsx", "src/Login.tsx"]);

  const login = parsed.files.find((f) => f.path === "src/Login.tsx")!;
  assert.ok(login.content.includes("useForm"));
  assert.equal(login.language, "typescriptreact");
});

test("extracts files from // comment-labeled fences", () => {
  const raw = [
    "Here are the files:",
    "",
    "```tsx",
    "// src/App.tsx",
    "import React from 'react';",
    "export default function App() { return <div />; }",
    "```",
  ].join("\n");

  const parsed = parseAIResponse(raw);
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0].path, "src/App.tsx");
  // The leading `// src/App.tsx` line should be stripped from content
  assert.ok(!parsed.files[0].content.startsWith("// src/App.tsx"));
});

test("extracts files from **bold**-labeled fences", () => {
  const raw = [
    "**src/Counter.tsx**",
    "",
    "```tsx",
    "import React, { useState } from 'react';",
    "export default function Counter() { return <button>0</button>; }",
    "```",
  ].join("\n");

  const parsed = parseAIResponse(raw);
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0].path, "src/Counter.tsx");
});

test("extracts files from bare-filename label on its own line", () => {
  const raw = [
    "src/Profile.tsx",
    "",
    "```tsx",
    "import React from 'react';",
    "export default function Profile() { return <div />; }",
    "```",
  ].join("\n");

  const parsed = parseAIResponse(raw);
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0].path, "src/Profile.tsx");
});

test("derives file name from language tag when no label present", () => {
  const raw = [
    "```tsx",
    "import React from 'react';",
    "export default function Anonymous() { return <div />; }",
    "```",
  ].join("\n");

  const parsed = parseAIResponse(raw);
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0].path, "src/file1.tsx");
});

test("falls back to plain message when only short snippets exist", () => {
  // < 3 lines per fence — should NOT be extracted as files
  const raw = [
    "Here's a quick snippet: `const x = 1;`",
    "",
    "```js",
    "x++",
    "```",
  ].join("\n");

  const parsed = parseAIResponse(raw);
  assert.equal(parsed.files.length, 0);
  assert.equal(parsed.message, raw);
});

test("clean JSON response still works (Strategy 1)", () => {
  const raw = JSON.stringify({
    files: [
      { path: "src/App.tsx", content: "export default function App() { return <div />; }", language: "typescript" },
    ],
  });
  const parsed = parseAIResponse(raw);
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0].path, "src/App.tsx");
});

test("```json fence still works (Strategy 2)", () => {
  const raw = [
    "Here's the result:",
    "",
    "```json",
    JSON.stringify({ files: [{ path: "x.ts", content: "export {};", language: "typescript" }] }),
    "```",
  ].join("\n");
  const parsed = parseAIResponse(raw);
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0].path, "x.ts");
});
