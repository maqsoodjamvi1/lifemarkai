/**
 * Tests for the prose-fence extraction strategy in parseAIResponse
 * (extractFencesAsFiles — Strategy 7 since the <file_update> strategy was
 * inserted ahead of it; referred to here by name, not number, so renumbering
 * cannot make this comment lie again).
 *
 *   node --test lib/ai/code-parser.test.ts
 *
 * These pin the actual response shapes we've seen models emit so the
 * "preview is blank because fence salvage missed the path label" bug stays
 * fixed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { assessGenerationQuality,parseAIResponse,validateGeneratedFiles } from "./code-parser.ts";
import { ensureCommonGeneratedSupportFiles } from "./generated-support-files.ts";

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

test("reports, rather than invents, a path when a fence has no label", () => {
  const raw = [
    "```tsx",
    "import React from 'react';",
    "export default function Anonymous() { return <div />; }",
    "```",
  ].join("\n");

  const parsed = parseAIResponse(raw);

  // This test previously asserted `src/file1.tsx` — it pinned the counter
  // fallback as intended behaviour. It was not: nothing imports src/file1.tsx, so
  // the user's request went unfulfilled while the build reported success WITH
  // files. Zero files is the honest answer, and it is a state the callers already
  // handle by re-asking the model for the required format.
  assert.equal(parsed.files.length, 0);
  assert.equal(parsed.unlabelledFences, 1);
  assert.ok(
    !JSON.stringify(parsed.files).includes("src/file"),
    "must never invent a src/fileN path",
  );
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

test("validateGeneratedFiles catches missing React hook imports", () => {
  const errors = validateGeneratedFiles([
    {
      path: "src/App.tsx",
      language: "typescriptreact",
      content: "import React from 'react';\nexport default function App() { const [n] = useState(0); return <div>{n}</div>; }",
    },
  ], [
    { path: "index.html", language: "html", content: "" },
    { path: "vite.config.ts", language: "typescript", content: "" },
    { path: "tsconfig.json", language: "json", content: "{}" },
    { path: "package.json", language: "json", content: "{}" },
    { path: "src/main.tsx", language: "typescriptreact", content: "" },
  ]);

  assert.ok(errors.some((e) => e.type === "missing_react_hook_import"));
});

test("validateGeneratedFiles resolves @ alias imports against src files", () => {
  const errors = validateGeneratedFiles([
    {
      path: "src/App.tsx",
      language: "typescriptreact",
      content: "import { Button } from '@/components/ui/Button';\nexport default function App() { return <Button />; }",
    },
    {
      path: "src/components/ui/Button.tsx",
      language: "typescriptreact",
      content: "export function Button() { return <button />; }",
    },
  ], [
    { path: "index.html", language: "html", content: "" },
    { path: "vite.config.ts", language: "typescript", content: "" },
    { path: "tsconfig.json", language: "json", content: "{}" },
    { path: "package.json", language: "json", content: "{}" },
    { path: "src/main.tsx", language: "typescriptreact", content: "" },
  ]);

  assert.ok(!errors.some((e) => e.type === "broken_alias_import" || e.type === "missing_package"));
});

test("ensureCommonGeneratedSupportFiles creates missing UI kit and type files", () => {
  const files = ensureCommonGeneratedSupportFiles([
    {
      path: "src/App.tsx",
      language: "typescriptreact",
      content: [
        "import { Card, CardContent } from 'src/components/ui/Card';",
        "import { Button } from 'src/components/ui/Button';",
        "import { Badge } from 'src/components/ui/Badge';",
        "import type { Product, CartItem } from 'src/lib/types';",
        "const product: Product = { name: 'Desk' };",
        "const cartItem: CartItem = { product };",
        "export default function App() {",
        "  return <Card><CardContent><Badge>New</Badge><Button>{String(Boolean(cartItem))}</Button></CardContent></Card>;",
        "}",
      ].join("\n"),
    },
  ]);

  const paths = new Set(files.map((file) => file.path));
  assert.ok(paths.has("src/components/ui/Card.tsx"));
  assert.ok(paths.has("src/components/ui/Button.tsx"));
  assert.ok(paths.has("src/components/ui/Badge.tsx"));
  assert.ok(paths.has("src/lib/types.ts"));

  const errors = validateGeneratedFiles(files, [
    { path: "index.html", language: "html", content: "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"></script>" },
    { path: "vite.config.ts", language: "typescript", content: "" },
    { path: "tsconfig.json", language: "json", content: "{}" },
    { path: "package.json", language: "json", content: "{\"scripts\":{\"dev\":\"vite\"},\"dependencies\":{\"@vitejs/plugin-react\":\"latest\",\"vite\":\"latest\",\"react\":\"latest\",\"react-dom\":\"latest\"}}" },
    { path: "src/main.tsx", language: "typescriptreact", content: "import App from './App'; export default App;" },
  ]);

  assert.ok(!errors.some((e) => e.type === "missing_package" || e.type === "broken_import" || e.type === "missing_named_export"), JSON.stringify(errors));
});

test("ensureCommonGeneratedSupportFiles repairs missing pages, utilities, data, and type exports", () => {
  const files = [
    {
      path: "src/App.tsx",
      language: "typescriptreact",
      content: [
        "import Navbar from './components/layout/Navbar';",
        "import Portfolio from './pages/Portfolio';",
        "import BlogPost from './pages/BlogPost';",
        "export default function App() { return <><Navbar /><Portfolio /><BlogPost /></>; }",
      ].join("\n"),
    },
    {
      path: "src/components/home/PartnersSection.tsx",
      language: "typescriptreact",
      content: "import { MOCK_PARTNERS } from '../../data/mock';\nexport function PartnersSection(){ return <>{MOCK_PARTNERS.map((p) => <span key={p.id}>{p.name}</span>)}</>; }",
    },
    {
      path: "src/components/home/FeaturedJournal.tsx",
      language: "typescriptreact",
      content: "import { formatDateShort } from '../../lib/utils';\nexport function FeaturedJournal(){ return <span>{formatDateShort(new Date())}</span>; }",
    },
    {
      path: "src/data/mock.ts",
      language: "typescript",
      content: "import { Service, PortfolioItem, TeamMember, BlogPost, Testimonial, Stat } from '../lib/types';\nexport const MOCK_SERVICES = [];",
    },
  ];
  const existing = [
    { path: "index.html", language: "html", content: "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"></script>" },
    { path: "vite.config.ts", language: "typescript", content: "" },
    { path: "tsconfig.json", language: "json", content: "{}" },
    { path: "package.json", language: "json", content: "{\"scripts\":{\"dev\":\"vite\"},\"dependencies\":{\"@vitejs/plugin-react\":\"latest\",\"vite\":\"latest\",\"react\":\"latest\",\"react-dom\":\"latest\"}}" },
    { path: "src/main.tsx", language: "typescriptreact", content: "import App from './App'; export default App;" },
    { path: "src/lib/types.ts", language: "typescript", content: "export type EntityRecord = Record<string, unknown>;" },
    { path: "src/lib/utils.ts", language: "typescript", content: "export function cn(...values) { return values.filter(Boolean).join(' '); }" },
  ];

  const repaired = ensureCommonGeneratedSupportFiles(files, existing);
  const byPath = new Map(repaired.map((file) => [file.path, file.content]));
  assert.ok(byPath.has("src/components/layout/Navbar.tsx"));
  assert.ok(byPath.has("src/pages/Portfolio.tsx"));
  assert.ok(byPath.has("src/pages/BlogPost.tsx"));
  assert.match(byPath.get("src/data/mock.ts") ?? "", /export const MOCK_PARTNERS/);
  assert.match(byPath.get("src/lib/utils.ts") ?? "", /formatDateShort/);
  assert.match(byPath.get("src/lib/types.ts") ?? "", /export type Service/);
  assert.match(byPath.get("src/lib/types.ts") ?? "", /export const BlogPost/);

  const errors = validateGeneratedFiles(repaired, existing);
  assert.ok(!errors.some((e) => e.type === "broken_import" || e.type === "missing_named_export" || e.type === "missing_default_export"), JSON.stringify(errors));
});

test("ensureCommonGeneratedSupportFiles normalizes model default imports from the shared types module", () => {
  const repaired = ensureCommonGeneratedSupportFiles([
    {
      path: "src/routes/products.tsx",
      language: "typescriptreact",
      content: "import Product from '../lib/types';\nexport function Products({ item }: { item: Product }) { return <div>{item.name}</div>; }",
    },
    {
      path: "src/routes/testimonials.tsx",
      language: "typescriptreact",
      content: "import Testimonial from '../lib/types';\nexport function Testimonials({ item }: { item: Testimonial }) { return <div>{item.name}</div>; }",
    },
    {
      path: "src/lib/types.ts",
      language: "typescript",
      content: "export type Existing = { id: string };",
    },
  ]);
  const byPath = new Map(repaired.map((file) => [file.path, file.content]));

  assert.match(byPath.get("src/routes/products.tsx") ?? "", /import type \{ Product \} from '..\/lib\/types'/);
  assert.match(byPath.get("src/routes/testimonials.tsx") ?? "", /import type \{ Testimonial \} from '..\/lib\/types'/);
  assert.match(byPath.get("src/lib/types.ts") ?? "", /export type Product/);
  assert.match(byPath.get("src/lib/types.ts") ?? "", /export type Testimonial/);
  assert.match(byPath.get("src/lib/types.ts") ?? "", /export default lifemarkGeneratedTypes;/);
});

test("ensureCommonGeneratedSupportFiles adds a requested default export to an existing types module", () => {
  const files = ensureCommonGeneratedSupportFiles([
    {
      path: "src/App.tsx",
      content: 'import Types from "@/lib/types";\nexport default function App() { return <div>{String(Types)}</div>; }',
      language: "typescriptreact",
    },
    {
      path: "src/lib/types.ts",
      content: "export type Customer = { id: string };",
      language: "typescript",
    },
  ]);
  const types = files.find((file) => file.path === "src/lib/types.ts")?.content ?? "";

  assert.match(types, /export default lifemarkGeneratedTypes;/);
});

test("ensureCommonGeneratedSupportFiles repairs dangling data exports and JSX file extensions", () => {
  const repaired = ensureCommonGeneratedSupportFiles([
    {
      path: "src/App.tsx",
      language: "typescriptreact",
      content: [
        "import { getProducts, getTestimonials, getBlogPosts, getGalleryItems, submitContact, subscribeNewsletter, getFAQ } from './lib/data-source';",
        "export default function App() { return <main>{String(Boolean(getProducts && getTestimonials && getBlogPosts && getGalleryItems && submitContact && subscribeNewsletter && getFAQ))}</main>; }",
      ].join("\n"),
    },
    {
      path: "src/lib/data-source.ts",
      language: "typescript",
      content: "function FallbackView() { return null; }\nconst fallbackView = <FallbackView />;\nexport { getProducts, getTestimonials, getBlogPosts, getGalleryItems, submitContact, subscribeNewsletter, getFAQ };\nexport { fallbackView };",
    },
  ]);
  const dataFile = repaired.find((file) => file.path === "src/lib/data-source.tsx");

  assert.ok(dataFile, "JSX-bearing TypeScript support modules must be renamed to .tsx");
  assert.equal(dataFile.language, "typescriptreact");
  assert.match(dataFile.content, /export async function getProducts/);
  assert.match(dataFile.content, /export async function getFAQ/);
  assert.match(dataFile.content, /export async function subscribeNewsletter/);
  assert.doesNotMatch(dataFile.content, /export \{ getProducts,/);

  const errors = validateGeneratedFiles(repaired, [
    { path: "index.html", language: "html", content: "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"></script>" },
    { path: "vite.config.ts", language: "typescript", content: "export default {};" },
    { path: "tsconfig.json", language: "json", content: "{}" },
    { path: "package.json", language: "json", content: JSON.stringify({ scripts: { dev: "vite" }, dependencies: { react: "^18", "react-dom": "^18", vite: "^5", "@vitejs/plugin-react": "^4" } }) },
    { path: "src/main.tsx", language: "typescriptreact", content: "import { createRoot } from 'react-dom/client'; import App from './App'; createRoot(document.getElementById('root')!).render(<App />);" },
  ]);
  assert.ok(!errors.some((error) => error.type === "jsx_in_ts_file" || error.type === "missing_named_export"), JSON.stringify(errors));
});

test("validateGeneratedFiles catches duplicate top-level declarations", () => {
  const errors = validateGeneratedFiles([
    {
      path: "src/App.tsx",
      language: "typescriptreact",
      content: [
        "const ITEMS = [];",
        "const ITEMS = [];",
        "export default function App() {",
        "  const value = 1;",
        "  return <div>{value}</div>;",
        "}",
      ].join("\n"),
    },
  ], [
    { path: "index.html", language: "html", content: "" },
    { path: "vite.config.ts", language: "typescript", content: "" },
    { path: "tsconfig.json", language: "json", content: "{}" },
    { path: "package.json", language: "json", content: "{}" },
    { path: "src/main.tsx", language: "typescriptreact", content: "" },
  ]);

  assert.ok(errors.some((e) => e.type === "duplicate_declaration"));
});

test("validateGeneratedFiles catches local named export mismatches", () => {
  // validateGeneratedFiles auto-repairs via ensureCommonGeneratedSupportFiles,
  // so a default-only Button imported as { Button } gets `export { default as Button }`
  // and should no longer report missing_named_export after repair.
  const files = [
    {
      path: "src/App.tsx",
      language: "typescriptreact",
      content: "import { Button } from './Button';\nexport default function App() { return <Button />; }",
    },
    {
      path: "src/Button.tsx",
      language: "typescriptreact",
      content: "export default function Button() { return <button />; }",
    },
  ];
  const existing = [
    { path: "index.html", language: "html", content: "" },
    { path: "vite.config.ts", language: "typescript", content: "" },
    { path: "tsconfig.json", language: "json", content: "{}" },
    { path: "package.json", language: "json", content: "{}" },
    { path: "src/main.tsx", language: "typescriptreact", content: "" },
  ];
  const errors = validateGeneratedFiles(files, existing);
  assert.ok(!errors.some((e) => e.type === "missing_named_export"), JSON.stringify(errors));
});

test("validateGeneratedFiles catches alias default export mismatches", () => {
  // Same auto-repair: named-only Button imported as default gets `export default Button`.
  const errors = validateGeneratedFiles([
    {
      path: "src/App.tsx",
      language: "typescriptreact",
      content: "import Button from '@/components/Button';\nexport default function App() { return <Button />; }",
    },
    {
      path: "src/components/Button.tsx",
      language: "typescriptreact",
      content: "export function Button() { return <button />; }",
    },
  ], [
    { path: "index.html", language: "html", content: "" },
    { path: "vite.config.ts", language: "typescript", content: "" },
    { path: "tsconfig.json", language: "json", content: "{}" },
    { path: "package.json", language: "json", content: "{}" },
    { path: "src/main.tsx", language: "typescriptreact", content: "" },
  ]);

  assert.ok(!errors.some((e) => e.type === "missing_default_export"), JSON.stringify(errors));
});

test("validateGeneratedFiles uses existing package.json during incremental edits", () => {
  const errors = validateGeneratedFiles([
    {
      path: "src/App.tsx",
      language: "typescriptreact",
      content: "import { motion } from 'framer-motion';\nexport default function App() { return <motion.div />; }",
    },
  ], [
    {
      path: "package.json",
      language: "json",
      content: JSON.stringify({ dependencies: { "framer-motion": "^11.0.0" } }),
    },
    { path: "index.html", language: "html", content: "" },
    { path: "vite.config.ts", language: "typescript", content: "" },
    { path: "tsconfig.json", language: "json", content: "{}" },
    { path: "src/main.tsx", language: "typescriptreact", content: "" },
  ]);

  assert.ok(!errors.some((e) => e.type === "missing_package"));
});

test("validateGeneratedFiles catches missing router provider", () => {
  const errors = validateGeneratedFiles([
    {
      path: "src/main.tsx",
      language: "typescriptreact",
      content: "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.getElementById('root')!).render(<App />);",
    },
    {
      path: "src/App.tsx",
      language: "typescriptreact",
      content: "import { Routes, Route, Link } from 'react-router-dom';\nexport default function App() { return <><Link to=\"/\">Home</Link><Routes><Route path=\"/\" element={<div />} /></Routes></>; }",
    },
  ], [
    { path: "index.html", language: "html", content: "" },
    { path: "vite.config.ts", language: "typescript", content: "" },
    { path: "tsconfig.json", language: "json", content: "{}" },
    { path: "package.json", language: "json", content: JSON.stringify({ scripts: { dev: "vite" }, dependencies: { "react-router-dom": "^6.26.1" } }) },
  ]);

  assert.ok(errors.some((e) => e.type === "missing_router_provider"));
});

test("validateGeneratedFiles accepts router provider in main entry", () => {
  const errors = validateGeneratedFiles([
    {
      path: "src/main.tsx",
      language: "typescriptreact",
      content: "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { BrowserRouter } from 'react-router-dom';\nimport App from './App';\ncreateRoot(document.getElementById('root')!).render(<BrowserRouter><App /></BrowserRouter>);",
    },
    {
      path: "src/App.tsx",
      language: "typescriptreact",
      content: "import { Routes, Route, Link } from 'react-router-dom';\nexport default function App() { return <><Link to=\"/\">Home</Link><Routes><Route path=\"/\" element={<div />} /></Routes></>; }",
    },
  ], [
    { path: "index.html", language: "html", content: "" },
    { path: "vite.config.ts", language: "typescript", content: "" },
    { path: "tsconfig.json", language: "json", content: "{}" },
    { path: "package.json", language: "json", content: JSON.stringify({ scripts: { dev: "vite" }, dependencies: { "react-router-dom": "^6.26.1" } }) },
  ]);

  assert.ok(!errors.some((e) => e.type === "missing_router_provider"));
});

test("validateGeneratedFiles requires dev script for new projects", () => {
  const errors = validateGeneratedFiles([
    { path: "index.html", language: "html", content: "<div id=\"root\"></div>" },
    { path: "vite.config.ts", language: "typescript", content: "export default {};" },
    { path: "tsconfig.json", language: "json", content: "{}" },
    { path: "package.json", language: "json", content: JSON.stringify({ dependencies: { react: "^18" } }) },
    { path: "src/main.tsx", language: "typescriptreact", content: "import App from './App';" },
    { path: "src/App.tsx", language: "typescriptreact", content: "export default function App() { return <div />; }" },
  ]);

  assert.ok(errors.some((e) => e.type === "missing_dev_script"));
});

test("validateGeneratedFiles catches missing root mount node", () => {
  const errors = validateGeneratedFiles([
    { path: "index.html", language: "html", content: "<html><body><div id=\"app\"></div><script type=\"module\" src=\"/src/main.tsx\"></script></body></html>" },
    { path: "vite.config.ts", language: "typescript", content: "export default {};" },
    { path: "tsconfig.json", language: "json", content: "{}" },
    { path: "package.json", language: "json", content: JSON.stringify({ scripts: { dev: "vite" }, dependencies: { react: "^18", "react-dom": "^18" } }) },
    { path: "src/main.tsx", language: "typescriptreact", content: "import { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.getElementById('root')!).render(<App />);" },
    { path: "src/App.tsx", language: "typescriptreact", content: "export default function App() { return <div />; }" },
  ]);

  assert.ok(errors.some((e) => e.type === "missing_root_mount"));
});

test("validateGeneratedFiles catches missing main script", () => {
  const errors = validateGeneratedFiles([
    { path: "index.html", language: "html", content: "<html><body><div id=\"root\"></div></body></html>" },
    { path: "vite.config.ts", language: "typescript", content: "export default {};" },
    { path: "tsconfig.json", language: "json", content: "{}" },
    { path: "package.json", language: "json", content: JSON.stringify({ scripts: { dev: "vite" }, dependencies: { react: "^18", "react-dom": "^18" } }) },
    { path: "src/main.tsx", language: "typescriptreact", content: "import { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.getElementById('root')!).render(<App />);" },
    { path: "src/App.tsx", language: "typescriptreact", content: "export default function App() { return <div />; }" },
  ]);

  assert.ok(errors.some((e) => e.type === "missing_main_script"));
});

test("validateGeneratedFiles catches React entry that never mounts", () => {
  const errors = validateGeneratedFiles([
    { path: "index.html", language: "html", content: "<html><body><div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"></script></body></html>" },
    { path: "vite.config.ts", language: "typescript", content: "export default {};" },
    { path: "tsconfig.json", language: "json", content: "{}" },
    { path: "package.json", language: "json", content: JSON.stringify({ scripts: { dev: "vite" }, dependencies: { react: "^18", "react-dom": "^18" } }) },
    { path: "src/main.tsx", language: "typescriptreact", content: "import { createRoot } from 'react-dom/client';\nimport App from './App';\nconsole.log(App);" },
    { path: "src/App.tsx", language: "typescriptreact", content: "export default function App() { return <div />; }" },
  ]);

  assert.ok(errors.some((e) => e.type === "missing_react_mount"));
});

test("validateGeneratedFiles catches invalid tsconfig shape", () => {
  const errors = validateGeneratedFiles([
    { path: "index.html", language: "html", content: "<html><body><div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"></script></body></html>" },
    { path: "vite.config.ts", language: "typescript", content: "export default {};" },
    { path: "tsconfig.json", language: "json", content: JSON.stringify({ compilerOptions: [] }) },
    { path: "package.json", language: "json", content: JSON.stringify({ scripts: { dev: "vite" }, dependencies: { react: "^18", "react-dom": "^18" } }) },
    { path: "src/main.tsx", language: "typescriptreact", content: "import { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.getElementById('root')!).render(<App />);" },
    { path: "src/App.tsx", language: "typescriptreact", content: "export default function App() { return <div />; }" },
  ]);

  assert.ok(errors.some((e) => e.type === "invalid_tsconfig"));
});

test("assessGenerationQuality rejects thin website without database backing", () => {
  const errors = assessGenerationQuality([
    { path: "src/pages/Home.tsx", language: "typescriptreact", content: "export default function Home() { return <section><h1>Home</h1></section>; }" },
    { path: "src/pages/About.tsx", language: "typescriptreact", content: "export default function About() { return <section>About</section>; }" },
    { path: "src/App.tsx", language: "typescriptreact", content: "export default function App() { return <div />; }" },
  ], [], { appType: "marketing-website", minFiles: 18 });

  assert.ok(errors.some((e) => e.type === "too_few_website_pages"));
  assert.ok(errors.some((e) => e.type === "missing_website_data_backing"));
});

test("assessGenerationQuality grades an explicit landing page as one rich route without mandatory Supabase", () => {
  const errors = assessGenerationQuality([
    { path: "src/routes/__root.tsx", language: "typescriptreact", content: "export function Root() { return <div />; }" },
    {
      path: "src/routes/index.tsx",
      language: "typescriptreact",
      content: "export function Home() { return <><section /><section /><section /><section /><section /><section /></>; }",
    },
    { path: "src/components/layout/Header.tsx", language: "typescriptreact", content: "export function Header() { return <header><nav /></header>; }" },
    { path: "src/components/layout/Footer.tsx", language: "typescriptreact", content: "export function Footer() { return <footer />; }" },
  ], [], { appType: "marketing-website", minFiles: 12, singlePage: true });

  assert.ok(!errors.some((e) => e.type === "too_few_website_pages"), JSON.stringify(errors));
  assert.ok(!errors.some((e) => e.type === "missing_website_data_backing"), JSON.stringify(errors));
  assert.ok(!errors.some((e) => e.type === "too_few_components"), JSON.stringify(errors));
});

test("assessGenerationQuality accepts mature database-backed website structure", () => {
  const files = [
    "Home",
    "Services",
    "About",
    "CaseStudies",
    "Blog",
    "Contact",
  ].map((name) => ({
    path: `src/pages/${name}.tsx`,
    language: "typescriptreact",
    content: "export default function Page() { return <><section /><section /><section /><section /></>; }",
  }));

  const errors = assessGenerationQuality([
    ...files,
    { path: "src/App.tsx", language: "typescriptreact", content: "export default function App() { return <div />; }" },
    { path: "src/components/layout/Header.tsx", language: "typescriptreact", content: "export function Header() { return <header />; }" },
    { path: "src/components/layout/Footer.tsx", language: "typescriptreact", content: "export function Footer() { return <footer />; }" },
    { path: "src/components/LeadForm.tsx", language: "typescriptreact", content: "export function LeadForm() { return <form />; }" },
    { path: "src/lib/supabase.ts", language: "typescript", content: "export const supabase = null;" },
    { path: "src/lib/data-source.ts", language: "typescript", content: "export const fallbackLeads = []; export async function saveLead() { return supabase ?? fallbackLeads; }" },
    { path: "supabase/migrations/001_website_schema.sql", language: "sql", content: "create table leads(id uuid); create table newsletter_subscribers(id uuid);" },
    { path: "src/data/seed.ts", language: "typescript", content: "export const seed = [];" },
    { path: "src/hooks/useLeads.ts", language: "typescript", content: "export function useLeads() { return []; }" },
    { path: "src/components/ui/Button.tsx", language: "typescriptreact", content: "export function Button() { return <button />; }" },
    { path: "src/components/ui/Card.tsx", language: "typescriptreact", content: "export function Card() { return <div />; }" },
    { path: "src/components/Hero.tsx", language: "typescriptreact", content: "export function Hero() { return <section />; }" },
    { path: "src/components/ServiceCard.tsx", language: "typescriptreact", content: "export function ServiceCard() { return <article />; }" },
  ], [], { appType: "marketing-website", minFiles: 18 });

  assert.ok(!errors.some((e) => e.type === "too_few_website_pages" || e.type === "missing_website_data_backing"));
});

test("assessGenerationQuality rejects ecommerce without required schema", () => {
  const pageNames = ["Home", "Shop", "ProductDetail", "Cart", "Checkout", "Orders", "AdminProducts", "AdminOrders"];
  const errors = assessGenerationQuality([
    ...pageNames.map((name) => ({
      path: `src/pages/${name}.tsx`,
      language: "typescriptreact",
      content: "export default function Page() { return <section><div /><div /><div /></section>; }",
    })),
    { path: "src/App.tsx", language: "typescriptreact", content: "export default function App() { return <div />; }" },
    { path: "src/components/ProductCard.tsx", language: "typescriptreact", content: "export function ProductCard() { return <article />; }" },
    { path: "src/components/CartDrawer.tsx", language: "typescriptreact", content: "export function CartDrawer() { return <aside />; }" },
    { path: "src/components/ui/Button.tsx", language: "typescriptreact", content: "export function Button() { return <button />; }" },
    { path: "src/lib/supabase.ts", language: "typescript", content: "export const supabase = null;" },
    { path: "src/lib/store-api.ts", language: "typescript", content: "export const fallbackProducts = []; export async function listProducts() { return supabase ?? fallbackProducts; }" },
    { path: "supabase/migrations/001_ecommerce_schema.sql", language: "sql", content: "create table products(id uuid); create table orders(id uuid);" },
    { path: "src/data/products.ts", language: "typescript", content: "export const products = [];" },
    { path: "src/hooks/useCart.ts", language: "typescript", content: "export function useCart() { return {}; }" },
    { path: "src/components/layout/Header.tsx", language: "typescriptreact", content: "export function Header() { return <header />; }" },
    { path: "src/components/layout/Footer.tsx", language: "typescriptreact", content: "export function Footer() { return <footer />; }" },
    { path: "src/components/ProductFilters.tsx", language: "typescriptreact", content: "export function ProductFilters() { return <aside />; }" },
    { path: "src/components/OrderSummary.tsx", language: "typescriptreact", content: "export function OrderSummary() { return <section />; }" },
    { path: "src/components/AdminTable.tsx", language: "typescriptreact", content: "export function AdminTable() { return <table />; }" },
    { path: "src/lib/money.ts", language: "typescript", content: "export function formatCurrency() { return '$0'; }" },
  ], [], { appType: "ecommerce", minFiles: 22 });

  assert.ok(errors.some((e) => e.type === "missing_ecommerce_data_backing"));
});

test("assessGenerationQuality rejects ERP without operations schema", () => {
  const pageNames = ["Dashboard", "Inventory", "SalesOrders", "Purchasing", "Customers", "Employees", "Reports", "Finance", "AuditLog", "Settings"];
  const errors = assessGenerationQuality([
    ...pageNames.map((name) => ({
      path: `src/pages/${name}.tsx`,
      language: "typescriptreact",
      content: "export default function Page() { return <section><table /><div /><div /></section>; }",
    })),
    { path: "src/App.tsx", language: "typescriptreact", content: "export default function App() { return <div />; }" },
    { path: "src/layouts/AppLayout.tsx", language: "typescriptreact", content: "export function AppLayout() { return <aside />; }" },
    { path: "src/components/DataTable.tsx", language: "typescriptreact", content: "export function DataTable() { return <table />; }" },
    { path: "src/components/ui/Button.tsx", language: "typescriptreact", content: "export function Button() { return <button />; }" },
    { path: "src/lib/supabase.ts", language: "typescript", content: "export const supabase = null;" },
    { path: "src/lib/erp-api.ts", language: "typescript", content: "export const fallbackInventory = []; export async function listInventory() { return supabase ?? fallbackInventory; }" },
    { path: "supabase/migrations/001_erp_schema.sql", language: "sql", content: "create table companies(id uuid); create table products(id uuid); create table customers(id uuid);" },
    { path: "src/data/mock.ts", language: "typescript", content: "export const mock = [];" },
    { path: "src/hooks/useInventory.ts", language: "typescript", content: "export function useInventory() { return []; }" },
    { path: "src/components/KpiCard.tsx", language: "typescriptreact", content: "export function KpiCard() { return <section />; }" },
    { path: "src/components/StatusBadge.tsx", language: "typescriptreact", content: "export function StatusBadge() { return <span />; }" },
    { path: "src/components/CrudDialog.tsx", language: "typescriptreact", content: "export function CrudDialog() { return <div />; }" },
    { path: "src/components/FilterBar.tsx", language: "typescriptreact", content: "export function FilterBar() { return <div />; }" },
  ], [], { appType: "erp", minFiles: 24 });

  assert.ok(errors.some((e) => e.type === "missing_erp_data_backing"));
});


test("validateGeneratedFiles accepts a complete TanStack Start scaffold without Vite entry files", () => {
  const files = [
    {
      path: "package.json",
      language: "json",
      content: JSON.stringify({
        scripts: { dev: "vite dev", build: "vite build" },
        dependencies: {
          "@tanstack/react-start": "^1.168.0",
          "@tanstack/react-router": "^1.170.0",
          "@vitejs/plugin-react": "^4.3.0",
          vite: "^7.0.0",
          react: "^18.3.1",
          "react-dom": "^18.3.1",
        },
      }),
    },
    { path: "tsconfig.json", language: "json", content: "{}" },
    {
      path: "vite.config.ts",
      language: "typescript",
      content: "import { defineConfig } from 'vite'; export default defineConfig({});",
    },
    {
      path: "src/routes/__root.tsx",
      language: "typescriptreact",
      content: "export function RootComponent() { return <html><body /></html>; }",
    },
    {
      path: "src/routes/index.tsx",
      language: "typescriptreact",
      content: "export default function Home() { return <main><h1>Home</h1></main>; }",
    },
  ];

  const errors = validateGeneratedFiles(files);
  const missing = errors
    .filter((error) => error.type === "missing_config")
    .map((error) => error.file);

  assert.deepEqual(missing, []);
  assert.ok(!errors.some((error) => error.file === "index.html"));
  assert.ok(!errors.some((error) => error.file === "src/main.tsx"));
  assert.ok(!errors.some((error) => error.file === "src/App.tsx"));
});

test("validateGeneratedFiles still requires the TanStack home route", () => {
  const files = [
    {
      path: "package.json",
      language: "json",
      content: JSON.stringify({
        dependencies: {
          "@tanstack/react-start": "^1.168.0",
          "@tanstack/react-router": "^1.170.0",
        },
      }),
    },
    { path: "tsconfig.json", language: "json", content: "{}" },
    { path: "vite.config.ts", language: "typescript", content: "export default {};" },
    {
      path: "src/routes/__root.tsx",
      language: "typescriptreact",
      content: "export function RootComponent() { return <html><body /></html>; }",
    },
  ];

  const errors = validateGeneratedFiles(files);
  assert.ok(
    errors.some(
      (error) =>
        error.type === "missing_config" && error.file === "src/routes/index.tsx",
    ),
  );
});

// Regression for a real core-loop failure: a 37-file bakery build was rejected
// as "a heading and a sentence" because its index.tsx was a 690-byte file that
// composed six section components. Three repair rounds were spent fattening a
// file that was already correct.
test("assessGenerationQuality does not call a route sparse when it composes local sections", () => {
  const errors = assessGenerationQuality([
    { path: "src/routes/__root.tsx", language: "typescriptreact", content: "export function Root() { return <div />; }" },
    {
      path: "src/routes/index.tsx",
      language: "typescriptreact",
      content: [
        'import { Hero } from "@/components/sections/Hero";',
        'import { MenuShowcase } from "@/components/sections/MenuShowcase";',
        'import { AboutStory } from "@/components/sections/AboutStory";',
        "export function Home() {",
        "  return <><Hero /><MenuShowcase /><AboutStory /></>;",
        "}",
      ].join("\n"),
    },
  ], [], { appType: "marketing-website", minFiles: 1, singlePage: true });

  assert.ok(!errors.some((e) => e.type === "sparse_main_page"), JSON.stringify(errors));
});

test("assessGenerationQuality still rejects a genuinely empty route", () => {
  const errors = assessGenerationQuality([
    { path: "src/routes/__root.tsx", language: "typescriptreact", content: "export function Root() { return <div />; }" },
    {
      path: "src/routes/index.tsx",
      language: "typescriptreact",
      content: "export function Home() { return <h1>Bakery</h1>; }",
    },
  ], [], { appType: "marketing-website", minFiles: 1, singlePage: true });

  assert.ok(errors.some((e) => e.type === "sparse_main_page"), JSON.stringify(errors));
});

// Imports alone must not satisfy the check, or it becomes a formality.
test("assessGenerationQuality ignores imported utilities that are never rendered", () => {
  const errors = assessGenerationQuality([
    { path: "src/routes/__root.tsx", language: "typescriptreact", content: "export function Root() { return <div />; }" },
    {
      path: "src/routes/index.tsx",
      language: "typescriptreact",
      content: [
        'import { formatDate } from "@/lib/utils";',
        'import type { MenuItem } from "@/data/bakery";',
        'import { Hero } from "@/components/sections/Hero";',
        "export function Home() { return <h1>Bakery</h1>; }",
      ].join("\n"),
    },
  ], [], { appType: "marketing-website", minFiles: 1, singlePage: true });

  assert.ok(errors.some((e) => e.type === "sparse_main_page"), JSON.stringify(errors));
});
