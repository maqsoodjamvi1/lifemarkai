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
import { assessGenerationQuality, parseAIResponse, validateGeneratedFiles } from "./code-parser.ts";

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
  const errors = validateGeneratedFiles([
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
  ], [
    { path: "index.html", language: "html", content: "" },
    { path: "vite.config.ts", language: "typescript", content: "" },
    { path: "tsconfig.json", language: "json", content: "{}" },
    { path: "package.json", language: "json", content: "{}" },
    { path: "src/main.tsx", language: "typescriptreact", content: "" },
  ]);

  assert.ok(errors.some((e) => e.type === "missing_named_export"));
});

test("validateGeneratedFiles catches alias default export mismatches", () => {
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

  assert.ok(errors.some((e) => e.type === "missing_default_export"));
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
