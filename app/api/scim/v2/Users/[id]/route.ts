// @ts-nocheck
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import type { WorkspaceScimConfig } from "@/lib/workspace/identity";

export const runtime = "nodejs";

async function authenticateScim(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const hash = createHash("sha256").update(auth.slice(7).trim()).digest("hex");
  const supabase = await createAdminClient();
  const { data } = await (supabase as any)
    .from("workspace_identity_settings")
    .select("owner_id, scim_config")
    .eq("scim_api_key_hash", hash)
    .maybeSingle();
  if (!data?.owner_id) return null;
  const scim = data.scim_config as WorkspaceScimConfig | null;
  if (!scim?.enabled) return null;
  return data.owner_id as string;
}

function scimUserResource(row: Record<string, unknown>) {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: row.id,
    externalId: row.external_id,
    userName: row.email,
    active: row.active,
    meta: { resourceType: "User" },
  };
}

/** PATCH /api/scim/v2/Users/[id] — deactivate or update SCIM user. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ownerId = await authenticateScim(req);
  if (!ownerId) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    Operations?: Array<{ op: string; path?: string; value?: unknown }>;
    active?: boolean;
  };

  let active: boolean | undefined = body.active;
  if (body.Operations) {
    for (const op of body.Operations) {
      if (op.op === "replace" && op.path === "active") {
        active = op.value === true || op.value === "true";
      }
    }
  }

  const supabase = await createAdminClient();
  const { data: row, error } = await (supabase as any)
    .from("workspace_scim_users")
    .update({
      ...(active !== undefined ? { active } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", ownerId)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ detail: "User not found" }, { status: 404 });
  }

  return NextResponse.json(scimUserResource(row));
}

/** GET /api/scim/v2/Users/[id] */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ownerId = await authenticateScim(req);
  if (!ownerId) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = await createAdminClient();
  const { data: row } = await (supabase as any)
    .from("workspace_scim_users")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("id", id)
    .maybeSingle();

  if (!row) return NextResponse.json({ detail: "Not found" }, { status: 404 });
  return NextResponse.json(scimUserResource(row));
}
