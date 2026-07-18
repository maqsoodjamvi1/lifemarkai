/**
 * Verify preview contract healing unblanks the production Volta/export crash.
 * Run: npx tsx scripts/verify-heal-preview-contract.ts
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { buildFallbackHtml, PREVIEW_ENGINE_REV } from "../lib/preview/build-fallback-html";
import { healPreviewContractGaps } from "../lib/preview/heal-preview-contract";
import { findContractErrors } from "../lib/preview/export-contract";
import type { ProjectFile } from "../types/database";

const dir = "outputs/df9dd882-ec56-450f-b9ce-dbddd227af31";
const files: ProjectFile[] = readdirSync(dir).map((name) => ({
  id: name,
  project_id: "df9dd882-ec56-450f-b9ce-dbddd227af31",
  path: name.replace(/__/g, "/"),
  content: readFileSync(`${dir}/${name}`, "utf8"),
  created_at: "",
  updated_at: "",
}));

const before = findContractErrors(files.map((f) => ({ path: f.path, content: f.content })));
console.log("before contract errors:", before.length);
before.forEach((m) => console.log(" -", m.slice(0, 120)));

const healed = healPreviewContractGaps(files);
const after = findContractErrors(healed.map((f) => ({ path: f.path, content: f.content })));
console.log("after heal contract errors:", after.length);
after.forEach((m) => console.log(" -", m.slice(0, 120)));

const html = buildFallbackHtml(files);
mkdirSync("outputs", { recursive: true });
writeFileSync("outputs/df9dd882-healed-preview.html", html);

const hasNavbarStub = healed.some((f) => f.path.includes("Navbar"));
const mock = healed.find((f) => f.path === "src/data/mock.ts")?.content ?? "";
const utils = healed.find((f) => f.path === "src/lib/utils.ts")?.content ?? "";

const checks = {
  rev: PREVIEW_ENGINE_REV,
  htmlLen: html.length,
  hasNavbarStub,
  hasMockPartners: /export\s+const\s+MOCK_PARTNERS/.test(mock),
  hasFormatDateShort: /formatDateShort/.test(utils),
  hasPortfolio: healed.some((f) => /Portfolio/.test(f.path)),
  hasBlogPost: healed.some((f) => /BlogPost/.test(f.path)),
  contractClean: after.length === 0,
};

console.log(JSON.stringify(checks, null, 2));
if (!checks.contractClean || !checks.hasMockPartners || !checks.hasFormatDateShort) {
  process.exit(1);
}
console.log("PASS heal-preview-contract");
