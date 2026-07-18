import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { getProjectAccess, canWriteProjectFiles } from "@/lib/project/access";
import { saveConnectorDecision, type ConnectorDecision } from "@/lib/integrations/connector-exec";
import { CONNECTOR_REGISTRY } from "@/lib/integrations/connector-registry";
import { logAuditFromRequest } from "@/lib/audit/log";

interface Params { params: Promise<{ id: string }> }

/** GET — current per-connector write permissions for the project. */
export async function GET(_: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canWriteProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project } = await (supabase as any)
    .from("projects").select("metadata").eq("id", projectId).single();
  const meta = (project?.metadata ?? {}) as { connector_permissions?: Record<string, string> };
  return NextResponse.json({ permissions: meta.connector_permissions ?? {} });
}

/** POST — record an approval decision: { connector, decision: "once" | "always" | "never" }.
 *  Lovable parity: the chat approval card's Allow once / Always allow / Never. */
export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canWriteProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { connector, decision } = (await req.json().catch(() => ({}))) as {
    connector?: string; decision?: ConnectorDecision;
  };
  const id = connector?.toLowerCase?.() ?? "";
  if (!CONNECTOR_REGISTRY[id]) {
    return NextResponse.json({ error: `Unknown connector "${connector}"` }, { status: 400 });
  }
  if (decision !== "once" && decision !== "always" && decision !== "never") {
    return NextResponse.json({ error: "decision must be once | always | never" }, { status: 400 });
  }

  await saveConnectorDecision(supabase, projectId, id, decision);

  void logAuditFromRequest(req, {
    userId: user.id,
    action: "connector.permission.update",
    resourceType: "project",
    resourceId: projectId,
    metadata: { connector: id, decision },
  });
  return NextResponse.json({ ok: true, connector: id, decision });
}
