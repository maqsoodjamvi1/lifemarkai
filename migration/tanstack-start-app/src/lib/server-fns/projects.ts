/**
 * Native projects list/create — Start-owned (no Next hop for dashboard create).
 * Template scaffolding for built-ins pulls from the main repo via relative import.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import {
  canReadProjectFiles,
  canWriteProjectFiles,
  getProjectAccess,
} from "@/lib/project/access";
import { tanstackStartScaffold } from "@/lib/templates/tanstack-start-scaffold";
import { getTemplateById } from "@/lib/templates/built-in";

const PROJECT_SAFE_SELECT = [
  "id",
  "user_id",
  "name",
  "description",
  "framework",
  "status",
  "is_public",
  "preview_url",
  "deployed_url",
  "slug",
  "template_id",
  "created_at",
  "updated_at",
  "remix_enabled",
  "remix_count",
  "star_count",
  "app_slug",
  "visibility",
].join(", ");

const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(10000).optional().nullable(),
  framework: z.string().max(30).optional(),
  templateId: z.string().max(200).optional().nullable(),
  forkFiles: z
    .array(
      z.object({
        path: z.string(),
        content: z.string(),
        language: z.string().optional(),
      }),
    )
    .optional(),
});

function getStarterFiles(name: string, framework: string) {
  const safeName = name.replace(/[^a-zA-Z0-9]/g, "") || "app";
  if (framework === "tanstack-start" || framework === "tanstack") {
    return tanstackStartScaffold();
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
      // next.config.mjs is REQUIRED here, not cosmetic: detectSandboxStart()
      // (src/lib/sandbox/shared.ts) tests for next.config.* to decide between
      // `npx next dev -p 3000` and the vite default. Without it a brand-new Next
      // project boots `npm run dev` on port 5173 and the preview 502s until the
      // first AI turn writes the real config. Same for the scripts block —
      // ensureViteEntryFiles() deliberately bails out on Next projects, so the
      // dev-script repair that saves the React scaffold never runs for this one.
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
            scripts: {
              dev: "next dev",
              build: "next build",
              start: "next start",
            },
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

export const listProjects = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const { data, error } = await (supabase as any)
    .from("projects")
    .select(PROJECT_SAFE_SELECT)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) return { status: "error" as const, message: error.message };
  return { status: "ok" as const, projects: data ?? [] };
});

export const createProject = createServerFn({ method: "POST" })
  .validator(zodValidator(projectCreateSchema))
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const framework =
      data.framework ??
      (typeof process !== "undefined"
        ? process.env.DEFAULT_NEW_PROJECT_FRAMEWORK
        : undefined) ??
      "tanstack-start";

    const { data: project, error } = await (supabase as any)
      .from("projects")
      .insert({
        user_id: user.id,
        name: data.name,
        description: data.description ?? null,
        framework,
        status: "active",
        is_public: false,
        template_id: data.templateId ?? null,
      })
      .select(PROJECT_SAFE_SELECT)
      .single();

    if (error || !project) {
      return { status: "error" as const, message: error?.message ?? "Create failed" };
    }

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
    } catch {
      /* non-critical */
    }

    if (data.forkFiles && data.forkFiles.length > 0) {
      await (supabase as any).from("project_files").insert(
        data.forkFiles.map((f) => ({
          project_id: project.id,
          path: f.path,
          content: f.content,
          language: f.language ?? "plaintext",
        })),
      );
      return { status: "ok" as const, project };
    }

    if (data.templateId) {
      const builtin = getTemplateById(data.templateId);
      let templateFiles = builtin?.files ?? null;
      if (!templateFiles) {
        const { data: dbTemplate } = await (supabase as any)
          .from("templates")
          .select("files")
          .eq("id", data.templateId)
          .maybeSingle();
        if (dbTemplate?.files && Array.isArray(dbTemplate.files)) {
          templateFiles = dbTemplate.files;
        }
      }
      if (templateFiles && templateFiles.length > 0) {
        await (supabase as any).from("project_files").insert(
          templateFiles.map((f: { path: string; content: string; language: string }) => ({
            project_id: project.id,
            path: f.path,
            content: f.content,
            language: f.language,
          })),
        );
      }
    } else {
      const starterFiles = getStarterFiles(data.name, framework);
      await (supabase as any).from("project_files").insert(
        starterFiles.map((f) => ({ project_id: project.id, ...f })),
      );
    }

    return { status: "ok" as const, project };
  });

