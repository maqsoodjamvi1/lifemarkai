import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  summarizeCoreLoop,
  type CoreLoopAttempt,
  type CoreLoopStage,
} from "../src/lib/reliability/core-loop-report.ts";

function loadEnv(path = ".env.local") {
  try {
    for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Environment variables can be supplied by CI or the shell.
  }
}

loadEnv();

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const BASE_URL = (process.env.CORE_LOOP_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const SUPABASE_URL = required("VITE_SUPABASE_URL");
const SUPABASE_ANON_KEY = required("VITE_SUPABASE_ANON_KEY");
const EMAIL = required("CORE_LOOP_EMAIL");
const PASSWORD = required("CORE_LOOP_PASSWORD");
const PROVIDER = process.env.CORE_LOOP_DEPLOY_PROVIDER ?? "netlify";
const ATTEMPTS = Math.max(1, Number.parseInt(process.env.CORE_LOOP_ATTEMPTS ?? "50", 10));
const DEPLOY_TIMEOUT_MS = Math.max(30_000, Number.parseInt(process.env.CORE_LOOP_DEPLOY_TIMEOUT_MS ?? "180000", 10));
const PROMPTS_PATH = resolve(process.env.CORE_LOOP_PROMPTS ?? "tests/core-loop-prompts.json");
const REPORT_DIR = resolve(process.env.CORE_LOOP_REPORT_DIR ?? "artifacts/core-loop");

type DoneEvent = {
  done?: boolean;
  fileCount?: number;
  creditsUsed?: number;
  verification?: { passed?: boolean; fixesApplied?: number; errors?: string[] };
};

type Deployment = { status?: string; url?: string; id?: string };

function authCookie(session: { access_token: string; refresh_token: string; expires_at?: number; expires_in: number; token_type: string; user: unknown }) {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  return `sb-${ref}-auth-token=${encodeURIComponent(JSON.stringify(session))}`;
}

async function jsonFetch<T>(path: string, cookie: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...init.headers },
  });
  const text = await response.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return body as T;
}

