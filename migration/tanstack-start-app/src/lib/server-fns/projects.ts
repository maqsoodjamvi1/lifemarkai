/**
 * Native projects list/create — Start-owned (no Next hop for dashboard create).
 * Template scaffolding for built-ins pulls from the main repo via relative
 * import.
 */
import { z } from "zod";
import { classifyBuildIntent } from "../ai/build-intent.ts";
import { createAdminClient,createClient } from "../supabase/server.ts";
import { getServerUser } from "../supabase/server-user.ts";
import {
canReadProjectFiles,
canWriteProjectFiles,
getProjectAccess,
} from "@/lib/project/access";
import { tanstackStartScaffold } from "../templates/tanstack-start-scaffold.ts";
import { lovableViteScaffold } from "../templates/lovable-vite-scaffold.ts";
import { controlledTemplateMetadata,resolveControlledTemplate,stampControlledTemplateFiles } from "../templates/controlled-registry.ts";
import { getTemplateById,type TemplateFile } from "../templates/built-in.ts";
import type { Database,Json } from "../../types/database.ts";

const PROJECT_SAFE_SELECT =
  "id, user_id, name, description, framework, runtime, status, is_public, preview_url, deployed_url, slug, template_id, created_at, updated_at, remix_enabled, remix_count, star_count, app_slug, visibility" as const;

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

/**
 * Framework values the projects_framework_check constraint accepts
 * (supabase/migrations/155_framework_tanstack_start.sql). Keep in sync with it.
 *
 * The onboarding wizard also offers "astro" and "remix", which are NOT in this
 * list — so a stored preference must be validated before it is used as a project
 * framework, or createProject would fail the check constraint for those users.
 */
const ALLOWED_FRAMEWORKS = new Set([
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

type ProjectFileInsert = Database["public"]["Tables"]["project_files"]["Insert"];

function isTemplateFile(value: Json): value is TemplateFile & Json {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.path === "string" &&
    typeof value.content === "string" &&
    typeof value.language === "string"
  );
}

function getStarterFiles(name: string, framework: string) {
  const safeName = name.replace(/[^a-zA-Z0-9]/g, "") || "app";
  if (framework === "static") {
    return [
      {
        path: "index.html",
        language: "html",
        content: `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${name}</title>\n  <link rel="stylesheet" href="styles.css" />\n</head>\n<body>\n  <main><h1>${name}</h1><p>Start chatting with AI to build it.</p></main>\n  <script type="module" src="app.js"></script>\n</body>\n</html>\n`,
      },
      { path: "styles.css", language: "css", content: `* { box-sizing: border-box; }\nbody { margin: 0; font-family: system-ui, sans-serif; }\nmain { min-height: 100vh; display: grid; place-content: center; text-align: center; padding: 2rem; }\n` },
      { path: "app.js", language: "javascript", content: `console.log(${JSON.stringify(safeName)});\n` },
    ];
  }
  if (framework === "tanstack-start" || framework === "tanstack") {
    return tanstackStartScaffold({}, name);
  }
  // "react" is the Lovable shape: Vite + React 18 + shadcn + react-router-dom,
  // mirroring a real Lovable export file-for-file. See lovable-vite-scaffold.ts.
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

export async function listProjects() {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SAFE_SELECT)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) return { status: "error" as const, message: error.message };
  return { status: "ok" as const, projects: data ?? [] };
}

