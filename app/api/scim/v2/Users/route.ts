// @ts-nocheck
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { resolveScimRole, type WorkspaceScimConfig } from "@/lib/workspace/identity";

export const runtime = "nodejs";

async function authenticateScim(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  const hash = createHash("sha256").update(token).digest("hex");
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
    name: {
      formatted: row.display_name ?? row.email,
    },
    emails: [{ value: row.email, primary: true }],
    active: row.active,
    groups: ((row.groups as string[]) ?? []).map((g) => ({ value: g, display: g })),
    meta: {
      resourceType: "User",
      created: row.created_at,
      lastModified: row.updated_at,
    },
  };
}

/** GET/POST /api/scim/v2/Users */
export async function GET(req: NextRequest) {
  const ownerId = await authenticateScim(req);
  if (!ownerId) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const supabase = await createAdminClient();
  const filter = req.nextUrl.searchParams.get("filter");
  let query = (supabase as any).from("workspace_scim_users").select("*").eq("owner_id", ownerId);
  if (filter?.includes("userName eq")) {
    const m = filter.match(/userName eq "([^"]+)"/i);
    if (m?.[1]) query = query.eq("email", m[1].toLowerCase());
  }
  const { data: rows } = await query.limit(200);

  return NextResponse.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: rows?.length ?? 0,
    Resources: (rows ?? []).map(scimUserResource),
  });
}

export async function POST(req: NextRequest) {
  const ownerId = await authenticateScim(req);
  if (!ownerId) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    userName?: string;
    externalId?: string;
    active?: boolean;
    name?: { formatted?: string; givenName?: string; familyName?: string };
    emails?: Array<{ value: string; primary?: boolean }>;
    groups?: Array<{ value: string }>;
  };

  const email = (body.userName ?? body.emails?.[0]?.value ?? "").toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ detail: "userName or email required" }, { status: 400 });
  }

  const supabase = await createAdminClient();
  const { data: settings } = await (supabase as any)
    .from("workspace_identity_settings")
    .select("scim_config, verified_domains")
    .eq("owner_id", ownerId)
    .maybeSingle();

  const verified: string[] = settings?.verified_domains ?? [];
  const emailDomain = email.split("@")[1] ?? "";
  if (verified.length > 0 && !verified.some((d: string) => d.toLowerCase() === emailDomain.toLowerCase())) {
    return NextResponse.json({ detail: "Email domain not verified for SCIM provisioning" }, { status: 403 });
  }

  const groups = (body.groups ?? []).map((g) => g.value).filter(Boolean);
  const scimCfg = (settings?.scim_config ?? { groupMappings: [] }) as WorkspaceScimConfig;
  const role = resolveScimRole(groups, scimCfg.groupMappings ?? []);
  const displayName =
    (body.name?.formatted ??
      [body.name?.givenName, body.name?.familyName].filter(Boolean).join(" ")) ||
    email;

  const externalId = body.externalId ?? email;
  const { data: row, error } = await (supabase as any)
    .from("workspace_scim_users")
    .upsert({
      owner_id: ownerId,
      external_id: externalId,
      email,
      display_name: displayName,
      active: body.active !== false,
      groups,
      role,
      updated_at: new Date().toISOString(),
    }, { onConflict: "owner_id,external_id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  return NextResponse.json(scimUserResource(row), { status: 201 });
}
