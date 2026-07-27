// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

function obfuscate(value: string): string {
  const key = process.env.SECRETS_ENCRYPTION_KEY ?? "lifemarkai-default-key-32chars!!";
  return Buffer.from(value.split("").map((c, i) => c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).toString("base64");
}

/** Native /api/projects/:id/secrets — GET (masked + rotation), POST upsert. */
export const Route = createFileRoute("/api/projects/$id/secrets")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { data: secrets } = await (supabase as any).from("project_secrets")
          .select("id, key, description, last_used_at, rotate_after_days, created_at, updated_at")
          .eq("project_id", params.id).order("created_at", { ascending: false });
        const daysOld = (s: { updated_at: string }) => Math.floor((Date.now() - new Date(s.updated_at).getTime()) / (1000 * 60 * 60 * 24));
        const enriched = (secrets ?? []).map((s: any) => ({ ...s, days_old: daysOld(s), needs_rotation: daysOld(s) >= s.rotate_after_days }));
        return Response.json({ secrets: enriched });
      },
      POST: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { key: string; value: string; description?: string; rotate_after_days?: number };
        if (!body.key || !body.value) return Response.json({ error: "key and value required" }, { status: 400 });
        const sanitizedKey = body.key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        const { data, error } = await (supabase as any).from("project_secrets").upsert({
          project_id: params.id, key: sanitizedKey, value_enc: obfuscate(body.value),
          description: body.description ?? null, rotate_after_days: body.rotate_after_days ?? 90, updated_at: new Date().toISOString(),
        }, { onConflict: "project_id,key" }).select("id, key, description, rotate_after_days, created_at, updated_at").single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        await (supabase as any).from("secret_access_logs").insert({ secret_id: data.id, project_id: params.id, user_id: user.id, action: "write" });
        return Response.json({ secret: data });
      },
    },
  },
});