export async function createProject(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    // Per-user default from onboarding. Only consulted when the client did not
    // send an explicit framework — the three create surfaces all send one, so
    // this mainly covers API/MCP creates and future callers that omit it.
    let preferred: string | undefined;
    if (!data.framework) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("preferred_framework")
          .eq("id", user.id)
          .maybeSingle();
        const p = profile?.preferred_framework;
        // Framework choice was removed from the product: only the two platform
        // stacks are still honored from legacy profile preferences.
        if (p === "static" || p === "tanstack-start" || p === "tanstack") preferred = p;
      } catch {
        // Preference is an optimisation, never a reason to fail a create.
      }
    }

    // Precedence: explicit request > user's onboarding preference > operator env
    // override > built-in default.
    //
    // Default is "react" — the Lovable shape (Vite + React 18 + shadcn +
    // react-router-dom), matching a real Lovable export file-for-file. The
    // PLATFORM itself runs on TanStack Start; that is a separate concern from
    // what it generates. tanstack-start remains fully supported and selectable.
    // Improvement #1 (instant runtime): when the user didn't pick a framework
    // and the prompt clearly describes a plain marketing/landing site, default
    // to the no-build "static" runtime — instant preview, zero compile/install
    // failure modes. Anything app-like still gets the full React pipeline, and
    // an explicit framework choice always wins.
    const intentText = `${data.name ?? ""} ${data.description ?? ""}`;
    const staticDefault =
      classifyBuildIntent(intentText).appType === "marketing-website" ? "static" : undefined;
    // Default generation framework is tanstack-start (same stack the platform
    // itself runs on): one framework contract to keep bug-free instead of two.
    // Simple marketing sites still get the instant no-build static runtime,
    // and an explicit user choice or env override always wins.
    const requested =
      data.framework ??
      preferred ??
      (typeof process !== "undefined"
        ? process.env.DEFAULT_NEW_PROJECT_FRAMEWORK
        : undefined) ??
      staticDefault ??
      "tanstack-start";

    // Coerce rather than insert something projects_framework_check will reject:
    // a constraint violation surfaces as an opaque 500 on the create path.
    const framework = ALLOWED_FRAMEWORKS.has(requested) ? requested : "tanstack-start";
    const controlledTemplate = resolveControlledTemplate(`${data.name ?? ""} ${data.description ?? ""}`, framework);

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        name: data.name,
        description: data.description ?? null,
        framework,
        runtime: framework === "static" ? "static" : "framework",
        status: "active",
        is_public: false,
        template_id: data.templateId ?? null,
        metadata: controlledTemplateMetadata(controlledTemplate),
      })
      .select(PROJECT_SAFE_SELECT)
      .single();

    if (error || !project) {
      return { status: "error" as const, message: error?.message ?? "Create failed" };
    }

    try {
      const { data: gen } = await supabase.rpc("generate_app_slug", {
        p_name: project.name,
      });
      if (typeof gen === "string" && gen) {
        await supabase
          .from("projects")
          .update({ app_slug: gen })
          .eq("id", project.id)
          .is("app_slug", null);
      }
    } catch {
      /* non-critical */
    }

    /**
     * A project with no files is a dead end, so never report one as created.
     *
     * All three seeding paths below inserted and returned `ok` without looking
     * at the result. On failure the API answered 201, the client navigated to
     * the editor, and the user landed on an empty file tree with a preview that
     * answers "Project has no files." Duplicating a project hit the same hole:
     * `res.ok` was true and the copy was empty.
     *
     * Deleting the orphan row is the right cleanup — a half-created project the
     * user can see but not use is worse than no project, because it looks like
     * something they could recover.
     */
    const seedFiles = async (
      rows: ProjectFileInsert[],
      what: string,
    ): Promise<{ status: "error"; message: string } | null> => {
      if (rows.length === 0) return null;
      const { error } = await supabase.from("project_files").insert(rows);
      if (!error) return null;
      await supabase.from("projects").delete().eq("id", project.id);
      return {
        status: "error" as const,
        message: `Could not create the project's ${what}: ${error.message}`,
      };
    };

    if (data.forkFiles && data.forkFiles.length > 0) {
      const failed = await seedFiles(
        data.forkFiles.map((f: any) => ({
          project_id: project.id,
          path: f.path,
          content: f.content,
          language: f.language ?? "plaintext",
        })),
        "copied files",
      );
      if (failed) return failed;
      return { status: "ok" as const, project };
    }

    if (data.templateId) {
      const builtin = getTemplateById(data.templateId);
      let templateFiles = builtin?.files ?? null;
      if (!templateFiles) {
        const { data: dbTemplate } = await supabase
          .from("templates")
          .select("files")
          .eq("id", data.templateId)
          .maybeSingle();
        if (dbTemplate?.files && Array.isArray(dbTemplate.files)) {
          templateFiles = dbTemplate.files.filter(isTemplateFile);
        }
      }
      if (templateFiles && templateFiles.length > 0) {
        const failed = await seedFiles(
          templateFiles.map((f: { path: string; content: string; language: string }) => ({
            project_id: project.id,
            path: f.path,
            content: f.content,
            language: f.language,
          })),
          "template files",
        );
        if (failed) return failed;
      }
    } else {
      const starterFiles = stampControlledTemplateFiles(getStarterFiles(data.name, framework), controlledTemplate);
      const failed = await seedFiles(
        starterFiles.map((f) => ({ project_id: project.id, ...f })),
        "starter files",
      );
      if (failed) return failed;
    }

    return { status: "ok" as const, project };
}

