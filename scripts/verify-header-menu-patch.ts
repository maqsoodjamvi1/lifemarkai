import { resolvePromptMode } from "../lib/ai/editor-intelligence";
import { parsePatchResponse, applyPatches } from "../lib/ai/patch-applier";

const files = [
  { path: "src/App.tsx", content: "export default function App(){return <Header/>}" },
  { path: "src/components/Header.tsx", content: `<nav><a href="/">Home</a><a href="/shop">Shop</a></nav>` },
];
const chatCtx = { fileCount: files.length, hasPreviewError: false, currentMode: "chat" as const, files };
const buildCtx = { ...chatCtx, currentMode: "build" as const };

const cases = [
  ["chat→patch", resolvePromptMode("add menu items in header", chatCtx) === "patch"],
  ["build→patch", resolvePromptMode("add menu items in header", buildCtx) === "patch"],
  [
    "parse fenced+trailing comma",
    parsePatchResponse('Here:\n```json\n[{"path":"a.tsx","find":"x","replace":"y"},]\n```').length === 1,
  ],
];

const header = files[1]!;
const patches = parsePatchResponse(
  JSON.stringify({
    patches: [
      {
        path: "src/components/Header.tsx",
        find: '<a href="/shop">Shop</a>',
        replace: '<a href="/shop">Shop</a><a href="/about">About</a>',
        description: "add About menu item",
      },
    ],
  }),
);
const applied = applyPatches(patches, files);
cases.push(["apply header menu", applied[0]?.applied === true && (applied[0]?.content.includes("About") ?? false)]);
cases.push([
  "parse object wrapper",
  parsePatchResponse('{"patches":[{"path":"a.tsx","find":"x","replace":"y"}]}').length === 1,
]);
cases.push([
  "parse legacy array",
  parsePatchResponse('[{"path":"a.tsx","find":"x","replace":"y"}]').length === 1,
]);

let failed = 0;
for (const [name, ok] of cases) {
  console.log(ok ? "PASS" : "FAIL", name);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
