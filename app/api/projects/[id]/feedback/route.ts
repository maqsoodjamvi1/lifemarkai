import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

// GET — list feedback for project (owner only)
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await (supabase as any)
    .from("app_feedback")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ feedback: data ?? [] });
}

// POST — submit feedback (public, called by embedded widget)
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const body = await req.json() as { rating?: number; message?: string; page_url?: string };
  const ua = req.headers.get("user-agent") ?? undefined;

  const { error } = await (supabase as any).from("app_feedback").insert({
    project_id: id,
    rating:     body.rating ?? null,
    message:    body.message ?? null,
    page_url:   body.page_url ?? null,
    user_agent: ua,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