const PUBLIC_PROJECT_SELECT =
  "id, user_id, name, description, framework, status, is_public, preview_url, deployed_url, template_id, slug, app_slug, seo_title, seo_description, og_image_url, favicon_url, remix_enabled, remix_count, remix_of, badge_hidden, total_views, created_at, updated_at" as const;

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

export async function getProject(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    const access = await getProjectAccess(supabase, data.id, user?.id);
    if (!canReadProjectFiles(access)) return { status: "not_found" as const };

    const { data: project, error } =
      access === "public"
        ? await supabase.from("projects").select(PUBLIC_PROJECT_SELECT).eq("id", data.id).maybeSingle()
        : await supabase.from("projects").select(PROJECT_SAFE_SELECT).eq("id", data.id).maybeSingle();

    if (error || !project) return { status: "not_found" as const };
    return {
      status: "ok" as const,
      project: safeProjectResponse(project as Record<string, unknown>),
    };
}

const projectUpdateSchema = z.object({
  id: z.string().uuid(),
  patch: z.record(z.unknown()),
});

export async function updateProject(data: any) {
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

    // ── keep `visibility` and `is_public` from drifting apart ────────────────
    //
    // Two columns answer "who can see this app" and only ONE is enforced: the RLS
    // policies on projects gate on `is_public`. Nothing reads `visibility` at the
    // database level. The publish panel writes only `visibility`, so the two
    // silently diverged - 25 projects ended up marked visibility='public' with
    // is_public=false, which meant RLS hid them from anonymous visitors and every
    // /app/:slug returned 404 while the owner believed the app was public.
    //
    // Both fields are owner-only (OWNER_ONLY_PROJECT_FIELDS), so deriving one from
    // the other adds no new authority - it only stops an owner from reaching a
    // state that cannot be expressed coherently.
    //
    // `visibility` is authoritative because it carries three states and is what the
    // UI actually sets. When only `is_public` is supplied, it is mapped back:
    // true -> "public"; false -> "private" rather than "workspace", because false
    // is a request to STOP being publicly visible and the conservative reading is
    // the right one for an access control (fail closed, not "slightly less open").
    //
    // This is a stopgap. The real fix is collapsing both into `publish_audience` -
    // see docs/access-model-consolidation.md. Until then, this guarantees the
    // invariant `is_public === (visibility === "public")` for every write that goes
    // through this function.
    if ("visibility" in updateFields || "is_public" in updateFields) {
      const nextVisibility =
        typeof updateFields.visibility === "string"
          ? updateFields.visibility
          : updateFields.is_public === true
            ? "public"
            : "private";
      updateFields.visibility = nextVisibility;
      updateFields.is_public = nextVisibility === "public";
    }

    if (generate_slug) {
      let slugName =
        typeof updateFields.name === "string" ? (updateFields.name as string) : undefined;
      const { data: existing } = await supabase
        .from("projects")
        .select("name, user_id")
        .eq("id", data.id)
        .maybeSingle();
      if (!slugName) slugName = existing?.name;
      const { data: slugData } = await supabase.rpc("generate_project_slug", {
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
}

export async function deleteProject(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await getProjectAccess(supabase, data.id, user.id);
    if (access !== "owner") return { status: "not_found" as const };

    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", data.id)
      .eq("user_id", user.id);

    if (error) return { status: "error" as const, message: error.message };
    return { status: "ok" as const, success: true };
}
