/**
 * Verify website header contract is enforced across catalog + prompts + built-ins.
 */
import {
  ensureWebsiteHeaderSections,
  WEBSITE_HEADER_CATEGORIES,
  WEBSITE_HEADER_CONTRACT,
  WEBSITE_HEADER_SECTIONS,
} from "../lib/ai/website-header-contract";
import { filterUnsafeHeaderPatches } from "../lib/ai/nav-edit";
import { getStarterTemplate, STARTER_TEMPLATES } from "../lib/templates/starter-catalog";
import { buildTemplateRefinementBlock } from "../lib/ai/template-refine";
import { readFileSync } from "fs";
import { join } from "path";

const cases: Array<[string, boolean]> = [];

cases.push([
  "contract prefers sticky and preserves CSS/footer",
  /sticky top-0/i.test(WEBSITE_HEADER_CONTRACT) &&
    /index\.css/i.test(WEBSITE_HEADER_CONTRACT) &&
    /Footer/i.test(WEBSITE_HEADER_CONTRACT) &&
    /logo/i.test(WEBSITE_HEADER_CONTRACT) &&
    /menu/i.test(WEBSITE_HEADER_CONTRACT) &&
    /social/i.test(WEBSITE_HEADER_CONTRACT),
]);

cases.push([
  "ensureWebsiteHeaderSections prepends two-tier chrome",
  (() => {
    const out = ensureWebsiteHeaderSections(["hero", "footer"], "saas");
    return (
      out[0] === WEBSITE_HEADER_SECTIONS[0] &&
      out[1] === WEBSITE_HEADER_SECTIONS[1] &&
      out.includes("hero")
    );
  })(),
]);

cases.push([
  "ensureWebsiteHeaderSections leaves admin alone",
  ensureWebsiteHeaderSections(
    ["sidebar nav", "topbar with search", "KPI cards"],
    "admin",
  )[0] === "sidebar nav",
]);

cases.push([
  "saas-aurora getStarterTemplate starts with top bar",
  (() => {
    const t = getStarterTemplate("saas-aurora");
    return !!t && t.sections[0]?.startsWith("top bar");
  })(),
]);

const websiteTemplates = STARTER_TEMPLATES.filter((t) =>
  WEBSITE_HEADER_CATEGORIES.has(t.category),
);
let allNormalized = true;
for (const raw of websiteTemplates) {
  const t = getStarterTemplate(raw.id);
  if (!t?.sections[0]?.startsWith("top bar") || !t.sections[1]?.startsWith("main header")) {
    allNormalized = false;
    console.error("BAD sections:", raw.id, t?.sections.slice(0, 3));
    break;
  }
}
cases.push([`all ${websiteTemplates.length} website starters normalized`, allNormalized]);

const refine = buildTemplateRefinementBlock("saas-aurora");
cases.push([
  "template refine includes header contract",
  refine.includes("WEBSITE HEADER CONTRACT") && refine.includes("top bar"),
]);

const adminRefine = buildTemplateRefinementBlock("admin-ledgerbooks");
cases.push([
  "admin refine skips website header contract",
  !adminRefine || !adminRefine.includes("WEBSITE HEADER CONTRACT"),
]);

const prompts = readFileSync(join(process.cwd(), "lib/ai/system-prompts.ts"), "utf8");
cases.push([
  "system-prompts imports website header contract",
  prompts.includes("website-header-contract") && prompts.includes("WEBSITE_HEADER_CONTRACT"),
]);

const design = readFileSync(join(process.cwd(), "lib/ai/design-directions.ts"), "utf8");
cases.push([
  "design-directions requires two-tier header",
  /two-tier/i.test(design) && /top bar/i.test(design) && /logo \+ menu/i.test(design),
]);

const builtIn = readFileSync(join(process.cwd(), "lib/templates/built-in.ts"), "utf8");
cases.push([
  "built-ins use sticky not fixed headers",
  !/header className="fixed top-0/.test(builtIn) &&
    /header className="sticky top-0/.test(builtIn),
]);

for (const id of ["saas-landing", "ecommerce-store", "portfolio", "landing-minimal", "startup-landing", "shopify-storefront"]) {
  cases.push([
    `built-in ${id} has top bar contact + social`,
    builtIn.includes(id) &&
      /Phone className/.test(builtIn) &&
      /Mail className/.test(builtIn) &&
      /(Twitter|Instagram|Linkedin|Facebook|Github) className/.test(builtIn),
  ]);
}

cases.push([
  "built-in saas has two-tier header markup",
  builtIn.includes("hello@launchpad.app") && builtIn.includes("Launchpad"),
]);
cases.push([
  "built-in shop has menu links on main row",
  builtIn.includes("ShopCo") && builtIn.includes(">Shop</a>") && builtIn.includes(">Contact</a>"),
]);

const unsafe = filterUnsafeHeaderPatches(
  [
    { path: "src/index.css", find: null, replace: "/* wiped */", description: "bad" },
    { path: "src/components/Footer.tsx", find: "<footer", replace: "", description: "bad" },
    { path: "src/App.tsx", find: null, replace: "<div/>", description: "full rewrite" },
    {
      path: "src/components/Header.tsx",
      find: "<nav>",
      replace: "<nav><a>About</a>",
      description: "ok",
    },
  ],
  "add menu items in header",
);
cases.push([
  "filterUnsafeHeaderPatches drops css/footer/full App rewrite",
  unsafe.length === 1 && unsafe[0]?.path === "src/components/Header.tsx",
]);

let failed = 0;
for (const [name, ok] of cases) {
  console.log(ok ? "PASS" : "FAIL", name);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
