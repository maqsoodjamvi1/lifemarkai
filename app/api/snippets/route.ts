import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/snippets?q=search&tag=tag&scope=mine|public|all
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const tag = req.nextUrl.searchParams.get("tag") ?? "";
  const scope = req.nextUrl.searchParams.get("scope") ?? "all"; // mine | public | all

  let query = (supabase as any)
    .from("prompt_snippets")
    .select("id, user_id, title, content, tags, is_public, use_count, created_at, updated_at")
    .order("use_count", { ascending: false })
    .limit(100);

  if (scope === "mine") {
    query = query.eq("user_id", user.id);
  } else if (scope === "public") {
    query = query.eq("is_public", true);
  }
  // "all" relies on RLS to return mine + public

  if (q) {
    query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`);
  }
  if (tag) {
    query = query.contains("tags", [tag]);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// POST /api/snippets — create a new snippet
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const title: string = (body.title ?? "").trim();
  const content: string = (body.content ?? "").trim();
  const tags: string[] = Array.isArray(body.tags) ? body.tags.map(String) : [];
  const is_public: boolean = !!body.is_public;

  if (!title || title.length > 100) {
    return NextResponse.json({ error: "Title must be 1–100 characters." }, { status: 400 });
  }
  if (!content || content.length > 4000) {
    return NextResponse.json({ error: "Content must be 1–4000 characters." }, { status: 400 });
  }

  const { data, error } = await (supabase as any)
    .from("prompt_snippets")
    .insert({ user_id: user.id, title, content, tags, is_public })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
