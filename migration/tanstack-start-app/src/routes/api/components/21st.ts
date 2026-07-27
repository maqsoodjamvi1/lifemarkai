// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/**
 * Native /api/components/21st — import a 21st.dev component into a project file.
 * POST { projectId, url, targetPath? }.
 */
function parseUrl(url: string): { slug: string } | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("21st.dev")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const slug = parts[parts.length - 1];
    if (!slug) return null;
    return { slug };
  } catch { return null; }
}

export const Route = createFileRoute("/api/components/21st")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { projectId, url, targetPath } = (await request.json()) as {
          projectId: string; url: string; targetPath?: string;
        };
        if (!projectId || !url) return Response.json({ error: "projectId and url required" }, { status: 400 });

        const { data: project } = await supabase
          .from("projects").select("id, framework").eq("id", projectId).eq("user_id", user.id).single();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

        const parsed = parseUrl(url);
        if (!parsed) return Response.json({ error: "Not a valid 21st.dev URL" }, { status: 400 });

        let code = "";
        let componentName = parsed.slug.replace(/[^a-zA-Z0-9]+/g, "");
        componentName = componentName.charAt(0).toUpperCase() + componentName.slice(1);

        try {
          const rawRes = await fetch(`${url.replace(/\/$/, "")}/raw`, {
            headers: { "User-Agent": "LifemarkAI-21st-import/1.0" },
          });
          if (rawRes.ok) {
            code = await rawRes.text();
          } else {
            const pageRes = await fetch(url, { headers: { "User-Agent": "LifemarkAI-21st-import/1.0" } });
            if (!pageRes.ok) return Response.json({ error: `21st.dev returned ${pageRes.status}` }, { status: 502 });
            const html = await pageRes.text();
            const m = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
            if (m) {
              code = m[1]
                .replace(/<[^>]+>/g, "")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");
            }
          }
        } catch (err) {
          return Response.json({ error: `Fetch failed: ${(err as Error).message}` }, { status: 502 });
        }

        if (!code.trim()) {
          return Response.json({
            error: "Could not extract component source from 21st.dev. Paste the code manually instead.",
            hint: "Open the component on 21st.dev, copy the code, and use the AI chat to add it.",
          }, { status: 422 });
        }

        const finalPath = targetPath ?? `src/components/${componentName}.tsx`;

        const { data: existing } = await supabase
          .from("project_files")
          .select("id")
          .eq("project_id", projectId)
          .eq("path", finalPath)
          .maybeSingle();

        if (existing) {
          await supabase.from("project_files").update({ content: code, language: "tsx" }).eq("id", existing.id);
        } else {
          await supabase.from("project_files").insert({ project_id: projectId, path: finalPath, language: "tsx", content: code });
        }

        return Response.json({
          ok: true,
          component: componentName,
          path: finalPath,
          bytes: code.length,
          next_step: `Import ${componentName} from "${finalPath.replace(/\.tsx$/, "")}" in your page.`,
        });
      },
    },
  },
});
