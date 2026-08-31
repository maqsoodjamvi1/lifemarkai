import assert from "node:assert/strict";
import test from "node:test";
import { expandDependencyPaths } from "./dependency-context.ts";

const files = [
  {
    path: "src/components/CustomerTable.tsx",
    content: 'import { customers } from "@/lib/customer-store"; export function CustomerTable() { return customers.length; }',
  },
  {
    path: "src/lib/customer-store.ts",
    content: 'import type { Customer } from "../types/customer"; export const customers: Customer[] = [];',
  },
  { path: "src/types/customer.ts", content: "export interface Customer { id: string }" },
  {
    path: "src/routes/customers.tsx",
    content: 'import { CustomerTable } from "../components/CustomerTable"; export default CustomerTable;',
  },
  { path: "src/routes/settings.tsx", content: "export default function Settings() { return null; }" },
];

test("dependency expansion includes imports, transitive types, and direct consumers", () => {
  assert.deepEqual(expandDependencyPaths(["src/components/CustomerTable.tsx"], files), [
    "src/components/CustomerTable.tsx",
    "src/lib/customer-store.ts",
    "src/types/customer.ts",
    "src/routes/customers.tsx",
  ]);
});

test("dependency expansion resolves Windows paths and remains deduplicated", () => {
  const selected = expandDependencyPaths([
    "src\\components\\CustomerTable.tsx",
    "src/lib/customer-store.ts",
  ], files);
  assert.equal(selected.filter((path) => path === "src/lib/customer-store.ts").length, 1);
  assert.ok(!selected.includes("src/routes/settings.tsx"));
});
