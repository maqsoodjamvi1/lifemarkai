/**
 * Post-migration runtime checks against the live Supabase database.
 * Logs NDJSON to debug-32a6e2.log (session 32a6e2).
 */
import { appendFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOG = join(ROOT, "debug-32a6e2.log");
const SESSION = "32a6e2";

function log(payload: Record<string, unknown>) {
  const line = JSON.stringify({ sessionId: SESSION, timestamp: Date.now(), runId: "migration-verify", ...payload });
  appendFileSync(LOG, `${line}\n`);
  console.log(line);
}

let passed = 0;
let failed = 0;

function assert(hypothesisId: string, name: string, ok: boolean, data?: Record<string, unknown>) {
  if (ok) passed++;
  else failed++;
  log({ hypothesisId, location: "verify-migrations-runtime.ts", message: name, data: { ok, ...data } });
}

const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
// ── A: new columns readable ───────────────────────────────────────────────────
const { data: profileRow, error: profileErr } = await sb
  .from("profiles")
  .select("id, credits, cloud_tool_permissions, cloud_free_month, cloud_free_used_cents, daily_credits_granted_on")
  .limit(1)
  .maybeSingle();

assert("A", "profiles migration columns", !profileErr, {
  error: profileErr?.message,
  hasCloudPerms: profileRow?.cloud_tool_permissions != null,
  creditsType: typeof profileRow?.credits,
  creditsValue: profileRow?.credits,
});

const { data: groupRow, error: groupErr } = await sb
  .from("project_groups")
  .select("id, parent_id")
  .limit(1)
  .maybeSingle();

assert("A", "project_groups.parent_id column", !groupErr, {
  error: groupErr?.message,
  parentIdPresent: groupRow ? "parent_id" in groupRow : true,
});

const { data: projectRow, error: projectErr } = await sb
  .from("projects")
  .select("id, cloud_project_ref, cloud_supabase_url, cloud_anon_key")
  .limit(1)
  .maybeSingle();

assert("A", "projects cloud columns (064)", !projectErr, {
  error: projectErr?.message,
  hasCloudRef: projectRow ? "cloud_project_ref" in projectRow : true,
});

// ── B: grant_daily_credits RPC ────────────────────────────────────────────────
if (profileRow?.id) {
  const { data: granted, error: grantErr } = await sb.rpc("grant_daily_credits", {
    p_user_id: profileRow.id,
  });
  assert("B", "grant_daily_credits RPC", !grantErr, {
    error: grantErr?.message,
    granted,
    grantedType: typeof granted,
  });
} else {
  assert("B", "grant_daily_credits RPC", false, { error: "no profile row" });
}

// ── C: fractional deduct_credits (0.5) round-trip ───────────────────────────
if (profileRow?.id) {
  const before = Number(profileRow.credits ?? 0);
  const { data: deducted, error: deductErr } = await sb.rpc("deduct_credits", {
    user_id: profileRow.id,
    amount: 0.5,
    action: "migration_verify",
  });
  const { data: afterRow } = await sb
    .from("profiles")
    .select("credits")
    .eq("id", profileRow.id)
    .single();
  const after = Number(afterRow?.credits ?? 0);

  // Restore the 0.5 if deduction succeeded
  if (deducted === true) {
    await sb.rpc("add_credits", {
      p_user_id: profileRow.id,
      p_amount: 0.5,
      p_action: "migration_verify_restore",
    });
  }

  assert("C", "deduct_credits fractional 0.5", !deductErr && (before < 0.5 || deducted === true), {
    error: deductErr?.message,
    before,
    after,
    deducted,
    delta: before - after,
  });
} else {
  assert("C", "deduct_credits fractional 0.5", false, { error: "no profile row" });
}

// ── D: bill_cloud_usage RPC (065) ─────────────────────────────────────────────
if (profileRow?.id) {
  const { data: balance, error: billErr } = await sb.rpc("bill_cloud_usage", {
    p_user_id: profileRow.id,
    p_cents: 0,
  });
  assert("D", "bill_cloud_usage RPC", !billErr, {
    error: billErr?.message,
    balance,
    balanceType: typeof balance,
  });
} else {
  assert("D", "bill_cloud_usage RPC", false, { error: "no profile row" });
}

// ── E: get_user_stats RPC (066) ───────────────────────────────────────────────
if (profileRow?.id) {
  const { data: stats, error: statsErr } = await sb.rpc("get_user_stats", {
    p_user_id: profileRow.id,
  });
  const row = Array.isArray(stats) ? stats[0] : stats;
  assert("E", "get_user_stats RPC", !statsErr && row != null, {
    error: statsErr?.message,
    stats: row,
    liveProjects: row?.live_projects,
  });
} else {
  assert("E", "get_user_stats RPC", false, { error: "no profile row" });
}

// ── F: cloud_tool_permissions parseable ───────────────────────────────────────
if (profileRow?.cloud_tool_permissions) {
  const perms = profileRow.cloud_tool_permissions as Record<string, string>;
  const keys = ["database", "storage", "edge_functions", "secrets", "ai", "deploy"];
  const allPresent = keys.every((k) => k in perms);
  assert("F", "cloud_tool_permissions defaults", allPresent, { perms });
} else {
  assert("F", "cloud_tool_permissions defaults", false, { error: "missing or null" });
}

log({
  location: "verify-migrations-runtime.ts",
  message: "summary",
  data: { passed, failed, healthy: failed === 0 },
});

process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  log({ hypothesisId: "Z", location: "verify-migrations-runtime.ts", message: "fatal", data: { ok: false, error: String(err) } });
  process.exit(1);
});
