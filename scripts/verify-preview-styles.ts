/**
 * Verify preview CSS sanitization and Tailwind CDN config injection.
 */
import {
  buildFallbackHtml,
  sanitizePreviewCss,
  projectUsesTailwind,
  PREVIEW_ENGINE_REV,
} from "../lib/preview/build-fallback-html";
import { generateFallbackUtilityCss } from "../lib/preview/generate-fallback-utilities";

const files = [
  {
    path: "src/index.css",
    content: `@tailwind base;
@tailwind components;
@tailwind utilities;
@layer base {
  :root { --background: 224 71% 4%; --foreground: 210 20% 98%; --primary: 263 70% 50%; }
}
body { margin: 0; }`,
  },
  {
    path: "tailwind.config.js",
    content: `export default { content: ['./src/**/*.{tsx,ts}'], theme: { extend: {} } }`,
  },
  {
    path: "src/App.tsx",
    content: `export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center p-8">
      <nav className="flex gap-4">
        <a className="text-primary hover:underline" href="#">Home</a>
      </nav>
    </div>
  );
}`,
  },
];

const sanitized = sanitizePreviewCss(files[0].content!);
const usesTw = projectUsesTailwind(files as Parameters<typeof projectUsesTailwind>[0]);
const html = buildFallbackHtml(files as Parameters<typeof buildFallbackHtml>[0]);

const fallbackCss = generateFallbackUtilityCss(files as Parameters<typeof generateFallbackUtilityCss>[0]);
const ok =
  !sanitized.includes("@tailwind") &&
  sanitized.includes("--background") &&
  usesTw &&
  html.includes("tailwind.config") &&
  html.includes("lifemark-fallback-utils") &&
  html.includes(".flex{display:flex}") &&
  fallbackCss.includes(".flex{display:flex}") &&
  html.includes("whenRuntimeReady");

console.log(
  JSON.stringify({
    rev: PREVIEW_ENGINE_REV,
    sanitizedOk: !sanitized.includes("@tailwind"),
    hasCssVars: sanitized.includes("--background"),
    usesTailwind: usesTw,
    hasCdnConfig: html.includes("tailwind.config"),
    hasRefresh: html.includes("tailwind.refresh"),
    ok,
  }),
);
process.exit(ok ? 0 : 1);
