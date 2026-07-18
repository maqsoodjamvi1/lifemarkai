/**
 * Verify design-preview JSON repair / fallbacks.
 * Run: npx tsx scripts/verify-design-preview-parse.ts
 */
import {
  buildFallbackDesignPreviews,
  parseDesignPreviewResponse,
  repairDesignPreviewJson,
} from "../lib/ai/design-previews";

function check(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exit(1);
  }
  console.log("PASS", msg);
}

// Broken JSON with raw newline inside previewHtml string (the production failure class)
const broken = `{
  "directions": [
    {
      "id": "minimal-light",
      "label": "Minimal Light",
      "desc": "Clean airy layout",
      "colors": ["#2563eb", "#0ea5e9", "#ffffff", "#0f172a"],
      "previewHtml": "<div style=\\"padding:8px\\">
Hello "world"
</div>"
    },
    {
      "id": "warm-editorial",
      "label": "Warm Editorial",
      "desc": "Cream magazine feel",
      "colors": ["#c2410c", "#f59e0b", "#fffbf5", "#292524"],
      "previewHtml": "<div>Warm</div>"
    },
    {
      "id": "bold-gradient",
      "label": "Bold Gradient",
      "desc": "Vivid hero",
      "colors": ["#7c3aed", "#ec4899", "#faf5ff", "#1e1b4b"],
      "previewHtml": "<div>Bold</div>"
    }
  ]
}`;

let threw = false;
try {
  JSON.parse(broken);
} catch {
  threw = true;
}
check(threw, "raw broken JSON throws as expected");

const repaired = repairDesignPreviewJson(broken);
let repairedOk = false;
try {
  JSON.parse(repaired);
  repairedOk = true;
} catch (e) {
  console.error("repair still invalid:", e);
}
check(repairedOk, "repairDesignPreviewJson makes JSON.parse succeed");

const parsed = parseDesignPreviewResponse(broken);
check(parsed.length >= 1, `parseDesignPreviewResponse returns directions (got ${parsed.length})`);

const fallback = buildFallbackDesignPreviews("Build a spa wellness landing page", "seed");
check(fallback.length === 3, "fallback returns exactly 3");
check(fallback.every((d) => d.previewHtml.includes("<div")), "fallback cards have HTML");

// Empty / garbage → empty parse, caller uses fallback
check(parseDesignPreviewResponse("not json at all").length === 0, "garbage returns []");

console.log("ALL CHECKS PASSED");
