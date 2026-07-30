// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import type { WorkspaceScimConfig } from "@/lib/workspace/identity";

async function authenticateScim(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const hash = createHash("sha256").update(auth.slice(7).trim()).digest("hex");
  const supabase = createAdminClient();
  const { data } = await (supabase as any).from("workspace_identity_settings").select("owner_id, scim_config").eq("scim_api_key_hash", hash).maybeSingle();
  if (!data?.owner_id) return null;
  const scim = data.scim_config as WorkspaceScimConfig | null;
  if (!scim?.enabled) return null;
  return data.owner_id as string;
}

function scimUserResource(row: Record<string, unknown>) {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: row.id, externalId: row.external_id, userName: row.email, active: row.active,
    meta: { resourceType: "User" },
  };
}

/** Native /api/scim/v2/Users/:id — GET one, PATCH (deactivate/update). Bearer-token auth. */
export const Route = createFileRoute("/api/scim/v2/Users/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const ownerId = await authenticateScim(request);
        if (!ownerId) return Response.json({ detail: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { Operations?: Array<{ op: string; path?: string; value?: unknown }>; active?: boolean };
        let active: boolean | undefined = body.active;
        if (body.Operations) {
          for (const op of body.Operations) {
            if (op.op === "replace" && op.path === "active") active = op.value === true || op.value === "true";
          }
        }
        const supabase = createAdminClient();
        const { data: row, error } = await (supabase as any).from("workspace_scim_users").update({
          ...(active !== undefined ? { active } : {}), updated_at: new Date().toISOString(),
        }).eq("owner_id", ownerId).eq("id", params.id).select("*").maybeSingle();
        if (error || !row) return Response.json({ detail: "User not found" }, { status: 404 });
        return Response.json(scimUserResource(row));
      },
      GET: async ({ request, params }) => {
        const ownerId = await authenticateScim(request);
        if (!ownerId) return Response.json({ detail: "Unauthorized" }, { status: 401 });
        const supabase = createAdminClient();
        const { data: row } = await (supabase as any).from("workspace_scim_users").select("*").eq("owner_id", ownerId).eq("id", params.id).maybeSingle();
        if (!row) return Response.json({ detail: "Not found" }, { status: 404 });
        return Response.json(scimUserResource(row));
      },
    },
  },
});
