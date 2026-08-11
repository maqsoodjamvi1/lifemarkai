import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractDecisions,
  renderDecisionsBlock,
  mergeDecisionsIntoKnowledge,
  detectAppGaps,
  nextStepsPromptBlock,
  DECISIONS_START,
  DECISIONS_END,
} from "./decision-memory";

const crmFiles = [
  {
    path: "index.html",
    content: `<html><head><title>CRM</title><meta name="description" content="x">
<script src="https://cdn.tailwindcss.com"></script></head>
<body class="flex p-4 text-sm bg-white">
<script>
await LifemarkData.defineSchema("customers", {name:{type:"string",required:true}});
await LifemarkData.seed("customers", []);
const rows = await LifemarkData.list("customers");
await LifemarkData.create("deals", {title: "x"});
</script></body></html>`,
  },
  { path: "deal-board.js", content: "export const board = 1;" },
  { path: "customer-list.js", content: "export const list = 1;" },
  { path: "app-shell.js", content: "" },
];

// ── extractDecisions ─────────────────────────────────────────────────────────

test("extracts styling, naming, collections and libraries deterministically", () => {
  const d = extractDecisions(crmFiles, "static");
  assert.equal(d.framework, "static");
  assert.equal(d.styling, "tailwind");
  assert.equal(d.fileNaming, "kebab-case");
  assert.deepEqual(d.collections, ["customers", "deals"]);
  assert.ok(d.pages.includes("index.html"));
});

test("PascalCase project detected; mixed stays mixed", () => {
  const pascal = extractDecisions(
    [
      { path: "src/DealBoard.tsx", content: "" },
      { path: "src/CustomerList.tsx", content: "" },
    ],
    "tanstack-start",
  );
  assert.equal(pascal.fileNaming, "PascalCase");
  const mixed = extractDecisions(
    [
      { path: "DealBoard.tsx", content: "" },
      { path: "customer-list.tsx", content: "" },
    ],
    "static",
  );
  assert.equal(mixed.fileNaming, "mixed");
});

// ── renderDecisionsBlock + merge ─────────────────────────────────────────────

test("decisions block renders inside markers with follow instructions", () => {
  const block = renderDecisionsBlock(extractDecisions(crmFiles, "static"));
  assert.ok(block.startsWith(DECISIONS_START));
  assert.ok(block.endsWith(DECISIONS_END));
  assert.ok(block.includes("Established decisions"));
  assert.ok(block.includes("customers, deals"));
  assert.ok(block.includes("kebab-case"));
});

test("merge is idempotent and preserves the user's own knowledge", () => {
  const block1 = renderDecisionsBlock(extractDecisions(crmFiles, "static"));
  const merged1 = mergeDecisionsIntoKnowledge("Always use blue buttons.", block1);
  assert.ok(merged1.startsWith("Always use blue buttons."));
  assert.ok(merged1.includes(DECISIONS_START));

  // second merge with updated decisions replaces the old section, not appends
  const block2 = renderDecisionsBlock(
    extractDecisions([...crmFiles, { path: "settings-page.js", content: "" }], "static"),
  );
  const merged2 = mergeDecisionsIntoKnowledge(merged1, block2);
  assert.equal(merged2.split(DECISIONS_START).length, 2);
  assert.ok(merged2.startsWith("Always use blue buttons."));
});

test("merge into empty knowledge is just the block", () => {
  const block = renderDecisionsBlock(extractDecisions(crmFiles, "static"));
  assert.equal(mergeDecisionsIntoKnowledge(null, block), block);
});

// ── detectAppGaps ────────────────────────────────────────────────────────────

test("detects undeclared collections as the top gap", () => {
  const gaps = detectAppGaps(crmFiles);
  assert.ok(gaps[0].includes("deals"));
  assert.ok(!gaps[0].includes("customers"));
});

test("detects forms without validation and missing alt text", () => {
  const gaps = detectAppGaps([
    {
      path: "index.html",
      content: `<title>x</title><meta name="description" content="y">
<form onSubmit="save()"><input name="email"></form><img src="a.png">`,
    },
  ]);
  assert.ok(gaps.some((g) => g.includes("validation")));
  assert.ok(gaps.some((g) => g.includes("alt text")));
});

test("validated forms and alt-ed images produce no gap", () => {
  const gaps = detectAppGaps([
    {
      path: "index.html",
      content: `<title>x</title><meta name="description" content="y">
<form><input required name="email"></form><img src="a.png" alt="logo">`,
    },
  ]);
  assert.deepEqual(gaps, []);
});

test("multi-page app without 404 is flagged; caps at 3 gaps", () => {
  const files = [
    { path: "index.html", content: "<form onSubmit='x'><input></form><img src='a.png'>" },
    { path: "about.html", content: "x" },
    { path: "contact.html", content: "x" },
  ];
  const gaps = detectAppGaps(files);
  assert.ok(gaps.length <= 3);
  assert.ok(gaps.some((g) => g.includes("404")) || gaps.length === 3);
});

test("empty project produces no gaps and no prompt block", () => {
  assert.deepEqual(detectAppGaps([]), []);
  assert.equal(nextStepsPromptBlock([]), "");
});

test("prompt block instructs proactive suggested next steps", () => {
  const block = nextStepsPromptBlock(["No 404 / not-found page"]);
  assert.ok(block.includes("Known gaps"));
  assert.ok(block.includes("Suggested next steps"));
  assert.ok(block.includes("404"));
});
