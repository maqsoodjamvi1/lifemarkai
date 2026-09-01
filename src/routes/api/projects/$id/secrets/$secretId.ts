import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getProjectAccess, canWriteProjectFiles } from "@/lib/project/access";
import type { Database } from "@/types/database";
import { encryptSecret, decryptSecret } from "@/lib/security/secret-crypto";

/**
 * Native /api/projects/:id/secrets/:secretId — GET (reveal+audit), DELETE, PATCH (rotate).
 * See ../secrets.ts for why every handler now checks project access, not
 * just that the caller is logged in.
 */
export const Route = createFileRoute("/api/projects/$id/secrets/$secretId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const access = await getProjectAccess(supabase, params.id, user.id);
        if (!canWriteProjectFiles(access)) return Response.json({ error: "Not found" }, { status: 404 });
        const { data: secret } = await supabase.from("project_secrets").select("id, key, value_enc, project_id").eq("id", params.secretId).eq("project_id", params.id).single();
        if (!secret) return Response.json({ error: "Not found" }, { status: 404 });
        let value: string;
        try {
          value = decryptSecret(secret.value_enc);
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Could not decrypt secret" },
            { status: 503 },
          );
        }
        await supabase.from("project_secrets").update({ last_used_at: new Date().toISOString() }).eq("id", params.secretId);
        await supabase.from("secret_access_logs").insert({ secret_id: params.secretId, project_id: params.id, user_id: user.id, action: "read" });
        return Response.json({ value });
      },
      DELETE: async ({ params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const access = await getProjectAccess(supabase, params.id, user.id);
        if (!canWriteProjectFiles(access)) return Response.json({ error: "Not found" }, { status: 404 });
        await supabase.from("secret_access_logs").insert({ secret_id: params.secretId, project_id: params.id, user_id: user.id, action: "delete" });
        await supabase.from("project_secrets").delete().eq("id", params.secretId).eq("project_id", params.id);
        return Response.json({ ok: true });
      },
      PATCH: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const access = await getProjectAccess(supabase, params.id, user.id);
        if (!canWriteProjectFiles(access)) return Response.json({ error: "Not found" }, { status: 404 });
        const body = (await request.json().catch(() => ({}))) as { value?: string; description?: string; rotate_after_days?: number };
        const patch: Database["public"]["Tables"]["project_secrets"]["Update"] = {
          updated_at: new Date().toISOString(),
        };
        if (body.value) {
          try {
            patch.value_enc = encryptSecret(body.value);
          } catch (err) {
            return Response.json(
              { error: err instanceof Error ? err.message : "Could not encrypt secret" },
              { status: 503 },
            );
          }
        }
        if (body.description !== undefined) patch.description = body.description;
        if (body.rotate_after_days !== undefined) patch.rotate_after_days = body.rotate_after_days;
        await supabase.from("project_secrets").update(patch).eq("id", params.secretId).eq("project_id", params.id);
        await supabase.from("secret_access_logs").insert({ secret_id: params.secretId, project_id: params.id, user_id: user.id, action: body.value ? "rotate" : "write" });
        return Response.json({ ok: true });
      },
    },
  },
});
