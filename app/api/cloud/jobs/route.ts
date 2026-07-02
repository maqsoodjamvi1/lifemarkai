// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import {
  isManagementConfigured,
  runManagedSql,
  queryManagedSql,
} from "@/lib/cloud/management";
import { parseCloudToolPermissions } from "@/lib/cloud/permissions";

/**
 * Scheduled jobs (pg_cron) on the project's managed backend — Lovable Cloud
 * "Jobs" tab parity.
 *
 * GET    /api/cloud/jobs?projectId=...          → list cron jobs
 * POST   /api/cloud/jobs { projectId, name, schedule, command } → create
 * DELETE /api/cloud/jobs?projectId=...&name=... → unschedule
 *
 * All operations run SQL against cron.* on the dedicated backend via the
 * Management API. Blocked entirely when the Database tool permission is
 * "never" (same gate auto-wire.ts respects).
 */

const JOB_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
// Dollar-quote tag used to safely embed the job command in cron.schedule().
const DOLLAR_TAG = "$lifemark_job$";

/** Minimal 5-field cron validation (minute hour dom month dow). */
function isValidCronExpression(expr: string): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((f) => /^[\dA-Za-z*,/-]+$/.test(f));
}

async function loadContext(req: NextRequest, projectId: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!projectId) return { error: NextResponse.json({ error: "projectId required" }, { status: 400 }) };

  const { data: project } = await supabase
    .from("projects")
    .select("id, cloud_enabled, cloud_status, cloud_project_ref")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return { error: NextResponse.json({ error: "Project not found" }, { status: 404 }) };
  if (!project.cloud_enabled) {
    return { error: NextResponse.json({ error: "Cloud not enabled for this project" }, { status: 400 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("cloud_tool_permissions")
    .eq("id", user.id)
    .single();
  const perms = parseCloudToolPermissions(profile?.cloud_tool_permissions);
  if (perms.database === "never") {
    return {
      error: NextResponse.json(
        { error: 'Database tools are set to "Never" in Cloud permissions — jobs are disabled.' },
        { status: 403 }
      ),
    };
  }

  if (!project.cloud_project_ref || !isManagementConfigured()) {
    return {
      error: NextResponse.json({
        available: false,
        reason: "Scheduled jobs need a dedicated managed backend. Cloud is running in local mode.",
        jobs: [],
      }),
    };
  }

  return { user, project, ref: project.cloud_project_ref as string };
}

export async function GET(req: NextRequest) {
  const ctx = await loadContext(req, req.nextUrl.searchParams.get("projectId"));
  if ("error" in ctx) return ctx.error;

  // Best-effort enable — tolerate failure (pg_cron ships on Supabase projects).
  await runManagedSql(ctx.ref, "CREATE EXTENSION IF NOT EXISTS pg_cron;");

  const result = await queryManagedSql<{
    jobid: number;
    jobname: string | null;
    schedule: string;
    command: string;
    active: boolean;
  }>(
    ctx.ref,
    "SELECT jobid, jobname, schedule, command, active FROM cron.job ORDER BY jobid;"
  );

  if (!result.ok) {
    return NextResponse.json({
      available: false,
      reason: `pg_cron is not available on this backend: ${result.error ?? "query failed"}`,
      jobs: [],
    });
  }

  return NextResponse.json({ available: true, jobs: result.rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    projectId: string;
    name: string;
    schedule: string;
    command: string;
  };
  const ctx = await loadContext(req, body.projectId ?? null);
  if ("error" in ctx) return ctx.error;

  const name = (body.name ?? "").trim();
  const schedule = (body.schedule ?? "").trim();
  const command = (body.command ?? "").trim();

  if (!JOB_NAME_RE.test(name)) {
    return NextResponse.json(
      { error: "Job name must be 1–64 characters: letters, numbers, _ or -" },
      { status: 400 }
    );
  }
  if (!isValidCronExpression(schedule)) {
    return NextResponse.json(
      { error: 'Invalid cron expression — expected 5 fields, e.g. "*/5 * * * *"' },
      { status: 400 }
    );
  }
  if (!command) {
    return NextResponse.json({ error: "SQL command required" }, { status: 400 });
  }
  if (command.includes(DOLLAR_TAG)) {
    return NextResponse.json({ error: "Command contains a reserved token" }, { status: 400 });
  }

  await runManagedSql(ctx.ref, "CREATE EXTENSION IF NOT EXISTS pg_cron;");

  // name + schedule are regex-validated above (no quotes possible); the
  // command is embedded via dollar-quoting so arbitrary SQL is safe to store.
  const res = await runManagedSql(
    ctx.ref,
    `SELECT cron.schedule('${name}', '${schedule}', ${DOLLAR_TAG}${command}${DOLLAR_TAG});`
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: `Failed to schedule job: ${res.error ?? "unknown error"}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, name, schedule });
}

export async function DELETE(req: NextRequest) {
  const ctx = await loadContext(req, req.nextUrl.searchParams.get("projectId"));
  if ("error" in ctx) return ctx.error;

  const name = (req.nextUrl.searchParams.get("name") ?? "").trim();
  if (!JOB_NAME_RE.test(name)) {
    return NextResponse.json({ error: "Invalid job name" }, { status: 400 });
  }

  const res = await runManagedSql(ctx.ref, `SELECT cron.unschedule('${name}');`);
  if (!res.ok) {
    return NextResponse.json(
      { error: `Failed to remove job: ${res.error ?? "unknown error"}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, removed: name });
}
