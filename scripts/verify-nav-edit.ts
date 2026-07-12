import {
  isMenuNavEditIntent,
  findNavSourceFiles,
  remapInventedNavPatchPaths,
  buildNavEditContext,
  buildDeterministicMenuPatches,
  extractMenuLabelsFromPrompt,
} from "../lib/ai/nav-edit";
import { applyPatches, parsePatchResponse } from "../lib/ai/patch-applier";

const files = [
  {
    path: "src/App.tsx",
    content: `import Header from "./components/Header";\nexport default function App(){ return <Header/> }`,
  },
  {
    path: "src/components/Header.tsx",
    content: `export default function Header(){\n  return (\n    <header>\n      <nav>\n        <a href="/">Home</a>\n        <a href="/shop">Shop</a>\n      </nav>\n    </header>\n  );\n}`,
  },
  {
    path: "src/pages/Home.tsx",
    content: `export default function Home(){ return <div>Home</div> }`,
  },
];

const cases: Array<[string, boolean]> = [
  ["intent: add menu items in header", isMenuNavEditIntent("add menu items in header")],
  ["intent: add About link to navbar", isMenuNavEditIntent("add About link to navbar")],
  ["intent: explain header (false)", !isMenuNavEditIntent("what does the header do?")],
  [
    "find Header.tsx as nav source",
    findNavSourceFiles(files)[0]?.path === "src/components/Header.tsx",
  ],
  [
    "remap invented header.html",
    remapInventedNavPatchPaths(
      [
        {
          path: "header.html",
          find: '<a href="/shop">Shop</a>',
          replace: '<a href="/shop">Shop</a><a href="/about">About</a>',
        },
      ],
      files,
    )[0]?.path === "src/components/Header.tsx",
  ],
];

const remapped = remapInventedNavPatchPaths(
  [
    {
      path: "header.html",
      find: '<a href="/shop">Shop</a>',
      replace: '<a href="/shop">Shop</a>\n        <a href="/about">About</a>',
    },
  ],
  files,
);
const applied = applyPatches(remapped, files);
cases.push([
  "apply remapped menu patch",
  !!applied[0]?.applied && (applied[0]?.content.includes("About") ?? false),
]);

const ctx = buildNavEditContext(files, "add menu items in header");
cases.push(["nav context includes Header.tsx", ctx.includes("src/components/Header.tsx")]);
cases.push(["nav context forbids empty patches", ctx.includes('{"patches":[]}')]);

const labels = extractMenuLabelsFromPrompt("add About and Contact to the header");
cases.push(["extract About+Contact labels", labels.includes("About") && labels.includes("Contact")]);

const det = buildDeterministicMenuPatches("add menu items in header", files);
const detApplied = applyPatches(det, files);
cases.push([
  "deterministic menu patch applies",
  det.length > 0 &&
    !!detApplied[0]?.applied &&
    (detApplied[0]?.content.includes("About") ?? false) &&
    (detApplied[0]?.content.includes("Contact") ?? false),
]);

const named = buildDeterministicMenuPatches("add About link to the header", files);
const namedApplied = applyPatches(named, files);
cases.push([
  "named About deterministic",
  !!namedApplied[0]?.applied && (namedApplied[0]?.content.includes("About") ?? false),
]);

// Store-style Header: brand Link comes first — must clone a <nav> item, not the logo.
const storeHeader = `import { Link } from 'react-router-dom';
export default function Header() {
  return (
    <header>
      <Link to="/" className="flex items-center gap-2">
        <span>🛍️</span>
        <span className="font-bold">E-Shop</span>
      </Link>
      <nav className="hidden sm:flex gap-4">
        <Link to="/" className="text-sm">Home</Link>
        <Link to="/shop" className="text-sm">Shop</Link>
      </nav>
      <Link to="/shop" className="relative">Cart<span>0</span></Link>
    </header>
  );
}`;
const storeFiles = [{ path: "src/components/Header.tsx", content: storeHeader }];
const storeDet = buildDeterministicMenuPatches("add menu items in header", storeFiles);
const storeApplied = applyPatches(storeDet, storeFiles);
const storeNav = storeApplied[0]?.content?.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? "";
cases.push([
  "store header clones nav link not logo",
  !!storeApplied[0]?.applied &&
    storeNav.includes("About") &&
    storeNav.includes("Services") &&
    storeNav.includes("Contact") &&
    !(storeApplied[0]?.content.includes('to="/about"') &&
      /<Link to="\/about"[\s\S]*?🛍️/.test(storeApplied[0]?.content ?? "")),
]);
cases.push([
  "store header keeps brand logo intact",
  !!storeApplied[0]?.content?.includes("E-Shop") &&
    !!storeApplied[0]?.content?.includes("🛍️"),
]);

const layoutHeaderFiles = [
  {
    path: "src/components/Header.tsx",
    content: `export { Header as default } from './layout/Header';
export { Header } from './layout/Header';`,
  },
  {
    path: "src/components/layout/Header.tsx",
    content: `const SHOP_QUICK_LINKS = [{ label: "All Products", href: "/products" }];
const MOCK_CATEGORIES = [{ name: "Accessories", slug: "accessories" }];
export function Header() {
  return (
    <header>
      <nav className="hidden lg:flex items-center gap-6">
        <a href="/">Home</a>
        <a href="/shop">Shop</a>
      </nav>
      <button className="lg:hidden">Menu</button>
    </header>
  );
}`,
  },
];
cases.push([
  "layout header beats re-export wrapper",
  findNavSourceFiles(layoutHeaderFiles)[0]?.path === "src/components/layout/Header.tsx",
]);
const responsivePatches = buildDeterministicMenuPatches(
  "add Quick Shop links and category links for desktop dropdown and mobile menu",
  layoutHeaderFiles,
);
const responsiveApplied = applyPatches(responsivePatches, layoutHeaderFiles);
const responsiveHeader =
  responsiveApplied.filter((r) => r.path === "src/components/layout/Header.tsx").at(-1)?.content ?? "";
cases.push([
  "responsive nav visibility patch applies",
  responsivePatches.length >= 2 &&
    responsiveHeader.includes("hidden md:flex") &&
    responsiveHeader.includes("md:hidden"),
]);
const commerceLabels = extractMenuLabelsFromPrompt("add Quick Shop links and category links to the header");
cases.push([
  "commerce prompt extracts useful default links",
  commerceLabels.includes("All Products") && commerceLabels.includes("Best Sellers"),
]);

const wrapped = parsePatchResponse(
  JSON.stringify({
    patches: [
      {
        path: "src/components/Header.tsx",
        find: '<a href="/shop">Shop</a>',
        replace: '<a href="/shop">Shop</a><a href="/contact">Contact</a>',
      },
    ],
  }),
);
cases.push(["parse patches wrapper", wrapped.length === 1]);

let failed = 0;
for (const [name, ok] of cases) {
  console.log(ok ? "PASS" : "FAIL", name);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
