// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  parseCloudToolPermissions,
  DEFAULT_CLOUD_TOOL_PERMISSIONS,
  type CloudToolId,
  type CloudToolPermission,
} from "@/lib/cloud/permissions";

const TOOL_IDS = Object.keys(DEFAULT_CLOUD_TOOL_PERMISSIONS) as CloudToolId[];
const VALID: CloudToolPermission[] = ["allow", "ask", "never"];

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("cloud_tool_permissions")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    permissions: parseCloudToolPermissions(profile?.cloud_tool_permissions),
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { permissions?: Partial<Record<CloudToolId, CloudToolPermission>> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("cloud_tool_permissions")
    .eq("id", user.id)
    .maybeSingle();

  const current = parseCloudToolPermissions(profile?.cloud_tool_permissions);
  const incoming = body.permissions ?? {};

  for (const [key, value] of Object.entries(incoming)) {
    if (!TOOL_IDS.includes(key as CloudToolId)) continue;
    if (!VALID.includes(value as CloudToolPermission)) continue;
    current[key as CloudToolId] = value as CloudToolPermission;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ cloud_tool_permissions: current })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ permissions: current });
}
