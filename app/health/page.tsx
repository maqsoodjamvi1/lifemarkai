/**
 * /health — standalone diagnostic page.
 *
 * Renders a status table for the things most likely to cause a blank page
 * elsewhere in the app: required env vars, Supabase connection, and a few
 * spot-checks on critical tables. Hit this URL when the main app is blank
 * and you want one place that tells you what's missing.
 *
 * Deliberately:
 *   • No providers, no client components, no Supabase auth helpers.
 *     Runs as a plain server component so it survives env misconfiguration
 *     that would crash /dashboard or /editor.
 *   • No external dependencies beyond the ones already in the codebase.
 *   • Reads env vars but NEVER logs their values (only presence).
 *
 * The route is intentionally outside any (group) so it has no layout
 * inheritance that could blow up before render.
 */

import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Check {
  label: string;
  status: "ok" | "missing" | "error";
  detail?: string;
}

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];

  // ── Env vars — present / absent only, never the value ─────────────────────
  const requiredEnv = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_APP_URL",
  ];
  for (const key of requiredEnv) {
    checks.push({
      label: `env: ${key}`,
      status: process.env[key] ? "ok" : "missing",
    });
  }

  const optionalEnv = [
    { key: "OPENROUTER_API_KEY", note: "primary AI provider when AI_VIA_OPENROUTER=true" },
    { key: "OPENAI_API_KEY", note: "fallback when AI_VIA_OPENROUTER=false" },
    { key: "ANTHROPIC_API_KEY", note: "fallback for native Claude when AI_VIA_OPENROUTER=false" },
    { key: "STRIPE_SECRET_KEY", note: "required for billing" },
    { key: "RESEND_API_KEY", note: "required for transactional email" },
    { key: "SUPABASE_SERVICE_ROLE_KEY", note: "required for createAdminClient()" },
    { key: "TELEGRAM_BOT_SECRET", note: "Telegram bot kill switch (503 when missing)" },
    { key: "PLAYWRIGHT_ENABLED", note: "enables real Chromium for browser tests" },
    { key: "AIKIDO_API_KEY", note: "Aikido vendor scan" },
    { key: "WIZ_CLIENT_ID", note: "Wiz vendor scan" },
  ];
  for (const { key, note } of optionalEnv) {
    checks.push({
      label: `env: ${key}`,
      status: process.env[key] ? "ok" : "missing",
      detail: process.env[key] ? undefined : note,
    });
  }

  // ── Supabase connection — does a HEAD request to the projects table ──────
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      // Direct client (not the server helper) so we don't pull in cookies
      // and other server-only concerns that can themselves fail.
      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { error: projectsErr } = await supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .limit(1);
      checks.push({
        label: "supabase: projects table reachable",
        status: projectsErr ? "error" : "ok",
        detail: projectsErr?.message,
      });

      // Critical migrations spot-check — read a column added in each so we
      // know it's applied. If any migration is pending, the column is
      // missing and Supabase returns a `column does not exist` error.
      const migrationProbes: Array<{ table: string; column: string; migration: string }> = [
        { table: "projects", column: "disabled_skill_ids", migration: "055" },
        { table: "project_views", column: "user_agent", migration: "054" },
        { table: "profiles", column: "telegram_chat_id", migration: "056" },
      ];
      for (const { table, column, migration } of migrationProbes) {
        const { error } = await supabase.from(table).select(column).limit(1);
        checks.push({
          label: `migration ${migration}: ${table}.${column}`,
          status: error ? "missing" : "ok",
          detail: error
            ? `Probably not applied yet. Run \`supabase db push\`. (${error.message})`
            : undefined,
        });
      }
    } catch (err) {
      checks.push({
        label: "supabase: client init",
        status: "error",
        detail: err instanceof Error ? err.message : "unknown error",
      });
    }
  } else {
    checks.push({
      label: "supabase: connection",
      status: "missing",
      detail: "Cannot connect — URL or key missing above.",
    });
  }

  return checks;
}

function StatusPill({ status }: { status: Check["status"] }) {
  const meta: Record<Check["status"], { label: string; bg: string; fg: string }> = {
    ok:      { label: "OK",      bg: "#10b9811a", fg: "#10b981" },
    missing: { label: "MISSING", bg: "#f59e0b1a", fg: "#f59e0b" },
    error:   { label: "ERROR",   bg: "#ef44441a", fg: "#ef4444" },
  };
  const m = meta[status];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: m.bg,
        color: m.fg,
        fontFamily: "monospace",
      }}
    >
      {m.label}
    </span>
  );
}

export default async function HealthPage() {
  const checks = await runChecks();
  const ok = checks.filter((c) => c.status === "ok").length;
  const total = checks.length;

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "2rem",
        maxWidth: 800,
        margin: "0 auto",
        background: "#0a0a0f",
        color: "#e5e7eb",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>
        LifemarkAI — health check
      </h1>
      <p style={{ color: "#9ca3af", marginBottom: 24, fontSize: 13 }}>
        {ok}/{total} checks passed. Look at any MISSING or ERROR row below — fix
        those before the main app will render.
      </p>

      <div
        style={{
          border: "1px solid #1f2937",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {checks.map((c, i) => (
          <div
            key={c.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderTop: i === 0 ? "none" : "1px solid #1f2937",
              background: i % 2 === 0 ? "transparent" : "#11111a",
            }}
          >
            <div style={{ width: 80, flexShrink: 0 }}>
              <StatusPill status={c.status} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontFamily: "monospace" }}>{c.label}</div>
              {c.detail && (
                <div
                  style={{
                    fontSize: 11,
                    color: c.status === "ok" ? "#9ca3af" : "#fbbf24",
                    marginTop: 2,
                    wordBreak: "break-word",
                  }}
                >
                  {c.detail}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <p style={{ color: "#6b7280", fontSize: 11, marginTop: 24, lineHeight: 1.6 }}>
        This page is a standalone server component with no providers, no auth
        helpers, no client JS — so it renders even when the rest of the app
        crashes. If THIS page is blank, the error is in the root layout
        (app/layout.tsx) or the Next build itself. Run{" "}
        <code style={{ background: "#1f2937", padding: "2px 4px", borderRadius: 4 }}>
          npm run build
        </code>{" "}
        and read the error output.
      </p>
    </div>
  );
}
