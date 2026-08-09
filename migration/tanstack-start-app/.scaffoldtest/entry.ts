import { tanstackStartScaffold } from "@/lib/templates/tanstack-start-scaffold";
import { lovableViteScaffold } from "@/lib/templates/lovable-vite-scaffold";
import { ensureWebsiteChrome, assessWebsiteChrome } from "@/lib/ai/website-chrome";
import { alignGeneratedPackageJson, stripGeneratedRouteTree } from "@/lib/preview/align-package-json";
import { diagnoseBrokenImports } from "@/lib/preview/diagnose-imports";
import { deriveBrand } from "@/lib/templates/site-chrome";

const out = {
  tss: tanstackStartScaffold({}, "A landing page for a bakery called Rye and Salt"),
  tssNoName: tanstackStartScaffold(),
  vite: lovableViteScaffold("Rye and Salt"),
  brands: ["A landing page for a bakery called Rye and Salt","A landing page for a coffee shop called BrewHaus with a hero","Lotus Flow", "", "an ecommerce store for shoes"].map((n) => [n, deriveBrand(n)]),
};
console.log(JSON.stringify(out));
