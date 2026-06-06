// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { BUILT_IN_TEMPLATES, getTemplateById } from "@/lib/templates/built-in";

// GET /api/templates           — list all templates
// GET /api/templates?id=<id>   — get single template with files
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    // Return single template (built-in first, then DB)
    const builtin = getTemplateById(id);
    if (builtin) return NextResponse.json(builtin);

    const supabase = await createClient();
    const { data, error } = await (supabase as any)
      .from("templates")
      .select("*")
      .eq("id", id)
      .eq("is_public", true)
      .single();

    if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(data);
  }

  // List: built-in templates merged with DB templates
  const supabase = await createClient();
  const { data: dbTemplates } = await (supabase as any)
    .from("templates")
    .select("id, name, description, category, is_featured, fork_count, preview_url, is_public, created_at")
    .eq("is_public", true)
    .order("fork_count", { ascending: false })
    .limit(50);

  // Built-in templates as the base, DB templates appended
  const builtinMeta = BUILT_IN_TEMPLATES.map(({ files: _files, ...rest }) => ({
    ...rest,
    preview_url: null,
    created_at: "",
    is_public: true,
    source: "builtin" as const,
  }));

  const dbMeta = (dbTemplates ?? []).map((t) => ({ ...t, source: "db" as const }));

  // Deduplicate by id — built-in wins
  const builtinIds = new Set(builtinMeta.map((t) => t.id));
  const merged = [
    ...builtinMeta,
    ...dbMeta.filter((t) => !builtinIds.has(t.id)),
  ];

  return NextResponse.json(merged);
}
