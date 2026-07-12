import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getTemplateById } from "@/lib/templates/built-in";
import { projectSchema } from "@/lib/validations";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await (supabase as any)
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Validate the free-text inputs (non-empty name, sane sizes) before touching
  // the DB. Permissive by design — see lib/validations.ts projectSchema.
  const parsed = projectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid project input" },
      { status: 400 },
    );
  }

  const { name, description, templateId, forkFiles } = body;
  // SSR-first default: Next.js App Router unless the client picked a framework
  // or the deployment overrides it (DEFAULT_NEW_PROJECT_FRAMEWORK=react to revert).
  const framework: string =
    body.framework ?? process.env.DEFAULT_NEW_PROJECT_FRAMEWORK ?? "next";

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  // Create project
  const { data: project, error } = await (supabase as any)
    .from("projects")
    .insert({
      user_id: user.id,
      name,
      description,
      framework,
      status: "active",
      is_public: false,
      template_id: templateId ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Assign a clean, unique app_slug now so the public deploy URL is
  // {app_slug}.apps.lifemarkai.com (best-effort — deploy generates it lazily too).
  try {
    const { data: gen } = await (supabase as any).rpc("generate_app_slug", {
      p_name: project.name,
    });
    if (typeof gen === "string" && gen) {
      await (supabase as any)
        .from("projects")
        .update({ app_slug: gen })
        .eq("id", project.id)
        .is("app_slug", null);
    }
  } catch { /* non-critical */ }

  // If duplicating an existing project (forkFiles takes priority)
  if (forkFiles && Array.isArray(forkFiles) && forkFiles.length > 0) {
    await (supabase as any).from("project_files").insert(
      (forkFiles as Array<{ path: string; content: string; language: string }>).map((f) => ({
        project_id: project.id,
        path: f.path,
        content: f.content,
        language: f.language ?? "plaintext",
      }))
    );
    return NextResponse.json(project, { status: 201 });
  }

  // If from template, copy template files
  if (templateId) {
    // 1. Check built-in templates first (no DB round-trip needed)
    const builtin = getTemplateById(templateId);
    let templateFiles: Array<{ path: string; content: string; language: string }> | null =
      builtin?.files ?? null;

    // 2. Fall back to DB templates
    if (!templateFiles) {
      const { data: dbTemplate } = await (supabase as any)
        .from("templates")
        .select("files")
        .eq("id", templateId)
        .single();
      if (dbTemplate?.files && Array.isArray(dbTemplate.files)) {
        templateFiles = dbTemplate.files as Array<{ path: string; content: string; language: string }>;
      }
    }

    if (templateFiles && templateFiles.length > 0) {
      await (supabase as any).from("project_files").insert(
        templateFiles.map((f) => ({
          project_id: project.id,
          path: f.path,
          content: f.content,
          language: f.language,
        }))
      );
      // Increment fork count in DB if it's a DB template
      if (!builtin) {
        await (supabase as any).rpc("increment_fork_count" as never, { template_id: templateId });
      }
    }
  } else {
    // Create starter files
    const starterFiles = getStarterFiles(name, framework);
    await (supabase as any).from("project_files").insert(
      starterFiles.map((f) => ({ project_id: project.id, ...f }))
    );
  }

  return NextResponse.json(project, { status: 201 });
}

function getStarterFiles(name: string, framework: string) {
  const safeName = name.replace(/[^a-zA-Z0-9]/g, "");

  // Next.js App Router starter — minimal SSR-first scaffold. The AI's first
  // build replaces app/page.tsx (the placeholder text is what the validator's
  // placeholder_entry check looks for).
  if (framework === "next" || framework === "nextjs") {
    return [
      {
        path: "app/layout.tsx",
        language: "typescriptreact",
        content: `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: ${JSON.stringify(name)},
  description: "Built with LifemarkAI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}`,
      },
      {
        path: "app/page.tsx",
        language: "typescriptreact",
        content: `export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">${name}</h1>
        <p className="text-slate-400 text-lg">Your app is ready. Start chatting with AI to build it!</p>
      </div>
    </div>
  );
}`,
      },
      {
        path: "app/globals.css",
        language: "css",
        content: `@tailwind base;\n@tailwind components;\n@tailwind utilities;`,
      },
      {
        path: "next.config.mjs",
        language: "javascript",
        content: `/** @type {import('next').NextConfig} */\nconst nextConfig = { reactStrictMode: true };\nexport default nextConfig;`,
      },
      {
        path: "tailwind.config.ts",
        language: "typescript",
        content: `import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
export default config;`,
      },
      {
        path: "postcss.config.mjs",
        language: "javascript",
        content: `export default {\n  plugins: { tailwindcss: {}, autoprefixer: {} },\n};`,
      },
      {
        path: "tsconfig.json",
        language: "json",
        content: JSON.stringify({
          compilerOptions: {
            target: "ES2020",
            lib: ["dom", "dom.iterable", "esnext"],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: "preserve",
            incremental: true,
            plugins: [{ name: "next" }],
            paths: { "@/*": ["./*"] },
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
          exclude: ["node_modules"],
        }, null, 2),
      },
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify({
          name: safeName.toLowerCase() || "app",
          private: true,
          version: "0.1.0",
          scripts: {
            dev: "next dev",
            build: "next build",
            start: "next start",
          },
          dependencies: {
            next: "^14.2.15",
            react: "^18.3.1",
            "react-dom": "^18.3.1",
            "lucide-react": "^0.414.0",
          },
          devDependencies: {
            "@types/node": "^20",
            "@types/react": "^18.3.5",
            "@types/react-dom": "^18.3.0",
            autoprefixer: "^10.4.20",
            postcss: "^8.4.45",
            tailwindcss: "^3.4.11",
            typescript: "^5.5.3",
          },
        }, null, 2),
      },
      {
        path: "README.md",
        language: "markdown",
        content: `# ${name}\n\nBuilt with LifemarkAI 🚀 — Next.js 14 App Router (SSR-first)\n\n## Getting Started\n\nDescribe what you want to build in the chat panel and let the AI do the work.`,
      },
    ];
  }

  return [
    {
      path: "src/App.tsx",
      language: "typescriptreact",
      content: `import React from 'react';

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">${name}</h1>
        <p className="text-slate-400 text-lg">Your app is ready. Start chatting with AI to build it!</p>
      </div>
    </div>
  );
}`,
    },
    {
      path: "src/index.css",
      language: "css",
      content: `@tailwind base;\n@tailwind components;\n@tailwind utilities;`,
    },
    {
      path: "package.json",
      language: "json",
      content: JSON.stringify({
        name: safeName.toLowerCase(),
        version: "0.1.0",
        private: true,
        dependencies: {
          react: "^18.0.0",
          "react-dom": "^18.0.0",
          "lucide-react": "^0.414.0",
        },
        devDependencies: {
          typescript: "^5.0.0",
          tailwindcss: "^3.4.0",
        },
      }, null, 2),
    },
    {
      path: "README.md",
      language: "markdown",
      content: `# ${name}\n\nBuilt with LifemarkAI 🚀\n\n## Getting Started\n\nDescribe what you want to build in the chat panel and let the AI do the work.`,
    },
  ];
}