const PUBLIC_PROJECT_SELECT = [
  "id",
  "user_id",
  "name",
  "description",
  "framework",
  "status",
  "is_public",
  "preview_url",
  "deployed_url",
  "template_id",
  "slug",
  "app_slug",
  "seo_title",
  "seo_description",
  "og_image_url",
  "favicon_url",
  "remix_enabled",
  "remix_count",
  "remix_of",
  "badge_hidden",
  "total_views",
  "created_at",
  "updated_at",
].join(", ");

const PROJECT_UPDATE_FIELDS = new Set([
  "name",
  "description",
  "framework",
  "status",
  "is_public",
  "visibility",
  "knowledge",
  "metadata",
  "is_starred",
  "disabled_skill_ids",
  "seo_title",
  "seo_description",
  "og_image_url",
  "favicon_url",
  "remix_enabled",
  "badge_hidden",
]);

const OWNER_ONLY_PROJECT_FIELDS = new Set([
  "status",
  "is_public",
  "visibility",
  "is_starred",
  "remix_enabled",
  "badge_hidden",
]);

// Returned as JSON — typed loosely so Start's serializable-validation accepts it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeProjectResponse(data: Record<string, unknown>): any {
  const response = { ...data };
  delete response.cloud_service_key;
  delete response.cloud_db_password;
  return response;
}

export const getProject = createServerFn({ method: "GET" })
  .validator(zodValidator(z.object({ id: z.string().uuid() })))
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    const access = await getProjectAccess(supabase, data.id, user?.id);
    if (!canReadProjectFiles(access)) return { status: "not_found" as const };

    const { data: project, error } = await (supabase as any)
      .from("projects")
      .select(access === "public" ? PUBLIC_PROJECT_SELECT : PROJECT_SAFE_SELECT)
      .eq("id", data.id)
      .maybeSingle();

    if (error || !project) return { status: "not_found" as const };
    return {
      status: "ok" as const,
      project: safeProjectResponse(project as Record<string, unknown>),
    };
  });

const projectUpdateSchema = z.object({
  id: z.string().uuid(),
  patch: z.record(z.unknown()),
});

export const updateProject = createServerFn({ method: "POST" })
  .validator(zodValidator(projectUpdateSchema))
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await getProjectAccess(supabase, data.id, user.id);
    if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

    const body = data.patch;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { status: "error" as const, message: "Project update must be an object" };
    }

    const rejectedFields = Object.keys(body).filter(
      (key) => key !== "generate_slug" && !PROJECT_UPDATE_FIELDS.has(key),
    );
    if (rejectedFields.length > 0) {
      return {
        status: "error" as const,
        message: `Unsupported project field: ${rejectedFields[0]}`,
      };
    }
    if (access !== "owner") {
      const ownerOnlyField = Object.keys(body).find(
        (key) => key === "generate_slug" || OWNER_ONLY_PROJECT_FIELDS.has(key),
      );
      if (ownerOnlyField) {
        return {
          status: "forbidden" as const,
          message: `Only the project owner can update ${ownerOnlyField}`,
        };
      }
    }

    const { generate_slug, ...requestedFields } = body as Record<string, unknown>;
    const updateFields = Object.fromEntries(
      Object.entries(requestedFields).filter(([key]) => PROJECT_UPDATE_FIELDS.has(key)),
    );

    if (generate_slug) {
      let slugName =
        typeof updateFields.name === "string" ? (updateFields.name as string) : undefined;
      const { data: existing } = await (supabase as any)
        .from("projects")
        .select("name, user_id")
        .eq("id", data.id)
        .maybeSingle();
      if (!slugName) slugName = existing?.name;
      const { data: slugData } = await (supabase as any).rpc("generate_project_slug", {
        p_name: slugName ?? "project",
        p_user_id: existing?.user_id ?? user.id,
      });
      if (slugData) updateFields.slug = slugData as string;
    }

    const writeClient = access === "owner" ? supabase : createAdminClient();
    const { data: project, error } = await (writeClient as any)
      .from("projects")
      .update({ ...updateFields, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select(PROJECT_SAFE_SELECT)
      .single();

    if (error || !project) {
      return { status: "error" as const, message: error?.message ?? "Update failed" };
    }
    return {
      status: "ok" as const,
      project: safeProjectResponse(project as Record<string, unknown>),
    };
  });

export const deleteProject = createServerFn({ method: "POST" })
  .validator(zodValidator(z.object({ id: z.string().uuid() })))
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await getProjectAccess(supabase, data.id, user.id);
    if (access !== "owner") return { status: "not_found" as const };

    const { error } = await (supabase as any)
      .from("projects")
      .delete()
      .eq("id", data.id)
      .eq("user_id", user.id);

    if (error) return { status: "error" as const, message: error.message };
    return { status: "ok" as const, success: true };
  });
