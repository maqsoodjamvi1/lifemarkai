import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

// Simple XOR-based obfuscation (replace with real AES in production via Supabase Vault or KMS)
function obfuscate(value: string): string {
  const key = process.env.SECRETS_ENCRYPTION_KEY ?? "lifemarkai-default-key-32chars!!";
  return Buffer.from(value.split("").map((c, i) =>
    c.charCodeAt(0) ^ key.charCodeAt(i % key.length)
  )).toString("base64");
}

function deobfuscate(enc: string): string {
  const key = process.env.SECRETS_ENCRYPTION_KEY ?? "lifemarkai-default-key-32chars!!";
  const bytes = Buffer.from(enc, "base64");
  return Array.from(bytes).map((b, i) =>
    String.fromCharCode(b ^ key.charCodeAt(i % key.length))
  ).join("");
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: secrets } = await (supabase as any)
    .from("project_secrets")
    .select("id, key, description, last_used_at, rotate_after_days, created_at, updated_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  // Log access
  const now = new Date().toISOString();
  const daysOld = (s: { updated_at: string; rotate_after_days: number }) => {
    const updated = new Date(s.updated_at).getTime();
    return Math.floor((Date.now() - updated) / (1000 * 60 * 60 * 24));
  };

  const enriched = (secrets ?? []).map((s: any) => ({
    ...s,
    days_old: daysOld(s),
    needs_rotation: daysOld(s) >= s.rotate_after_days,
  }));

  return NextResponse.json({ secrets: enriched });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { key: string; value: string; description?: string; rotate_after_days?: number };
  if (!body.key || !body.value) return NextResponse.json({ error: "key and value required" }, { status: 400 });

  const sanitizedKey = body.key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const enc = obfuscate(body.value);

  const { data, error } = await (supabase as any)
    .from("project_secrets")
    .upsert({
      project_id: id,
      key: sanitizedKey,
      value_enc: enc,
      description: body.description ?? null,
      rotate_after_days: body.rotate_after_days ?? 90,
      updated_at: new Date().toISOString(),
    }, { onConflict: "project_id,key" })
    .select("id, key, description, rotate_after_days, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log
  await (supabase as any).from("secret_access_logs").insert({
    secret_id: data.id, project_id: id, user_id: user.id, action: "write",
  });

  return NextResponse.json({ secret: data });
}
