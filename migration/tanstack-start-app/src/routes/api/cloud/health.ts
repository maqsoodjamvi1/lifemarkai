// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { isManagementConfigured, queryManagedSql } from "@/lib/cloud/management";

/**
 * GET /api/cloud/health — MEASURED database health for a Cloud project.
 *
 * This route used to synthesize every number it returned. Uptime came from the
 * provisioning timestamp, and everything else was arithmetic on unrelated counts:
 *
 *   ramUsed          = min(ramTotal, 80 + fileCount * 2)
 *   cpuLoadPct       = min(95, 10 + deployCount % 40)
 *   diskUsedMb       = fileCount * 1.5
 *   activeConns      = 1 + deployCount % 12
 *
 * None of it touched the database. Adding a file to your project "used more RAM";
 * deploying 40 times wrapped your CPU load back to 10%. It then derived
 * memory-pressure / cpu-high / disk-low flags from those numbers and told the user
 * "Your Cloud database is healthy" — a health verdict computed from data that had
 * nothing to do with health. That is worse than having no panel, because a made-up
 * "healthy" is indistinguishable from a real one right up to the outage.
 *
 * Now every value is read from the managed Postgres instance itself, and anything
 * that CANNOT be measured from SQL is not reported:
 *
 *   MEASURED     uptime (pg_postmaster_start_time), database size
 *                (pg_database_size), active/max connections (pg_stat_database,
 *                max_connections), cache hit ratio, transaction rollback ratio,
 *                deadlocks, table count
 *   CAPACITY     instance RAM/CPU from the tier table — real configuration, and
 *                labelled as capacity rather than usage
 *   NOT REPORTED RAM used and CPU load. The Management API's SQL endpoint cannot
 *                see host metrics, so there is no honest number to give. The
 *                response says so explicitly in `unavailable` instead of guessing.
 */
export const Route = createFileRoute("/api/cloud/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const projectId = new URL(request.url).searchParams.get("projectId");
        if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });

        const { data: project } = await supabase.from("projects")
          .select("id, cloud_enabled, cloud_instance, cloud_provisioned_at, cloud_project_ref")
          .eq("id", projectId).eq("user_id", user.id).single();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
        if (!project.cloud_enabled) {
          return Response.json({ error: "Cloud not enabled for this project" }, { status: 400 });
        }

        // No dedicated instance, or no Management API credentials → nothing to
        // measure. Say that, rather than filling the panel with plausible numbers.
        if (!project.cloud_project_ref || !isManagementConfigured()) {
          return Response.json({
            status: "unknown",
            measured: false,
            flags: [],
            metrics: {},
            unavailable: ["uptime", "connections", "disk", "cache_hit_ratio"],
            summary: project.cloud_project_ref
              ? "Health metrics need the Supabase Management API to be configured on the server."
              : "This project runs in local Cloud mode, so there is no dedicated instance to measure.",
          });
        }

        const { data: tier } = await supabase.from("lifemark_cloud_instances")
          .select("ram_mb, cpu_units").eq("tier", project.cloud_instance).single();

        interface HealthRow {
          uptime_seconds: number;
          db_size_bytes: number;
          active_connections: number;
          max_connections: number;
          cache_hit_ratio: number | null;
          rollback_ratio: number | null;
          deadlocks: number;
          table_count: number;
        }

        const result = await queryManagedSql<HealthRow>(
          project.cloud_project_ref,
          `SELECT
             EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time()))::bigint AS uptime_seconds,
             pg_database_size(current_database())                            AS db_size_bytes,
             (SELECT numbackends FROM pg_stat_database
               WHERE datname = current_database())                           AS active_connections,
             current_setting('max_connections')::int                         AS max_connections,
             (SELECT CASE WHEN blks_hit + blks_read = 0 THEN NULL
                          ELSE round(blks_hit::numeric / (blks_hit + blks_read), 4) END
                FROM pg_stat_database WHERE datname = current_database())     AS cache_hit_ratio,
             (SELECT CASE WHEN xact_commit + xact_rollback = 0 THEN NULL
                          ELSE round(xact_rollback::numeric / (xact_commit + xact_rollback), 4) END
                FROM pg_stat_database WHERE datname = current_database())     AS rollback_ratio,
             (SELECT deadlocks FROM pg_stat_database
               WHERE datname = current_database())                           AS deadlocks,
             (SELECT count(*) FROM information_schema.tables
               WHERE table_schema = 'public')                                AS table_count`,
        );

        if (!result.ok || !result.rows?.length) {
          // A failed measurement is reported as a failed measurement.
          return Response.json({
            status: "unknown",
            measured: false,
            flags: [],
            metrics: {},
            error: result.error ?? "The health query returned no rows",
            summary: "Could not reach the database to measure health.",
          }, { status: 502 });
        }

        const row = result.rows[0];
        const connPct = row.max_connections > 0
          ? row.active_connections / row.max_connections
          : 0;

        // Flags derive ONLY from measured values, and each threshold is a real
        // Postgres health heuristic rather than a number chosen to look plausible.
        const flags: string[] = [];
        if (connPct > 0.8) flags.push("connections-near-limit");
        if (row.cache_hit_ratio != null && row.cache_hit_ratio < 0.9) flags.push("low-cache-hit-ratio");
        if (row.rollback_ratio != null && row.rollback_ratio > 0.1) flags.push("high-rollback-rate");
        if (row.deadlocks > 0) flags.push("deadlocks-detected");
        if (row.table_count === 0) flags.push("no-tables");

        return Response.json({
          status: flags.length === 0 ? "healthy" : "warning",
          measured: true,
          flags,
          metrics: {
            uptime_hours: Math.round(Number(row.uptime_seconds) / 3600),
            db_size_mb: Math.round(Number(row.db_size_bytes) / (1024 * 1024)),
            active_connections: Number(row.active_connections),
            max_connections: Number(row.max_connections),
            connections_used_pct: Math.round(connPct * 100),
            cache_hit_pct: row.cache_hit_ratio == null ? null : Math.round(row.cache_hit_ratio * 100),
            rollback_pct: row.rollback_ratio == null ? null : Math.round(row.rollback_ratio * 100),
            deadlocks: Number(row.deadlocks),
            table_count: Number(row.table_count),
          },
          // Instance configuration, not utilisation — labelled so the UI cannot
          // present capacity as though it were a live reading.
          capacity: {
            ram_mb: tier?.ram_mb ?? null,
            cpu_units: tier?.cpu_units ?? null,
          },
          // Named explicitly so the panel renders "not available" instead of a
          // number, and so nobody re-adds a synthetic one later.
          unavailable: ["ram_used", "cpu_load"],
          summary: flags.length === 0
            ? "Measured healthy: connections, cache hit ratio and transaction health are all within normal ranges."
            : `Health flags raised: ${flags.join(", ")}.`,
        });
      },
    },
  },
});
