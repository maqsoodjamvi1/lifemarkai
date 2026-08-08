import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

function obfuscate(value: string): string {
  const key = process.env.SECRETS_ENCRYPTION_KEY ?? "lifemarkai-default-key-32chars!!";
  return Buffer.from(value.split("").map((c, i) => c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).toString("base64");
}
function deobfuscate(enc: string): string {
  const key = process.env.SECRETS_ENCRYPTION_KEY ?? "lifemarkai-default-key-32chars!!";
  const bytes = Buffer.from(enc, "base64");
  return Array.from(bytes).map((b, i) => String.fromCharCode(b ^ key.charCodeAt(i % key.length))).join("");
}

/** Native /api/projects/:id/secrets/:secretId — GET (reveal+audit), DELETE, PATCH (rotate). */
export const Route = createFileRoute("/api/projects/$id/secrets/$secretId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { data: secret } = await supabase.from("project_secrets").select("id, key, value_enc, project_id").eq("id", params.secretId).eq("project_id", params.id).single();
        if (!secret) return Response.json({ error: "Not found" }, { status: 404 });
        await supabase.from("project_secrets").update({ last_used_at: new Date().toISOString() }).eq("id", params.secretId);
        await supabase.from("secret_access_logs").insert({ secret_id: params.secretId, project_id: params.id, user_id: user.id, action: "read" });
        return Response.json({ value: deobfuscate(secret.value_enc) });
      },
      DELETE: async ({ params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        await supabase.from("secret_access_logs").insert({ secret_id: params.secretId, project_id: params.id, user_id: user.id, action: "delete" });
        await supabase.from("project_secrets").delete().eq("id", params.secretId).eq("project_id", params.id);
        return Response.json({ ok: true });
      },
      PATCH: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { value?: string; description?: string; rotate_after_days?: number };
        const patch: Database["public"]["Tables"]["project_secrets"]["Update"] = {
          updated_at: new Date().toISOString(),
        };
        if (body.value) patch.value_enc = obfuscate(body.value);
        if (body.description !== undefined) patch.description = body.description;
        if (body.rotate_after_days !== undefined) patch.rotate_after_days = body.rotate_after_days;
        await supabase.from("project_secrets").update(patch).eq("id", params.secretId).eq("project_id", params.id);
        await supabase.from("secret_access_logs").insert({ secret_id: params.secretId, project_id: params.id, user_id: user.id, action: body.value ? "rotate" : "write" });
        return Response.json({ ok: true });
      },
    },
  },
});
