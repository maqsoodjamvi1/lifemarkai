import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { BUILT_IN_TEMPLATES,getTemplateById } from "@/lib/templates/built-in";
import type { Template } from "@/types/database";

type TemplateSummary = Pick<
  Template,
  "id" | "name" | "description" | "category" | "is_featured" | "preview_url" | "is_public" | "created_at"
> & { fork_count: number };

/**
 * Native /api/templates — list templates (built-in merged with DB) or fetch one.
 *   GET             — merged list (built-in wins on id collision)
 *   GET ?id=<id>    — single template with files (built-in first, then DB)
 */
export const Route = createFileRoute("/api/templates")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id");

        if (id) {
          const builtin = getTemplateById(id);
          if (builtin) return Response.json(builtin);

          const supabase = await createClient();
          const { data, error } = await supabase
            .from("templates")
            .select("*")
            .eq("id", id)
            .eq("is_public", true)
            .single();

          if (error || !data) return Response.json({ error: "Not found" }, { status: 404 });
          return Response.json(data);
        }

        const supabase = await createClient();
        const { data: dbTemplates } = await supabase
          .from("templates")
          .select("id, name, description, category, is_featured, fork_count, preview_url, is_public, created_at")
          .eq("is_public", true)
          .order("fork_count", { ascending: false })
          .limit(50);

        const builtinMeta = BUILT_IN_TEMPLATES.map(({ files: _files, ...rest }) => ({
          ...rest,
          preview_url: null,
          created_at: "",
          is_public: true,
          source: "builtin" as const,
        }));

        const dbMeta = ((dbTemplates ?? []) as TemplateSummary[]).map((template) => ({ ...template, source: "db" as const }));

        const builtinIds = new Set(builtinMeta.map((t) => t.id));
        const merged = [...builtinMeta, ...dbMeta.filter((template) => !builtinIds.has(template.id))];

        return Response.json(merged);
      },
    },
  },
});
