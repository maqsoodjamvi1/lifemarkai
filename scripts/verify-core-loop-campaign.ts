import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  assessCoreLoopReleaseGate,
  summarizeCoreLoop,
  type CoreLoopAttempt,
  type CoreLoopStage,
} from "../src/lib/reliability/core-loop-report.ts";
import { getCoreLoopPolicy } from "../src/lib/reliability/core-loop-policy.ts";

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

const firstEnv = (...names: string[]) =>
  names.map((name) => process.env[name]?.trim()).find(Boolean);

const missing: string[] = [];
const requireOne = (label: string, ...names: string[]) => {
  const value = firstEnv(...names);
  if (!value) missing.push(`${label} (${names.join(" or ")})`);
  return value ?? "";
};

const BASE_URL = (process.env.CORE_LOOP_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const SUPABASE_URL = requireOne("Supabase URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_ANON_KEY = requireOne(
  "Supabase anonymous key",
  "VITE_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
);
const EMAIL = requireOne("test-account email", "CORE_LOOP_EMAIL");
const PASSWORD = requireOne("test-account password", "CORE_LOOP_PASSWORD");
if (missing.length > 0) {
  throw new Error(`Core-loop configuration is incomplete:\n- ${missing.join("\n- ")}\nSee docs/CORE_LOOP_RELIABILITY.md.`);
}
const CORE_LOOP_POLICY = getCoreLoopPolicy();
const PROVIDER = CORE_LOOP_POLICY.deploymentProvider;
const ATTEMPTS = Math.max(1, Number.parseInt(process.env.CORE_LOOP_ATTEMPTS ?? "50", 10));
const DEPLOY_TIMEOUT_MS = Math.max(30_000, Number.parseInt(process.env.CORE_LOOP_DEPLOY_TIMEOUT_MS ?? "180000", 10));
const PROMPTS_PATH = resolve(process.env.CORE_LOOP_PROMPTS ?? "tests/core-loop-prompts.json");
const REPORT_DIR = resolve(process.env.CORE_LOOP_REPORT_DIR ?? "artifacts/core-loop");
const REQUIRE_REGISTRATION_PROOF =
  process.env.CORE_LOOP_REQUIRE_REGISTRATION_PROOF === "true" || ATTEMPTS >= 50;

type DoneEvent = {
  done?: boolean;
  error?: string;
  fileCount?: number;
  creditsUsed?: number;
  verification?: { passed?: boolean; fixesApplied?: number; errors?: string[] };
};

type Deployment = { status?: string; url?: string; id?: string };
type SandboxPreview = {
  enabled?: boolean;
  ok?: boolean;
  ready?: boolean;
  previewUrl?: string | null;
  sandboxId?: string | null;
  phase?: string | null;
  phaseDetail?: string | null;
  error?: string;
};

async function startRemotePreview(projectId: string, cookie: string) {
  const start = await jsonFetch<SandboxPreview>(
    `/api/projects/${projectId}/sandbox-preview`,
    cookie,
    { method: "POST", body: "{}" },
  );
  if (start.enabled === false) throw new Error("remote sandbox preview is not configured");
  if (start.ok === false && start.phase === "error") {
    throw new Error(start.error ?? start.phaseDetail ?? "remote preview failed to start");
  }
  if (start.previewUrl && start.sandboxId && start.ready !== false) {
    return { previewUrl: start.previewUrl, sandboxId: start.sandboxId };
  }

  const deadline = Date.now() + DEPLOY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const state = await jsonFetch<SandboxPreview>(
      `/api/projects/${projectId}/sandbox-preview?phaseOnly=1`,
      cookie,
    );
    if (state.previewUrl && state.sandboxId && state.ok === true && state.phase === "ready") {
      return { previewUrl: state.previewUrl, sandboxId: state.sandboxId };
    }
    if (state.phase === "error" || state.phase === "unreachable") {
      throw new Error(state.error ?? state.phaseDetail ?? `remote preview entered ${state.phase}`);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  throw new Error(`remote preview did not become ready within ${DEPLOY_TIMEOUT_MS}ms`);
}

async function stopRemotePreview(
  projectId: string,
  sandboxId: string,
  cookie: string,
) {
  try {
    await jsonFetch(
      `/api/projects/${projectId}/sandbox-preview/stop`,
      cookie,
      { method: "POST", body: JSON.stringify({ sandboxId }) },
    );
  } catch (error) {
    console.warn(
      `Could not stop sandbox ${sandboxId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

type RegistrationProof = {
  attempted: boolean;
  passed: boolean;
  creditsGranted: number | null;
  error?: string;
};

function registrationEmail(baseEmail: string) {
  const [local, domain] = baseEmail.split("@");
  if (!local || !domain) throw new Error("CORE_LOOP_EMAIL must be a valid email address");
  return `${local}+registration-${Date.now()}-${randomUUID().slice(0, 8)}@${domain}`;
}

async function proveFreshRegistration(
  admin: SupabaseClient | null,
): Promise<RegistrationProof> {
  if (!admin) {
    return {
      attempted: false,
      passed: false,
      creditsGranted: null,
      error: "SUPABASE_SERVICE_ROLE_KEY is required to verify and clean up a fresh registration",
    };
  }

  const email = registrationEmail(EMAIL);
  const password = `CoreLoop-${randomUUID()}-aA1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  const userId = data.user?.id;
  if (error || !userId) {
    return {
      attempted: true,
      passed: false,
      creditsGranted: null,
      error: error?.message ?? "Supabase admin createUser returned no user",
    };
  }

  try {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("credits")
        .eq("id", userId)
        .maybeSingle();
      if (profileError) {
        return {
          attempted: true,
          passed: false,
          creditsGranted: null,
          error: profileError.message,
        };
      }
      if (profile) {
        const creditsGranted = Number(profile.credits ?? 0);
        return {
          attempted: true,
          passed: creditsGranted > 0,
          creditsGranted,
          ...(creditsGranted > 0 ? {} : { error: "fresh registration received no credits" }),
        };
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    }
    return {
      attempted: true,
      passed: false,
      creditsGranted: null,
      error: "profile trigger did not create a row within 15 seconds",
    };
  } finally {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(userId);
    if (cleanupError) {
      console.warn(`Registration probe cleanup failed for ${userId}: ${cleanupError.message}`);
    }
  }
}

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
        if (event.error) throw new Error(event.error);
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
  const registrationProof = await proveFreshRegistration(admin);
  if (REQUIRE_REGISTRATION_PROOF && !registrationProof.passed) {
    throw new Error(`fresh registration proof failed: ${registrationProof.error ?? "unknown error"}`);
  }
  if (!registrationProof.passed) {
    console.warn(`Registration proof not completed: ${registrationProof.error ?? "unknown error"}`);
  }
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
    let sandboxId: string | null = null;
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
        body: JSON.stringify({
          projectId: project.id,
          message: prompt,
          mode: CORE_LOOP_POLICY.mode,
          framework: CORE_LOOP_POLICY.framework,
          model: CORE_LOOP_POLICY.primaryModel,
          modelManuallySelected: true,
          forceBuild: true,
          clarifyFirst: false,
          coreLoop: true,
          files: [],
          history: [],
        }),
      });
      const done = await readDoneEvent(generationResponse);
      attempt.generationMs = Date.now() - generationStarted;
      attempt.generationPassed = Number(done.fileCount ?? 0) > 0;
      attempt.creditsUsed = typeof done.creditsUsed === "number" ? done.creditsUsed : null;
      attempt.automaticRepairUsed = Number(done.verification?.fixesApplied ?? 0) > 0;
      attempt.automaticRepairPassed = attempt.automaticRepairUsed && done.verification?.passed === true;
      if (!attempt.generationPassed) throw new Error("generation completed without files");

      stage = "preview";
      const remotePreview = await startRemotePreview(project.id, cookie);
      sandboxId = remotePreview.sandboxId;
      const previewResponse = await fetch(remotePreview.previewUrl, { redirect: "follow" });
      if (!previewResponse.ok) {
        throw new Error(`remote preview returned ${previewResponse.status}`);
      }
      const preview = await jsonFetch<{ ok?: boolean }>(`/api/projects/${project.id}/preview-verify`, cookie, {
        method: "POST",
        body: JSON.stringify({ previewUrl: remotePreview.previewUrl }),
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
      if (attempt.projectId && sandboxId) {
        await stopRemotePreview(attempt.projectId, sandboxId, cookie);
      }
      if (attempt.projectId) {
        const costs = await projectCosts(admin, attempt.projectId, startedAt);
        attempt.aiCostCents = costs.aiCostCents;
        attempt.sandboxCostCents = costs.sandboxCostCents;
        attempt.repairRounds = Math.max(attempt.repairRounds, costs.repairRounds);
      }
      attempts.push(attempt);
      const interim = { campaignStartedAt, baseUrl: BASE_URL, registrationProof, policy: CORE_LOOP_POLICY, provider: PROVIDER, summary: summarizeCoreLoop(attempts), attempts };
      writeFileSync(resolve(REPORT_DIR, "latest.json"), `${JSON.stringify(interim, null, 2)}\n`);
      console.log(`[${attempt.index}/${ATTEMPTS}] ${attempt.publicUrlPassed ? "PASS" : `FAIL:${attempt.failedStage}`} ${prompt.slice(0, 70)}`);
    }
  }

  const summary = summarizeCoreLoop(attempts);
  const releaseGate = assessCoreLoopReleaseGate(summary, registrationProof.passed);
  const report = { campaignStartedAt, completedAt: new Date().toISOString(), baseUrl: BASE_URL, registrationProof, policy: CORE_LOOP_POLICY, provider: PROVIDER, summary, releaseGate, attempts };
  const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
  const stampedPath = resolve(REPORT_DIR, `core-loop-${campaignStartedAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(resolve(REPORT_DIR, "latest.json"), serializedReport);
  writeFileSync(stampedPath, serializedReport);
  console.log(JSON.stringify({ summary, releaseGate }, null, 2));
  console.log(`Report: ${stampedPath}`);
  const smokePassed =
    ATTEMPTS < 50 &&
    summary.generationSuccessRate === 1 &&
    summary.previewSuccessRate === 1 &&
    summary.deploymentSuccessRate === 1 &&
    summary.publicUrlSuccessRate === 1;
  process.exit((releaseGate.eligible ? releaseGate.passed : smokePassed) ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
