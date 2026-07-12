import assert from "node:assert/strict";
import { ensureCommonGeneratedSupportFiles } from "../lib/ai/generated-support-files";
import { diagnoseBrokenImports } from "../lib/preview/diagnose-imports";

const files = [
  {
    path: "src/App.tsx",
    language: "typescriptreact",
    content: `import { Shop } from "./pages/Shop";
import ProductList from "./components/ProductList";
export default function App(){ return <><Shop /><ProductList /></>; }`,
  },
  {
    path: "src/pages/Shop.tsx",
    language: "typescriptreact",
    content: `import ProductList from "../components/ProductList";
import { products } from "../data/mock";
export default function Shop(){ return <ProductList items={products} />; }`,
  },
  {
    path: "src/components/ProductList.tsx",
    language: "typescriptreact",
    content: `export function ProductList({ items = [] }){ return <div>{items.length}</div>; }`,
  },
  {
    path: "src/components/CartDrawer.tsx",
    language: "typescriptreact",
    content: `import { formatPrice } from "../lib/utils";
export function CartDrawer(){ return <span>{formatPrice(10)}</span>; }`,
  },
  {
    path: "src/components/ProductCard.tsx",
    language: "typescriptreact",
    content: `import { formatPrice } from "../lib/utils";
export function ProductCard(){ return <span>{formatPrice(20)}</span>; }`,
  },
  {
    path: "src/hooks/useNewsletter.ts",
    language: "typescript",
    content: `import { subscribeNewsletter } from "../lib/supabase";
export function useNewsletter(){ return { subscribe: subscribeNewsletter }; }`,
  },
  {
    path: "src/pages/Checkout.tsx",
    language: "typescriptreact",
    content: `import { useCart } from "../context/CartContext";
export default function Checkout(){ const cart = useCart(); return <div>{cart.count}</div>; }`,
  },
  {
    path: "src/pages/ProductDetail.tsx",
    language: "typescriptreact",
    content: `import { products } from "../data/mock";
export default function ProductDetail(){ return <div>{products[0]?.name}</div>; }`,
  },
  {
    path: "src/lib/utils.ts",
    language: "typescript",
    content: `export function cn(...v){ return v.filter(Boolean).join(" "); }`,
  },
  {
    path: "src/data/mock.ts",
    language: "typescript",
    content: `export const categories = [];`,
  },
  {
    path: "src/lib/supabase.ts",
    language: "typescript",
    content: `export const supabase = {};`,
  },
];

const repaired = ensureCommonGeneratedSupportFiles(files);
const byPath = new Map(repaired.map((f) => [f.path, f.content]));

assert.match(byPath.get("src/lib/utils.ts") ?? "", /formatPrice/);
assert.match(byPath.get("src/data/mock.ts") ?? "", /export const products/);
assert.match(byPath.get("src/lib/supabase.ts") ?? "", /subscribeNewsletter/);
assert.match(byPath.get("src/pages/Shop.tsx") ?? "", /export \{ Shop \}/);
assert.match(byPath.get("src/components/ProductList.tsx") ?? "", /export default ProductList/);
assert.ok(
  (byPath.get("src/context/CartContext.tsx") ?? "").includes("useCart") ||
    (byPath.get("src/context/CartContext.ts") ?? "").includes("useCart"),
  "CartContext useCart missing",
);

const issues = diagnoseBrokenImports(repaired);
const critical = issues.filter(
  (i) =>
    /formatPrice|products|subscribeNewsletter|useCart|ProductList|Shop/.test(i) &&
    /not exported|no default|named export/.test(i),
);
assert.equal(critical.length, 0, critical.join("\n"));
console.log("PASS store export repair");
