import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getTemplateById } from "@/lib/templates/built-in";

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
  const { name, description, framework = "react", templateId, forkFiles } = body;

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
