/**
 * Verify preview strips TypeScript `type` imports from clsx destructuring.
 */
import { buildFallbackHtml, PREVIEW_ENGINE_REV } from "../lib/preview/build-fallback-html";
import { getSmartPlaceholder } from "../lib/ai/editor-intelligence";

const files = [
  {
    path: "src/lib/utils.ts",
    content: `import { clsx, type ClassValue } from "clsx";
export function cn(...inputs: ClassValue[]) { return clsx(inputs); }`,
  },
  {
    path: "src/App.tsx",
    content: `export default function App() { return <div>Hi</div>; }`,
  },
];

const html = buildFallbackHtml(files as Parameters<typeof buildFallbackHtml>[0]);
const broken = html.includes("type ClassValue");
const clsxOk = html.includes("clsx: window.__clsx");
const placeholder = getSmartPlaceholder({
  fileCount: 2,
  hasPreviewError: true,
  hasCredits: false,
  currentMode: "build",
  streaming: false,
  isLocked: false,
});

const ok = !broken && clsxOk && placeholder.includes("Out of credits");
console.log(
  JSON.stringify({ rev: PREVIEW_ENGINE_REV, broken, clsxOk, placeholder, ok }),
);
process.exit(ok ? 0 : 1);
