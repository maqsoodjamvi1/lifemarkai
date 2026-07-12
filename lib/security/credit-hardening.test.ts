import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("credit migration revokes public minting and enforces self-service identity", () => {
  const sql = read("supabase/migrations/085_secure_credit_accounting.sql");
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.add_credits[\s\S]*FROM PUBLIC/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.add_credits[\s\S]*TO service_role/i);
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.add_credits[^;]*authenticated/i,
  );
  assert.match(sql, /auth\.uid\(\) IS DISTINCT FROM p_user_id/);
  assert.match(sql, /credit reservation amount must be positive/);
});

test("provider work has atomic reservation and project metering RPCs", () => {
  const sql = read("supabase/migrations/085_secure_credit_accounting.sql");
  for (const name of [
    "reserve_credits",
    "settle_credit_reservation",
    "cancel_credit_reservation",
    "consume_project_ai_credits",
  ]) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`));
  }
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.settle_credit_reservation[^;]*authenticated/i,
  );
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.claim_free_credit_action\(/i);
});

test("managed credentials are moved to a server-only table", () => {
  const sql = read("supabase/migrations/086_move_cloud_credentials.sql");
  assert.match(sql, /REVOKE ALL ON TABLE public\.project_cloud_credentials FROM PUBLIC, anon, authenticated/i);
  assert.match(sql, /DROP COLUMN IF EXISTS cloud_service_key/i);
  assert.match(sql, /DROP COLUMN IF EXISTS cloud_db_password/i);

  const statusRoute = read("app/api/cloud/status/route.ts");
  assert.doesNotMatch(statusRoute, /\.select\(["']\*["']\)/);
  assert.doesNotMatch(statusRoute, /cloud_service_key\s*:/);
});

test("application AI value imports use the gateway-aware entrypoint", () => {
  const files = [
    "app/api/ai/chat/route.ts",
    "lib/ai/agent.ts",
    "lib/ai/self-verify.ts",
  ];
  for (const file of files) {
    assert.doesNotMatch(read(file), /import\s*\{[^}]*generateAI[^}]*\}\s*from\s*["'][^"']*provider["']/);
  }
});

test("admin clients are cookie-free and financial settlement is server-side", () => {
  const serverClient = read("lib/supabase/server.ts");
  const adminBody = serverClient.slice(serverClient.indexOf("export async function createAdminClient"));
  assert.match(adminBody, /createSupabaseClient<Database>/);
  assert.doesNotMatch(adminBody, /cookies\(/);
  assert.match(adminBody, /persistSession:\s*false/);

  const credits = read("lib/credits.ts");
  assert.match(credits, /createAdminClient\(\)/);
  assert.match(credits, /settle_credit_reservation/);
});

test("collaboration acceptance and private context have checked database boundaries", () => {
  const collaboration = read("supabase/migrations/087_collaboration_invite_security.sql");
  assert.match(collaboration, /CREATE POLICY "collaborators_self_or_owner_select"/);
  assert.match(collaboration, /CREATE OR REPLACE FUNCTION public\.accept_project_invite_token/);
  assert.match(collaboration, /CREATE OR REPLACE FUNCTION public\.accept_team_invite/);
  assert.match(collaboration, /FOR UPDATE/);

  const privateContext = read("supabase/migrations/088_project_private_context.sql");
  assert.match(privateContext, /CREATE TABLE IF NOT EXISTS public\.project_private_context/);
  assert.match(privateContext, /ALTER TABLE public\.project_private_context ENABLE ROW LEVEL SECURITY/);
  assert.match(privateContext, /- 'context_summary'/);
});

test("Stripe events are claimed atomically before webhook mutations", () => {
  const statusMigration = read("supabase/migrations/089_stripe_event_claim_status.sql");
  assert.match(statusMigration, /status IN \('processing', 'completed', 'failed'\)/);
  const webhook = read("app/api/billing/webhook/route.ts");
  const claim = webhook.indexOf('.from("stripe_events")');
  const routing = webhook.indexOf("switch (event.type)");
  assert.ok(claim >= 0 && routing > claim);
  assert.match(
    webhook.slice(claim, routing),
    /\.insert\(\{[\s\S]*id:\s*event\.id,[\s\S]*type:\s*event\.type,[\s\S]*status:\s*"processing"/,
  );
  assert.doesNotMatch(
    webhook.slice(0, routing),
    /\.from\("stripe_events"\)[\s\S]{0,160}\.maybeSingle\(\)/,
  );
});

test("local code execution routes are opt-in and do not inherit application secrets", () => {
  const analyze = read("app/api/ai/analyze/route.ts");
  assert.match(analyze, /ALLOW_UNSANDBOXED_ANALYZE/);
  assert.doesNotMatch(analyze, /env:\s*\{\s*\.\.\.process\.env/);

  const testRunner = read("app/api/tests/run/route.ts");
  assert.match(testRunner, /ALLOW_UNSANDBOXED_TEST_RUNS/);
  assert.doesNotMatch(testRunner, /env:\s*\{\s*\.\.\.process\.env/);
});
