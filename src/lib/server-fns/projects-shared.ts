/** Shared helpers for project create/list/mutate. */
import { tanstackStartScaffold } from "../templates/tanstack-start-scaffold.ts";
import { lovableViteScaffold } from "../templates/lovable-vite-scaffold.ts";
import { getTemplateById, type TemplateFile } from "../templates/built-in.ts";
import { KNOWLEDGE_FILE_PATH, defaultKnowledgeTemplate } from "../editor/project-knowledge.ts";
import type { Database, Json } from "../../types/database.ts";

export const PROJECT_SAFE_SELECT =
  "id, user_id, name, description, framework, runtime, status, is_public, preview_url, deployed_url, slug, template_id, created_at, updated_at, remix_enabled, remix_count, star_count, app_slug, visibility" as const;

export const ALLOWED_FRAMEWORKS = new Set([
  "static",
  "react",
  "next",
  "nextjs",
  "vue",
  "svelte",
  "react-native",
  "tanstack-start",
  "tanstack",
]);

export function isTemplateFile(value: Json): value is TemplateFile & Json {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { path?: unknown }).path === "string" &&
    typeof (value as { content?: unknown }).content === "string" &&
    typeof (value as { language?: unknown }).language === "string"
  );
}

export function getStarterFiles(name: string, framework: string) {
  const safeName = name.replace(/[^a-zA-Z0-9]/g, "") || "app";
  if (framework === "static") {
    return [
      {
        path: "index.html",
        language: "html",
        content: `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${name}</title>\n  <link rel="stylesheet" href="styles.css" />\n</head>\n<body>\n  <main><h1>${name}</h1><p>Start chatting with AI to build it.</p></main>\n  <script type="module" src="app.js"></script>\n</body>\n</html>\n`,
      },
      {
        path: "styles.css",
        language: "css",
        content: `* { box-sizing: border-box; }\nbody { margin: 0; font-family: system-ui, sans-serif; }\nmain { min-height: 100vh; display: grid; place-content: center; text-align: center; padding: 2rem; }\n`,
      },
      { path: "app.js", language: "javascript", content: `console.log(${JSON.stringify(safeName)});\n` },
    ];
  }
  if (framework === "tanstack-start" || framework === "tanstack") {
    return tanstackStartScaffold({}, name);
  }
  if (framework === "react") {
    return lovableViteScaffold(name);
  }
  if (framework === "next" || framework === "nextjs") {
    return [
      {
        path: "app/page.tsx",
        language: "typescriptreact",
        content: `export default function Home() {\n  return <main><h1>${name}</h1><p>Start chatting with AI to build it.</p></main>;\n}`,
      },
      {
        path: "app/layout.tsx",
        language: "typescriptreact",
        content: `export default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html lang="en"><body>{children}</body></html>;\n}`,
      },
      {
        path: "next.config.mjs",
        language: "javascript",
        content: `/** @type {import('next').NextConfig} */\nconst nextConfig = { reactStrictMode: true };\nexport default nextConfig;\n`,
      },
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify(
          {
            name: safeName.toLowerCase(),
            private: true,
            scripts: { dev: "next dev", build: "next build", start: "next start" },
            dependencies: { next: "^14.2.15", react: "^18.3.1", "react-dom": "^18.3.1" },
          },
          null,
          2,
        ),
      },
    ];
  }
  return [
    {
      path: "src/App.tsx",
      language: "typescriptreact",
      content: `export default function App() {\n  return (\n    <div className="min-h-screen flex items-center justify-center">\n      <h1 className="text-4xl font-bold">${name}</h1>\n    </div>\n  );\n}`,
    },
    {
      path: "package.json",
      language: "json",
      content: JSON.stringify({
        name: safeName.toLowerCase(),
        private: true,
        dependencies: { react: "^18.0.0", "react-dom": "^18.0.0" },
      }),
    },
  ];
}

export function withKnowledgeFile(files: TemplateFile[], projectName: string): TemplateFile[] {
  if (files.some((f) => f.path === KNOWLEDGE_FILE_PATH || f.path.endsWith("KNOWLEDGE.md"))) {
    return files;
  }
  return [
    ...files,
    {
      path: KNOWLEDGE_FILE_PATH,
      language: "markdown",
      content: defaultKnowledgeTemplate(projectName || "App"),
    },
  ];
}
