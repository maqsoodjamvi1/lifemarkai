import { applyPatches } from "../lib/ai/patch-applier";
import {
  buildDeterministicTextPatches,
  parseTextReplacementIntent,
} from "../lib/ai/text-edit";

const files = [
  {
    path: "src/components/Hero.tsx",
    content: `export function Hero() {
  return (
    <section className="hero">
      <h1>Tech That Elevates You</h1>
      <p>Premium accessories engineered for performance.</p>
    </section>
  );
}`,
  },
  {
    path: "src/components/Footer.tsx",
    content: `<footer>Tech support available</footer>`,
  },
];

const cases: Array<[string, boolean]> = [];

const intent = parseTextReplacementIntent("update tech to technology in hero section");
cases.push([
  "parse hero text replacement",
  intent?.from === "tech" && intent.to === "technology" && intent.scope === "hero",
]);

const patches = buildDeterministicTextPatches("update tech to technology in hero section", files);
const applied = applyPatches(patches, files);
const hero = applied.find((r) => r.path === "src/components/Hero.tsx")?.content ?? "";
cases.push([
  "patches scoped hero component first",
  patches.length === 1 &&
    patches[0]?.path === "src/components/Hero.tsx" &&
    hero.includes("Technology That Elevates You"),
]);

const quoted = buildDeterministicTextPatches('replace "Premium accessories" with "Premium technology"', files);
cases.push([
  "quoted multi-word replacement",
  quoted.length === 1 &&
    quoted[0]?.find === "Premium accessories" &&
    quoted[0]?.replace === "Premium technology",
]);

let failed = 0;
for (const [name, ok] of cases) {
  console.log(ok ? "PASS" : "FAIL", name);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