async function readDoneEvent(response: Response): Promise<DoneEvent> {
  if (!response.ok || !response.body) throw new Error(`generation returned ${response.status}: ${await response.text()}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload) continue;
      try {
        const event = JSON.parse(payload) as DoneEvent;
        if (event.done) return event;
      } catch {
        // Ignore heartbeats and incomplete/non-JSON events.
      }
    }
    if (done) break;
  }
  throw new Error("generation stream ended without a done event");
}

async function waitForDeployment(projectId: string, cookie: string): Promise<Deployment> {
  const deadline = Date.now() + DEPLOY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const deployments = await jsonFetch<Deployment[]>(`/api/deploy?projectId=${encodeURIComponent(projectId)}`, cookie);
    const latest = deployments[0];
    if (latest?.status === "live" || latest?.status === "deployed") return latest;
    if (latest?.status === "failed") throw new Error("deployment reported failed");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 3_000));
  }
  throw new Error(`deployment did not become live within ${DEPLOY_TIMEOUT_MS}ms`);
}

async function projectCosts(admin: SupabaseClient | null, projectId: string, startedAt: string) {
  if (!admin) return { aiCostCents: null, sandboxCostCents: null, repairRounds: 0 };
  const [{ data: usage }, { data: runs }] = await Promise.all([
    admin.from("lifemark_cloud_usage")
      .select("ai_cents,compute_cents")
      .eq("project_id", projectId)
      .gte("recorded_at", startedAt),
    admin.from("generation_runs")
      .select("repair_rounds")
      .eq("project_id", projectId)
      .gte("created_at", startedAt),
  ]);
  return {
    aiCostCents: usage?.reduce((sum, row) => sum + Number(row.ai_cents ?? 0), 0) ?? null,
    // compute_cents is the platform's durable sandbox/compute cost ledger.
    sandboxCostCents: usage?.reduce((sum, row) => sum + Number(row.compute_cents ?? 0), 0) ?? null,
    repairRounds: runs?.reduce((sum, row) => sum + Number(row.repair_rounds ?? 0), 0) ?? 0,
  };
}

async function main() {
  const prompts = JSON.parse(readFileSync(PROMPTS_PATH, "utf8")) as string[];
  if (prompts.length === 0) throw new Error("prompt suite is empty");
  if (ATTEMPTS < 50) console.warn(`Warning: ${ATTEMPTS} attempts is useful for smoke testing but below the 50-run reliability gate.`);

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const admin = serviceKey ? createClient(SUPABASE_URL, serviceKey) : null;
  const { data: auth, error: authError } = await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (authError || !auth.session) throw new Error(`test-account sign-in failed: ${authError?.message ?? "no session"}`);
  const cookie = authCookie(auth.session);

  const profileClient = admin ?? client;
  const { data: profile, error: profileError } = await profileClient
    .from("profiles")
    .select("id,credits")
    .eq("id", auth.user.id)
    .single();
  if (profileError || !profile) throw new Error(`registration/profile proof failed: ${profileError?.message ?? "profile missing"}`);
  if (Number(profile.credits ?? 0) <= 0) throw new Error("credit proof failed: test account has no credits");

  const campaignStartedAt = new Date().toISOString();
  const attempts: CoreLoopAttempt[] = [];
  mkdirSync(REPORT_DIR, { recursive: true });

  for (let index = 0; index < ATTEMPTS; index += 1) {
    const prompt = prompts[index % prompts.length];
    const startedAt = new Date().toISOString();
    let stage: CoreLoopStage = "project";
    const attempt: CoreLoopAttempt = {
      index: index + 1,
      prompt,
      startedAt,
      generationPassed: false,
      previewPassed: false,
      deploymentPassed: false,
      publicUrlPassed: false,
      automaticRepairUsed: false,
      automaticRepairPassed: false,
      repairRounds: 0,
      manualInterventionRequired: false,
      creditsUsed: null,
      aiCostCents: null,
      sandboxCostCents: null,
    };
    try {
      const project = await jsonFetch<{ id: string }>("/api/projects", cookie, {
        method: "POST",
        body: JSON.stringify({ name: `Core Loop ${Date.now()} ${index + 1}`, framework: "react" }),
      });
      attempt.projectId = project.id;

      stage = "generation";
      const generationStarted = Date.now();
      const generationResponse = await fetch(`${BASE_URL}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ projectId: project.id, message: prompt, mode: "build", files: [], history: [] }),
      });
      const done = await readDoneEvent(generationResponse);
      attempt.generationMs = Date.now() - generationStarted;
      attempt.generationPassed = Number(done.fileCount ?? 0) > 0;
      attempt.creditsUsed = typeof done.creditsUsed === "number" ? done.creditsUsed : null;
      attempt.automaticRepairUsed = Number(done.verification?.fixesApplied ?? 0) > 0;
      attempt.automaticRepairPassed = attempt.automaticRepairUsed && done.verification?.passed === true;
      if (!attempt.generationPassed) throw new Error("generation completed without files");

      stage = "preview";
      const preview = await jsonFetch<{ ok?: boolean }>(`/api/projects/${project.id}/preview-verify`, cookie, {
        method: "POST",
        body: "{}",
      });
      attempt.previewPassed = preview.ok === true;
      if (!attempt.previewPassed) throw new Error("preview verification failed");

      stage = "deployment";
      await jsonFetch<{ deploymentId: string }>("/api/deploy", cookie, {
        method: "POST",
        body: JSON.stringify({ projectId: project.id, provider: PROVIDER }),
      });
      const deployment = await waitForDeployment(project.id, cookie);
      attempt.deploymentPassed = true;
      attempt.deployedUrl = deployment.url;

      stage = "public-url";
      if (!deployment.url) throw new Error("deployment became live without a URL");
      const publicResponse = await fetch(deployment.url, { redirect: "follow" });
      attempt.publicUrlPassed = publicResponse.ok;
      if (!attempt.publicUrlPassed) throw new Error(`public URL returned ${publicResponse.status}`);
    } catch (error) {
      attempt.failedStage = stage;
      attempt.error = error instanceof Error ? error.message : String(error);
      attempt.manualInterventionRequired = true;
    } finally {
      if (attempt.projectId) {
        const costs = await projectCosts(admin, attempt.projectId, startedAt);
        attempt.aiCostCents = costs.aiCostCents;
        attempt.sandboxCostCents = costs.sandboxCostCents;
        attempt.repairRounds = Math.max(attempt.repairRounds, costs.repairRounds);
      }
      attempts.push(attempt);
      const interim = { campaignStartedAt, baseUrl: BASE_URL, provider: PROVIDER, summary: summarizeCoreLoop(attempts), attempts };
      writeFileSync(resolve(REPORT_DIR, "latest.json"), `${JSON.stringify(interim, null, 2)}\n`);
      console.log(`[${attempt.index}/${ATTEMPTS}] ${attempt.publicUrlPassed ? "PASS" : `FAIL:${attempt.failedStage}`} ${prompt.slice(0, 70)}`);
    }
  }

  const summary = summarizeCoreLoop(attempts);
  const report = { campaignStartedAt, completedAt: new Date().toISOString(), baseUrl: BASE_URL, provider: PROVIDER, summary, attempts };
  const stampedPath = resolve(REPORT_DIR, `core-loop-${campaignStartedAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(stampedPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report: ${stampedPath}`);
  process.exit(summary.publicUrlSuccessRate === 1 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
