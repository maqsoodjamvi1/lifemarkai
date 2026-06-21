/**
 * Live generation-quality smoke — ERP + booking builds via /api/ai/chat SSE.
 * Logs NDJSON to debug-06409d.log (session 06409d).
 */
import { appendFileSync, readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { classifyBuildIntent, MIN_FILES_BY_TYPE } from "../lib/ai/build-intent";

const LOG = "debug-06409d.log";
const SESSION = "06409d";
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const DEMO_EMAIL = "demo@lifemarkai.app";
const DEMO_PASSWORD = "DemoPassword123!";
const DEADLINE_MS = 900_000;

function log(
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
) {
  const entry = {
    sessionId: SESSION,
    timestamp: Date.now(),
    runId: "build-quality",
    location: "verify-build-quality-live.ts",
    message,
    data,
    hypothesisId,
  };
  appendFileSync(LOG, `${JSON.stringify(entry)}\n`);
  console.log(JSON.stringify(entry));
}

function loadEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
}

function authCookie(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user: unknown;
}, supabaseUrl: string) {
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  return `sb-${projectRef}-auth-token=${encodeURIComponent(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type ?? "bearer",
    user: session.user,
  }))}`;
}

async function createEmptyProject(cookie: string): Promise<string> {
  const res = await fetch(`${BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      name: `Quality test ${Date.now()}`,
      description: "Automated Lovable parity quality check",
      framework: "react",
    }),
  });
  if (!res.ok) throw new Error(`create project ${res.status}`);
  const project = (await res.json()) as { id: string };
  return project.id;
}

interface BuildResult {
  done: boolean;
  fileCount: number;
  paths: string[];
  verification?: { passed?: boolean; engine?: string; errors?: string[] };
  creditsUsed?: number;
  elapsedMs: number;
}

async function runBuild(
  cookie: string,
  projectId: string,
  prompt: string,
): Promise<BuildResult> {
  const start = Date.now();
  const res = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      projectId,
      message: prompt,
      mode: "build",
      files: [],
      history: [],
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`chat ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let result: BuildResult = {
    done: false,
    fileCount: 0,
    paths: [],
    elapsedMs: 0,
  };

  while (Date.now() - start < DEADLINE_MS) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    for (const line of buf.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const evt = JSON.parse(raw) as {
          done?: boolean;
          fileCount?: number;
          files?: Array<{ path: string }>;
          verification?: BuildResult["verification"];
          creditsUsed?: number;
        };
        if (evt.done) {
          result = {
            done: true,
            fileCount: evt.fileCount ?? evt.files?.length ?? 0,
            paths: (evt.files ?? []).map((f) => f.path),
            verification: evt.verification,
            creditsUsed: evt.creditsUsed,
            elapsedMs: Date.now() - start,
          };
          reader.cancel().catch(() => {});
          return result;
        }
      } catch {
        /* partial SSE chunk */
      }
    }
  }

  result.elapsedMs = Date.now() - start;
  const streamed = [...new Set([...buf.matchAll(/"streamedFile"\s*:\s*"([^"]+)"/g)].map((m) => m[1]))];
  if (!result.done && streamed.length > 0) {
    result.paths = streamed;
    result.fileCount = streamed.length;
  }
  reader.cancel().catch(() => {});
  return result;
}

function scoreBuild(
  appType: keyof typeof MIN_FILES_BY_TYPE,
  result: BuildResult,
) {
  const minFiles = MIN_FILES_BY_TYPE[appType];
  const hasPages = result.paths.some((p) => /pages\/|routes/i.test(p));
  const hasData = result.paths.some((p) => /data\//i.test(p));
  const hasComponents = result.paths.filter((p) => /components\//i.test(p)).length;
  const meetsMin = result.fileCount >= minFiles;
  const verifyOk = result.verification?.passed !== false;

  return { minFiles, hasPages, hasData, hasComponents, meetsMin, verifyOk };
}

const CASES = [
  {
    id: "erp",
    prompt:
      "Build an ERP inventory management system with dashboard, products, and orders",
  },
  {
    id: "booking",
    prompt:
      "Build a salon booking app with calendar and appointments",
  },
] as const;

async function main() {
  const env = loadEnv();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data: auth, error } = await sb.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (error || !auth.session) {
    log("demo sign-in failed", { error: error?.message }, "H0");
    process.exit(1);
  }
  log("demo sign-in ok", {}, "H0");

  const cookie = authCookie(auth.session, env.NEXT_PUBLIC_SUPABASE_URL);
  let passed = 0;
  let failed = 0;

  for (const c of CASES) {
    const intent = classifyBuildIntent(c.prompt);
    const projectId = await createEmptyProject(cookie);
    log(`starting ${c.id} build`, { projectId, appType: intent.appType, minFiles: intent.minFiles }, "H1");

    const result = await runBuild(cookie, projectId, c.prompt);
    const score = scoreBuild(intent.appType, result);

    const qualityOk =
      result.done &&
      score.meetsMin &&
      score.hasPages &&
      (score.hasData || score.hasComponents >= 3);

    if (qualityOk) passed++;
    else failed++;

    log(`${c.id} build result`, {
      done: result.done,
      fileCount: result.fileCount,
      minFiles: score.minFiles,
      meetsMin: score.meetsMin,
      hasPages: score.hasPages,
      hasData: score.hasData,
      componentCount: score.hasComponents,
      verifyPassed: result.verification?.passed,
      verifyEngine: result.verification?.engine,
      creditsUsed: result.creditsUsed,
      elapsedSec: Math.round(result.elapsedMs / 1000),
      samplePaths: result.paths.slice(0, 8),
      qualityOk,
    }, "H2");
  }

  log("summary", { passed, failed, total: CASES.length }, "H3");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  log("fatal", { error: String(e) }, "H0");
  process.exit(1);
});
