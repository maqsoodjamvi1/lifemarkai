import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/account/privacy — fetch privacy preferences
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("training_opt_out, analytics_opt_out, marketing_emails")
    .eq("id", user.id)
    .single();

  // Fall back to defaults if columns don't exist yet
  return NextResponse.json({
    training_opt_out: profile?.training_opt_out ?? false,
    analytics_opt_out: profile?.analytics_opt_out ?? false,
    marketing_emails: profile?.marketing_emails ?? true,
  });
}

// PATCH /api/account/privacy — update privacy preferences
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, boolean> = {};

  if (typeof body.training_opt_out === "boolean") updates.training_opt_out = body.training_opt_out;
  if (typeof body.analytics_opt_out === "boolean") updates.analytics_opt_out = body.analytics_opt_out;
  if (typeof body.marketing_emails === "boolean") updates.marketing_emails = body.marketing_emails;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await (supabase as any)
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
