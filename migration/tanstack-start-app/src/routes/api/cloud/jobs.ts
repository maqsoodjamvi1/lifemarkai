import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { isManagementConfigured,runManagedSql,queryManagedSql } from "@/lib/cloud/management";
import { parseCloudToolPermissions } from "@/lib/cloud/permissions";

/** Native /api/cloud/jobs — pg_cron scheduled jobs on the managed backend. */
const JOB_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DOLLAR_TAG = "$lifemark_job$";

function isValidCronExpression(expr: string): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((f) => /^[\dA-Za-z*,/-]+$/.test(f));
}

async function loadContext(projectId: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!projectId) return { error: Response.json({ error: "projectId required" }, { status: 400 }) };

  const { data: project } = await supabase.from("projects")
    .select("id, cloud_enabled, cloud_status, cloud_project_ref").eq("id", projectId).eq("user_id", user.id).single();
  if (!project) return { error: Response.json({ error: "Project not found" }, { status: 404 }) };
  if (!project.cloud_enabled) return { error: Response.json({ error: "Cloud not enabled for this project" }, { status: 400 }) };

  const { data: profile } = await supabase.from("profiles").select("cloud_tool_permissions").eq("id", user.id).single();
  const perms = parseCloudToolPermissions(profile?.cloud_tool_permissions);
  if (perms.database === "never") {
    return { error: Response.json({ error: 'Database tools are set to "Never" in Cloud permissions — jobs are disabled.' }, { status: 403 }) };
  }
  if (!project.cloud_project_ref || !isManagementConfigured()) {
    return { error: Response.json({ available: false, reason: "Scheduled jobs need a dedicated managed backend. Cloud is running in local mode.", jobs: [] }) };
  }
  return { user, project, ref: project.cloud_project_ref as string };
}

export const Route = createFileRoute("/api/cloud/jobs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await loadContext(new URL(request.url).searchParams.get("projectId"));
        if ("error" in ctx) return ctx.error;
        await runManagedSql(ctx.ref, "CREATE EXTENSION IF NOT EXISTS pg_cron;");
        const result = await queryManagedSql(ctx.ref, "SELECT jobid, jobname, schedule, command, active FROM cron.job ORDER BY jobid;");
        if (!result.ok) return Response.json({ available: false, reason: `pg_cron is not available on this backend: ${result.error ?? "query failed"}`, jobs: [] });
        return Response.json({ available: true, jobs: result.rows });
      },
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { projectId?: string; name?: string; schedule?: string; command?: string };
        const ctx = await loadContext(body.projectId ?? null);
        if ("error" in ctx) return ctx.error;
        const name = (body.name ?? "").trim();
        const schedule = (body.schedule ?? "").trim();
        const command = (body.command ?? "").trim();
        if (!JOB_NAME_RE.test(name)) return Response.json({ error: "Job name must be 1–64 characters: letters, numbers, _ or -" }, { status: 400 });
        if (!isValidCronExpression(schedule)) return Response.json({ error: 'Invalid cron expression — expected 5 fields, e.g. "*/5 * * * *"' }, { status: 400 });
        if (!command) return Response.json({ error: "SQL command required" }, { status: 400 });
        if (command.includes(DOLLAR_TAG)) return Response.json({ error: "Command contains a reserved token" }, { status: 400 });

        await runManagedSql(ctx.ref, "CREATE EXTENSION IF NOT EXISTS pg_cron;");
        const res = await runManagedSql(ctx.ref, `SELECT cron.schedule('${name}', '${schedule}', ${DOLLAR_TAG}${command}${DOLLAR_TAG});`);
        if (!res.ok) return Response.json({ error: `Failed to schedule job: ${res.error ?? "unknown error"}` }, { status: 502 });
        return Response.json({ ok: true, name, schedule });
      },
      DELETE: async ({ request }) => {
        const sp = new URL(request.url).searchParams;
        const ctx = await loadContext(sp.get("projectId"));
        if ("error" in ctx) return ctx.error;
        const name = (sp.get("name") ?? "").trim();
        if (!JOB_NAME_RE.test(name)) return Response.json({ error: "Invalid job name" }, { status: 400 });
        const res = await runManagedSql(ctx.ref, `SELECT cron.unschedule('${name}');`);
        if (!res.ok) return Response.json({ error: `Failed to remove job: ${res.error ?? "unknown error"}` }, { status: 502 });
        return Response.json({ ok: true, removed: name });
      },
    },
  },
});
