import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string; secretId: string }> }

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
  const { id, secretId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: secret } = await (supabase as any)
    .from("project_secrets")
    .select("id, key, value_enc, project_id")
    .eq("id", secretId)
    .eq("project_id", id)
    .single();

  if (!secret) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Mark last used
  await (supabase as any).from("project_secrets").update({ last_used_at: new Date().toISOString() }).eq("id", secretId);

  // Audit
  await (supabase as any).from("secret_access_logs").insert({
    secret_id: secretId, project_id: id, user_id: user.id, action: "read",
  });

  return NextResponse.json({ value: deobfuscate(secret.value_enc) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, secretId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await (supabase as any).from("secret_access_logs").insert({
    secret_id: secretId, project_id: id, user_id: user.id, action: "delete",
  });

  await (supabase as any)
    .from("project_secrets")
    .delete()
    .eq("id", secretId)
    .eq("project_id", id);

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, secretId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { value?: string; description?: string; rotate_after_days?: number };
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.value) patch.value_enc = obfuscate(body.value);
  if (body.description !== undefined) patch.description = body.description;
  if (body.rotate_after_days !== undefined) patch.rotate_after_days = body.rotate_after_days;

  await (supabase as any).from("project_secrets").update(patch).eq("id", secretId).eq("project_id", id);

  await (supabase as any).from("secret_access_logs").insert({
    secret_id: secretId, project_id: id, user_id: user.id, action: body.value ? "rotate" : "write",
  });

  return NextResponse.json({ ok: true });
}
