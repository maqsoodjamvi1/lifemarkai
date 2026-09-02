/**
 * POST /api/projects/:id/sandbox-preview
 *
 * Runs the project's files in a Modal sandbox (Lovable parity) and returns a
 * LIVE preview tunnel URL. When Modal isn't configured, responds with
 * `{ enabled: false }` so the editor shows "Modal preview required"
 * (not WebContainer / srcdoc / esbuild).
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canReadProjectFiles,getProjectAccess } from "@/lib/project/access";
import { correlationFromRequest,runWithCorrelation,setCorrelation } from "@/lib/observability/correlation";
import { recordEvent } from "@/lib/observability/events";
import {
detectSandboxStart,
getSandboxProvider,
getSandboxProviderId,
getPreviewProbeState,
forgetPreviewProbe,peekPreviewReachable,
isSandboxEnabled,
sandboxNameForProject,
type SandboxFile
} from "@/lib/sandbox";
import type { SandboxProgressEvent } from "@/lib/sandbox";
import { isDockerDaemonReachable } from "@/lib/sandbox/docker";
import { rateLimitAsync,RATE_LIMITS } from "@/lib/rate-limit";
import { patchSandboxPreviewFiles } from "@/lib/preview/patch-sandbox-preview-files";
import type { Database,Json } from "@/types/database";


/**
 * Does this provider error mean "the sandbox you asked for no longer exists"?
 *
 * Matched against the real Modal message, which arrives as a gRPC-ish string:
 *   /modal.task_command_router.TaskCommandRouter/TaskExecStart NOT_FOUND:
 *   Modal Sandbox with container ID ta-01KY… not found.
 *   This means this Sandbox has already shut down. (Error code: Y7YM52OE)
 *
 * Deliberately narrow: this must NOT swallow real build failures (a broken
 * package.json, a failed npm install), because those SHOULD stick as an error
 * the user can read rather than silently retrying forever.
 */
function isSandboxGoneError(err: unknown): boolean {
  const msg = typeof err === "string" ? err : (err as Error)?.message ?? "";
  if (!msg) return false;
  return (
    /already shut down/i.test(msg) ||
    /NOT_FOUND/.test(msg) ||
    /Sandbox .*not found/i.test(msg) ||
    /container ID .*not found/i.test(msg)
  );
}

/**
 * projects.preview_url is SHARED with the thumbnail-capture route
 * (api/projects/$id/preview.ts), which writes a Supabase-storage .jpg — or even
 * a data: URL — into the same column. When that happened after a sandbox boot,
 * the phaseOnly poll handed the screenshot URL to the editor as the "tunnel",
 * the iframe tried to frame supabase.co, X-Frame-Options blocked it, and the
 * preview showed "refused to connect" while claiming phase ready.
 *
 * Only URLs on a sandbox tunnel host may be treated as a live preview. Anything
 * else stored in preview_url is a thumbnail and must be ignored here — the
 * reconnect paths below will then re-discover the real tunnel and re-persist it.
 */
function isSandboxTunnelUrl(value: unknown): value is string {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    const domain = (process.env.SANDBOX_PREVIEW_DOMAIN || "preview.lifemarkai.com")
      .trim()
      .toLowerCase();
    const publicHost = (process.env.SANDBOX_PUBLIC_HOST || "")
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "");
    // Local port-mode previews are http://localhost:42xxx (or 127.0.0.1 / the
    // configured SANDBOX_PUBLIC_HOST). Without this, phaseOnly polls discard the
    // live URL as a "thumbnail" and the core-loop gate never sees ready.
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "::1" ||
      (publicHost && (host === publicHost || host.endsWith(`.${publicHost}`)))
    ) {
      return true;
    }
    return (
      host === domain ||
      host.endsWith(`.${domain}`) ||
      host.endsWith(".modal.host")
    );
  } catch {
    return false;
  }
}

/** One cold-boot at a time per project — concurrent POSTs were terminating
 *  each other's fresh Modal sandboxes ("user termination request"). */
const bootInflight = new Map<string, Promise<Response>>();
/** Boot work that continues after the HTTP response — npm install can take
 *  longer than Node's default 5-minute requestTimeout. */
const detachedBoots = new Set<string>();

/**
 * In-process boot progress. Detached boots write project metadata to Supabase;
 * when that write flakes (`fetch failed`), the campaign's phaseOnly poll would
 * otherwise sit on "creating" forever even though Docker already has a URL.
 * This map is the source of truth for the lifetime of the Node process.
 */
type LiveBootState = {
  phase: string | null;
  phaseDetail: string | null;
  previewUrl: string | null;
  sandboxId: string | null;
  ok: boolean;
  error: string | null;
  updatedAt: number;
};
const liveBootState: Map<string, LiveBootState> =
  (globalThis as { __lifemarkLiveBoot?: Map<string, LiveBootState> }).__lifemarkLiveBoot ??
  ((globalThis as { __lifemarkLiveBoot?: Map<string, LiveBootState> }).__lifemarkLiveBoot =
    new Map());

function rememberBootState(projectId: string, patch: Partial<LiveBootState>) {
  const prev = liveBootState.get(projectId);
  liveBootState.set(projectId, {
    phase: patch.phase !== undefined ? patch.phase : (prev?.phase ?? null),
    phaseDetail:
      patch.phaseDetail !== undefined ? patch.phaseDetail : (prev?.phaseDetail ?? null),
    previewUrl:
      patch.previewUrl !== undefined ? patch.previewUrl : (prev?.previewUrl ?? null),
    sandboxId:
      patch.sandboxId !== undefined ? patch.sandboxId : (prev?.sandboxId ?? null),
    ok: patch.ok !== undefined ? patch.ok : (prev?.ok ?? false),
    error: patch.error !== undefined ? patch.error : (prev?.error ?? null),
    updatedAt: Date.now(),
  });
}

async function sandboxUnavailableResponse(): Promise<Response | null> {
  if (!isSandboxEnabled()) {
    return Response.json({ enabled: false, reason: "sandbox_not_configured" });
  }
  const provider = getSandboxProviderId();
  if (provider === "docker" && !(await isDockerDaemonReachable())) {
    return Response.json({
      enabled: false,
      provider,
      reason: "docker_unreachable",
      configured: true,
      reachable: false,
      error: "Docker is configured, but Docker Desktop is not running.",
    });
  }
  return null;
}

async function handlePOST(req: Request, params: { id: string }) {
  const { id: projectId } = params;
  const existing = bootInflight.get(projectId);
  if (existing) {
    // .clone(), not the same object. A Response body is a single-use
    // ReadableStream: handing one instance to two in-flight requests leaves the
    // second reading a locked, already-consumed body, which surfaces as a 500
    // or a truncated payload. The client then fails to parse it and collapses
    // the whole preview to `enabled: false`, disabling every recovery path it
    // has. Concurrent boots are routine here — the boot effect, the 90s stall
    // recovery, the keepalive's dead-sandbox detection, the phase poller and
    // the Retry button can all fire one, never mind a second browser tab.
    return existing.then((res) => res.clone());
  }
  // The correlation context wraps the BOOT, not the request: concurrent callers
  // share one boot via bootInflight, so the ids belong to the boot that actually
  // ran. For the same reason the shared response is not stamped with correlation
  // headers — the second caller would receive the first caller's requestId.
  const run = runWithCorrelation(
    {
      ...correlationFromRequest(req),
      route: "api/projects/:id/sandbox-preview",
      projectId,
    },
    () => handlePOSTUnlocked(req, params),
  ).finally(() => {
    if (bootInflight.get(projectId) === run) bootInflight.delete(projectId);
  });
  bootInflight.set(projectId, run);
  return run;
}

async function handlePOSTUnlocked(req: Request, params: { id: string }) {
  const { id: projectId } = params;

  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const unavailable = await sandboxUnavailableResponse();
  if (unavailable) return unavailable;

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canReadProjectFiles(access)) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const rl = await rateLimitAsync(`sandbox-preview:${user.id}`, RATE_LIMITS.ai);
  if (!rl.success) {
    return Response.json({ error: "Rate limited" }, { status: 429 });
  }

  if (detachedBoots.has(projectId)) {
    return Response.json({
      enabled: true,
      ok: true,
      ready: false,
      previewUrl: null,
      phase: "creating",
      phaseDetail: "Starting your app — the first run takes a moment.",
      provider: getSandboxProviderId(),
      sandboxName: sandboxNameForProject(projectId),
    });
  }

  const { data: rows, error } = await supabase
    .from("project_files")
    .select("path, content")
    .eq("project_id", projectId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!rows?.length) {
    return Response.json({ enabled: true, ok: false, error: "Project has no files." });
  }

  const { data: projectRow } = await supabase
    .from("projects")
    .select("is_public")
    .eq("id", projectId)
    .maybeSingle();

  const patchOpts = {
    projectId,
    isPublic: !!projectRow?.is_public,
    appOrigin: process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, ""),
  };

  const rawFiles: SandboxFile[] = rows
    .filter((r: { path?: string; content?: string }) => typeof r.path === "string")
    .map((r: { path: string; content: string | null }) => ({
      path: r.path,
      content: r.content ?? "",
    }));

  // Cold-boot dependency reconciliation: a project whose persisted package.json
  // already omits an imported package (class-variance-authority, @radix-ui/*,
  // tailwind-merge, …) would crash on first mount before any sync could fix it.
  // Repair package.json BEFORE the sandbox boots + npm-installs.
  try {
    const pkgRow = rawFiles.find((f) => f.path.replace(/\\/g, "/") === "package.json");
    if (pkgRow?.content) {
      const { syncPackageJsonDeps } = await import("@/lib/ai/npm-auto-install");
      const sync = syncPackageJsonDeps(rawFiles, pkgRow.content);
      if (sync && sync.addedPackages.length > 0) {
        pkgRow.content = sync.updated;
        await supabase
          .from("project_files")
          .update({ content: sync.updated, updated_at: new Date().toISOString() })
          .eq("project_id", projectId)
          .eq("path", "package.json");
      }
    }
  } catch { /* non-fatal */ }

  const files: SandboxFile[] = patchSandboxPreviewFiles(rawFiles, patchOpts);

  const { port, startCommand } = detectSandboxStart(files);

  const { data: existing } = await supabase
    .from("projects")
    .select("metadata")
    .eq("id", projectId)
    .maybeSingle();
  const prevMeta = (existing?.metadata && typeof existing.metadata === "object")
    ? (existing.metadata as Record<string, unknown>)
    : {};

  /**
   * The project's metadata as THIS request currently believes it to be.
   *
   * Every write below is a whole-object `update`, and they all used to spread
   * the same `prevMeta` snapshot taken before any of them ran. Two ways that
   * lost data, both observed as "the preview forgot its sandbox":
   *
   *   • `persistPhase` is fire-and-forget. A progress callback in flight when
   *     the final write lands (or one issued just after it, since the
   *     provider keeps reporting) re-applies the OLD snapshot on top and
   *     erases `sandbox_id` / `sandbox_port`. The next poll finds no id and
   *     cold-boots a project that was already running.
   *   • On the zombie-recovery path the snapshot still holds the DEAD
   *     sandbox_id — the one we just deliberately cleared — so a late phase
   *     write resurrects the corpse and the "self-healing" retry heals into
   *     the same stuck state.
   *
   * Merging into the live object instead of the snapshot fixes both, and
   * chaining the writes keeps them from reordering against each other.
   */
  let liveMeta: Record<string, unknown> = { ...prevMeta };
  let metaWriteChain: Promise<unknown> = Promise.resolve();
  // Metadata writes continue after a detached POST returns; the request-scoped
  // cookie client can lose AsyncLocalStorage. Prefer the service-role client.
  const metaClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;
  const canDetachBoot = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const writeMeta = (
    patch: Record<string, unknown>,
    extraColumns: Database["public"]["Tables"]["projects"]["Update"] = {},
  ): Promise<{ error?: { message?: string } | null }> => {
    liveMeta = { ...liveMeta, ...patch };
    const snapshot = { ...liveMeta };
    if (typeof patch.sandbox_phase === "string") {
      rememberBootState(projectId, {
        phase: patch.sandbox_phase,
        phaseDetail:
          typeof patch.sandbox_phase_detail === "string"
            ? patch.sandbox_phase_detail
            : patch.sandbox_phase_detail === null
              ? null
              : undefined,
        sandboxId:
          typeof patch.sandbox_id === "string"
            ? patch.sandbox_id
            : patch.sandbox_id === null
              ? null
              : undefined,
        previewUrl:
          typeof extraColumns.preview_url === "string"
            ? extraColumns.preview_url
            : extraColumns.preview_url === null
              ? null
              : undefined,
        ok: patch.sandbox_phase !== "error",
        error:
          patch.sandbox_phase === "error"
            ? (typeof patch.sandbox_phase_detail === "string"
                ? patch.sandbox_phase_detail
                : null)
            : null,
      });
    }
    const next = metaWriteChain.then(async () => {
      let lastError: { message?: string } | null = null;
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          const result = await metaClient
            .from("projects")
            .update({ ...extraColumns, metadata: snapshot as unknown as Json })
            .eq("id", projectId);
          if (!result.error) return result;
          lastError = result.error;
          const msg = result.error.message ?? "";
          if (!/fetch failed|ECONNRESET|ETIMEDOUT|UND_ERR_|network/i.test(msg) || attempt === 5) {
            return result;
          }
        } catch (err) {
          lastError = { message: err instanceof Error ? err.message : String(err) };
          if (
            !/fetch failed|ECONNRESET|ETIMEDOUT|UND_ERR_|network/i.test(lastError.message ?? "") ||
            attempt === 5
          ) {
            return { error: lastError };
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** (attempt - 1)));
      }
      return { error: lastError };
    });
    // The chain must never reject, or one failed write would strand all the
    // ones behind it.
    metaWriteChain = next.catch(() => undefined);
    return next.catch((err: unknown) => ({
      error: { message: err instanceof Error ? err.message : String(err) },
    }));
  };

  const persistPhase = (phase: string, detail?: string) => {
    void writeMeta({
      sandbox_phase: phase,
      sandbox_phase_detail: detail ?? null,
      sandbox_provider: getSandboxProviderId(),
      sandbox_updated_at: new Date().toISOString(),
    });
  };

  const runBoot = async (): Promise<Response> => {
  const provider = getSandboxProvider();
  // Modal-first cloud preview (Lovable parity). Do not pass E2B templates here.
  const result = await provider.runProject({
    files,
    port,
    startCommand,
    projectId,
    onProgress: (event: SandboxProgressEvent) => persistPhase(event.phase, event.detail),
  });

  if (result.ok && result.sandboxId) setCorrelation({ sandboxSessionId: result.sandboxId });
  recordEvent(result.ok ? "sandbox_boot_completed" : "sandbox_boot_failed", {
    provider: getSandboxProviderId(),
    ready: result.ready !== false,
    error: result.ok ? undefined : result.error,
  });

  if (!result.ok) {
    // ZOMBIE SANDBOX RECOVERY.
    //
    // Modal reaps sandboxes on its own schedule. When that happens the id we
    // persisted in project metadata still looks valid to us, so the next boot
    // tries to exec into it and Modal answers:
    //
    //   "Modal Sandbox with container ID ta-01KY… not found.
    //    This means this Sandbox has already shut down."
    //
    // Nothing used to handle that: we wrote phase "error" and stopped, keeping
    // the dead id on the project. Every later attempt reconnected to the same
    // corpse, so the preview was STUCK PERMANENTLY until someone manually
    // cleared the metadata — the failure could not heal itself.
    //
    // Clearing the id turns a permanent stuck state into a self-healing one:
    // the next attempt finds no id and provisions a fresh sandbox.
    if (isSandboxGoneError(result.error)) {
      console.warn(
        `[sandbox-preview] stored sandbox is gone (${result.error}) — clearing sandbox_id and cold-booting once`,
      );
      await writeMeta(
        {
          sandbox_id: null,
          sandbox_phase: "creating",
          sandbox_phase_detail: "Sandbox expired — starting a fresh one…",
          sandbox_updated_at: new Date().toISOString(),
        },
        { preview_url: null },
      );

      // Heal in this same request. Returning retryable alone left the editor on
      // "Preview could not start" whenever the client didn't auto-repost.
      const retry = await provider.runProject({
        files,
        port,
        startCommand,
        projectId,
        onProgress: (event: SandboxProgressEvent) => persistPhase(event.phase, event.detail),
      });

      recordEvent(retry.ok ? "sandbox_boot_completed" : "sandbox_boot_failed", {
        provider: getSandboxProviderId(),
        retryAfterZombie: true,
        ready: retry.ready !== false,
        error: retry.ok ? undefined : retry.error,
      });
      if (retry.ok) {
        if (retry.sandboxId) setCorrelation({ sandboxSessionId: retry.sandboxId });
        const { error: previewUrlErr } = await writeMeta(
          {
            sandbox_id: retry.sandboxId,
            sandbox_port: port,
            sandbox_provider: getSandboxProviderId(),
            sandbox_phase: "ready",
            sandbox_phase_detail: null,
            sandbox_updated_at: new Date().toISOString(),
          },
          { preview_url: retry.previewUrl },
        );
        if (previewUrlErr) {
          console.warn("[sandbox-preview] failed to persist preview_url:", previewUrlErr.message);
        }
        return Response.json({
          enabled: true,
          ok: true,
          previewUrl: retry.previewUrl,
          sandboxId: retry.sandboxId,
          logs: retry.logs,
          provider: getSandboxProviderId(),
          phase: "ready",
          sandboxName: sandboxNameForProject(projectId),
          recovered: true,
        });
      }

      // AWAIT the terminal phase, don't fire-and-forget it. Two reasons:
      // writes are now serialized, so this one queues behind every progress
      // write of a 60-90s boot and the handler would return long before it
      // ran (and on a runtime that reclaims the invocation after the response,
      // never); and this return previously wrote no phase at all, so a client
      // polling the project row kept reading "creating"/"installing" and sat
      // on the spinner while the response said "error".
      await writeMeta({
        sandbox_phase: "error",
        sandbox_phase_detail:
          retry.error ?? "The preview sandbox had expired and could not be restarted.",
        sandbox_provider: getSandboxProviderId(),
        sandbox_updated_at: new Date().toISOString(),
      });
      return Response.json({
        enabled: true,
        ok: false,
        retryable: true,
        phase: "error",
        error: retry.error ?? "The preview sandbox had expired and could not be restarted.",
        logs: retry.logs ?? result.logs,
      });
    }

    await writeMeta({
      sandbox_id: result.sandboxId ?? null,
      sandbox_phase: "error",
      sandbox_phase_detail: result.error ?? null,
      sandbox_provider: getSandboxProviderId(),
      sandbox_updated_at: new Date().toISOString(),
    });
    return Response.json({ enabled: true, ok: false, error: result.error, logs: result.logs });
  }

  // The container from the previous boot is gone, but its URL is the same
  // (hostnames are stable per project) and the probe cache still holds that
  // container's verdict — including, after a crash, three recorded failures.
  // Carrying that over would make the fresh sandbox look dead on arrival.
  forgetPreviewProbe(result.previewUrl);

  // `ok` means provisioned; `ready` means the dev server actually answered.
  // Conflating them is what framed a URL Traefik could only 502 — so when the
  // server hasn't come up yet, persist everything needed to keep watching but
  // DO NOT claim ready. The container is alive and its supervisor is still
  // starting the dev server; the phaseOnly poll below promotes it to ready the
  // moment the tunnel answers a probe.
  const bootReady = result.ready !== false;

  // Persist the live preview URL + sandbox id for reconnects (Lovable warm-session parity).
  const { error: previewUrlErr } = await writeMeta(
    {
      sandbox_id: result.sandboxId,
      sandbox_port: port,
      sandbox_provider: getSandboxProviderId(),
      sandbox_phase: bootReady ? "ready" : "starting",
      sandbox_phase_detail: bootReady
        ? null
        : "Starting your app — the first run takes a moment.",
      sandbox_updated_at: new Date().toISOString(),
    },
    { preview_url: result.previewUrl },
  );
  if (previewUrlErr) {
    console.warn("[sandbox-preview] failed to persist preview_url:", previewUrlErr.message);
  }

  rememberBootState(projectId, {
    phase: bootReady ? "ready" : "starting",
    phaseDetail: bootReady ? null : "Starting your app — the first run takes a moment.",
    previewUrl: result.previewUrl ?? null,
    sandboxId: result.sandboxId ?? null,
    ok: true,
    error: null,
  });

  return Response.json({
    enabled: true,
    ok: true,
    ready: bootReady,
    // Always include the origin. Withholding it until the in-container probe
    // wins left a blank "Starting live preview" pane while Vite was already
    // bound — the browser will wait longer than our probe budget.
    previewUrl: result.previewUrl ?? null,
    sandboxId: result.sandboxId,
    logs: result.logs,
    provider: getSandboxProviderId(),
    phase: bootReady ? "ready" : "starting",
    phaseDetail: bootReady
      ? null
      : "Starting your app — the first run takes a moment.",
    sandboxName: sandboxNameForProject(projectId),
  });
  };

  // Park the project at "creating" before returning so phaseOnly polls do not
  // still see a previous boot's "ready". npm install then continues in runBoot.
  await writeMeta(
    {
      sandbox_phase: "creating",
      sandbox_phase_detail: "Starting sandbox",
      sandbox_provider: getSandboxProviderId(),
      sandbox_updated_at: new Date().toISOString(),
    },
    { preview_url: null },
  );

  // This host is a long-lived Node process (Vite / Coolify), not a serverless
  // isolate that dies after the response. Returning now lets the campaign poll
  // through a 5–10 minute npm install instead of dying on Node's 300s
  // requestTimeout ("fetch failed" with the container still installing).
  if (canDetachBoot) {
    detachedBoots.add(projectId);
    void runBoot()
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[sandbox-preview] detached boot failed:", message);
        persistPhase("error", message);
      })
      .finally(() => {
        detachedBoots.delete(projectId);
      });
    return Response.json({
      enabled: true,
      ok: true,
      ready: false,
      previewUrl: null,
      phase: "creating",
      phaseDetail: "Starting your app — the first run takes a moment.",
      provider: getSandboxProviderId(),
      sandboxName: sandboxNameForProject(projectId),
    });
  }

  return runBoot();
}

/** GET — reconnect to a warm sandbox when possible (Lovable parity). */
async function handleGET(req: Request, params: any) {
  const { id: projectId } = params;

  const unavailable = await sandboxUnavailableResponse();
  if (unavailable) return unavailable;

  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canReadProjectFiles(access)) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const queryId = new URL(req.url).searchParams.get("sandboxId");
  const phaseOnly = new URL(req.url).searchParams.get("phaseOnly") === "1";
  const { data: project } = await supabase
    .from("projects")
    .select("preview_url, metadata")
    .eq("id", projectId)
    .maybeSingle();

  const meta = (project?.metadata && typeof project.metadata === "object")
    ? (project.metadata as Record<string, unknown>)
    : {};
  const sandboxId =
    queryId ||
    (typeof meta.sandbox_id === "string" ? meta.sandbox_id : null);

  // Lightweight boot-progress poll — never mark ok on a stale preview_url alone
  // (dead Modal tunnels were blanking the iframe while phase stuck at "writing").
  if (phaseOnly) {
    const live = liveBootState.get(projectId);
    if (live?.phase === "ready" && isSandboxTunnelUrl(live.previewUrl) && live.sandboxId) {
      return Response.json({
        enabled: true,
        ok: true,
        previewUrl: live.previewUrl,
        sandboxId: live.sandboxId,
        phase: "ready",
        phaseDetail: null,
        provider: getSandboxProviderId(),
      });
    }
    if (live?.phase === "error") {
      return Response.json({
        enabled: true,
        ok: false,
        phase: "error",
        phaseDetail: live.phaseDetail,
        error: live.error ?? live.phaseDetail ?? "remote preview failed to start",
        sandboxId: live.sandboxId,
        provider: getSandboxProviderId(),
      });
    }

    const phase =
      live?.phase ??
      (typeof meta.sandbox_phase === "string" ? meta.sandbox_phase : null);
    const phaseDetail =
      live?.phaseDetail ??
      (typeof meta.sandbox_phase_detail === "string" ? meta.sandbox_phase_detail : null);
    // A thumbnail .jpg in preview_url must NOT count as a live tunnel — see
    // isSandboxTunnelUrl. Treat it as "no stored preview" so the client falls
    // through to the reconnect path, which re-persists the real tunnel URL.
    const storedTunnelUrl = isSandboxTunnelUrl(live?.previewUrl)
      ? live!.previewUrl
      : isSandboxTunnelUrl(project?.preview_url)
        ? (project!.preview_url as string)
        : null;
    const resolvedSandboxId =
      live?.sandboxId ||
      queryId ||
      (typeof meta.sandbox_id === "string" ? meta.sandbox_id : null);
    const claimsReady = phase === "ready" && Boolean(storedTunnelUrl);

    // PROMOTION: a boot that returned before its dev server answered is parked
    // at phase "starting" with its URL already persisted. This poll is what
    // finishes the boot — the moment a probe actually succeeds against that
    // URL, the preview is genuinely serving and can be handed to the editor.
    //
    // Only "verified" counts. peekPreviewReachable deliberately fails OPEN, so
    // its `true` also means "never checked" — promoting on that would put us
    // right back to framing a URL nothing has confirmed. getPreviewProbeState
    // distinguishes the two, and the first poll's background probe means the
    // real verdict lands within a poll interval or two.
    //
    // Only promote from "starting". A new boot parks at "creating"/"installing"
    // while npm runs; promoting any live URL in that window would hand back
    // the PREVIOUS container's address.
    if (!claimsReady && storedTunnelUrl && phase === "starting") {
      peekPreviewReachable(storedTunnelUrl); // warms the cache in the background
      const probeState = getPreviewProbeState(storedTunnelUrl);
      if (probeState.state === "verified") {
        void Promise.resolve(supabase
          .from("projects")
          .update({
            metadata: {
              ...meta,
              sandbox_phase: "ready",
              sandbox_phase_detail: null,
              sandbox_updated_at: new Date().toISOString(),
            },
          })
          .eq("id", projectId))
          .then(() => {})
          .catch(() => {});
        rememberBootState(projectId, {
          phase: "ready",
          phaseDetail: null,
          previewUrl: storedTunnelUrl,
          sandboxId: resolvedSandboxId,
          ok: true,
          error: null,
        });
        return Response.json({
          enabled: true,
          ok: true,
          previewUrl: storedTunnelUrl,
          sandboxId: resolvedSandboxId,
          previewProbe: "verified",
          phase: "ready",
          phaseDetail: null,
          provider: getSandboxProviderId(),
        });
      }
    }

    // The stored phase only tells us what we BELIEVED last time. Modal tunnels
    // expire (~24h), so verify the tunnel is actually serving before reporting
    // ok — otherwise the client renders a broken iframe with no error and the
    // dead-sandbox self-heal never triggers. Cached + de-duplicated, so this
    // costs at most one short request per URL per 10s across all pollers.
    const previewUrlForProbe = storedTunnelUrl ?? undefined;
    // NON-BLOCKING: reads the cached verdict and refreshes in the background.
    // Awaiting the probe here made every poll wait out the network timeout when
    // the tunnel was down, which stacked requests and froze the editor page.
    const alive = claimsReady ? peekPreviewReachable(previewUrlForProbe!) : false;

    // isPreviewReachable fails OPEN, so `alive === true` can mean "verified" OR
    // "never once reached". Those look identical to a caller and are completely
    // different to debug, so say which it is rather than implying a check that
    // never succeeded. Warn once per poll window when we're only assuming.
    const probe = claimsReady
      ? getPreviewProbeState(previewUrlForProbe!)
      : { state: "unknown" as const, fails: 0, lastStatus: 0 };
    if (probe.state === "unverified") {
      console.warn(
        `[sandbox-preview] reporting ready for ${previewUrlForProbe} but the tunnel has NEVER answered a probe — ` +
          `this server may be unable to reach modal.host at all. Treat ok:true as unconfirmed.`,
      );
    }
    // A 5xx FROM THE APP is its own failure mode and must not be reported as a
    // dead or expired sandbox. The container is fine; the code inside it does
    // not compile. Telling the user to restart the sandbox there sends them
    // round a loop that cannot fix anything — the file has to be repaired.
    const appErrored = probe.lastStatus >= 500 && probe.lastStatus !== 502
      && probe.lastStatus !== 503 && probe.lastStatus !== 504;

    return Response.json({
      enabled: true,
      ok: alive,
      previewUrl: alive ? storedTunnelUrl : null,
      sandboxId: resolvedSandboxId,
      // Surface the stale-tunnel case distinctly so the UI can offer a restart
      // instead of spinning on a "ready" that will never paint.
      // "reachable" is only asserted when a probe actually succeeded.
      previewProbe: probe.state,
      previewStatus: probe.lastStatus || null,
      phase: claimsReady && !alive ? (appErrored ? "app_error" : "unreachable") : phase,
      phaseDetail:
        claimsReady && !alive
          ? appErrored
            ? `Your app is running but returned HTTP ${probe.lastStatus} — the code failed to build. Restarting won't help; the error has to be fixed.`
            : "Preview sandbox is no longer responding — it likely expired. Restart it to get a fresh one."
          : phaseDetail,
      provider: getSandboxProviderId(),
    });
  }

  const phaseFromMeta =
    typeof meta.sandbox_phase === "string" ? meta.sandbox_phase : null;
  const phaseDetailFromMeta =
    typeof meta.sandbox_phase_detail === "string" ? meta.sandbox_phase_detail : null;

  if (!sandboxId) {
    const provider = getSandboxProvider();
    if (provider.reconnectByProject) {
      const storedPort = typeof meta.sandbox_port === "number" ? meta.sandbox_port : undefined;
      const { port } = detectSandboxStart([]);
      const byProject = await provider.reconnectByProject(projectId, storedPort ?? port);
      if (byProject.ok && byProject.previewUrl) {
        await supabase
          .from("projects")
          .update({
            preview_url: byProject.previewUrl,
            metadata: {
              ...meta,
              sandbox_id: byProject.sandboxId,
              sandbox_port: storedPort ?? port,
              sandbox_provider: getSandboxProviderId(),
              sandbox_phase: "ready",
              sandbox_updated_at: new Date().toISOString(),
            },
          })
          .eq("id", projectId);
        return Response.json({
          enabled: true,
          ok: true,
          previewUrl: byProject.previewUrl,
          sandboxId: byProject.sandboxId,
          reconnected: true,
          provider: getSandboxProviderId(),
          phase: "ready",
        });
      }
    }
    return Response.json({
      enabled: true,
      ok: false,
      reason: "no_sandbox_id",
      phase: phaseFromMeta,
      phaseDetail: phaseDetailFromMeta,
      provider: getSandboxProviderId(),
    });
  }

  const provider = getSandboxProvider();
  const storedPort = typeof meta.sandbox_port === "number" ? meta.sandbox_port : undefined;
  const port = storedPort ?? detectSandboxStart([]).port;
  const result = await provider.reconnect(sandboxId, port);
  if (result.ok && result.previewUrl) {
    // A warm container is not the same as a serving app — the sandbox's pid 1
    // outlives a dead dev server, so reconnect can succeed against a container
    // that answers only 502. This is the editor's first call on every open, so
    // handing the URL over on container liveness alone put Bad Gateway in the
    // pane at exactly the moment the user arrived. Park it at "starting"
    // instead and let the phase poll promote it once a probe confirms.
    const warmReady = result.ready !== false;

    // Persist the EFFECTIVE sandbox id too — updating only preview_url leaves
    // metadata.sandbox_id stale, and phaseOnly polls hand that stale id back to
    // the client, whose later syncs then hit a dead sandbox forever.
    await supabase
      .from("projects")
      .update({
        preview_url: result.previewUrl,
        metadata: {
          ...meta,
          sandbox_id: result.sandboxId ?? sandboxId,
          sandbox_phase: warmReady ? "ready" : "starting",
          sandbox_phase_detail: warmReady ? null : "Waking your app…",
          sandbox_updated_at: new Date().toISOString(),
        },
      })
      .eq("id", projectId);

    if (!warmReady) {
      return Response.json({
        enabled: true,
        ok: false,
        // `waking` is what separates "this sandbox needs another moment" from
        // "there is no sandbox". Without it the client reads ok:false as the
        // latter and cold-boots — tearing down a perfectly good container
        // because its dev server happened to be mid-restart.
        waking: true,
        // Hand the URL over anyway. Withholding it left the editor on
        // "Starting live preview" while Vite was already serving — the in-
        // container probe budget is shorter than a cold HTML transform.
        previewUrl: result.previewUrl,
        sandboxId: result.sandboxId ?? sandboxId,
        reconnected: true,
        provider: getSandboxProviderId(),
        phase: "starting",
        phaseDetail: "Waking your app…",
      });
    }

    return Response.json({
      enabled: true,
      ok: true,
      previewUrl: result.previewUrl,
      sandboxId: result.sandboxId ?? sandboxId,
      reconnected: true,
      provider: getSandboxProviderId(),
      phase: "ready",
      phaseDetail: null,
    });
  }

  // Stale client/session sandboxId is common after reclaim — fall back to the
  // project-named Modal sandbox so the iframe is not left on a dead tunnel.
  if (provider.reconnectByProject) {
    const byProject = await provider.reconnectByProject(projectId, port);
    if (byProject.ok && byProject.previewUrl) {
      await supabase
        .from("projects")
        .update({
          preview_url: byProject.previewUrl,
          metadata: {
            ...meta,
            sandbox_id: byProject.sandboxId,
            sandbox_port: port,
            sandbox_provider: getSandboxProviderId(),
            sandbox_phase: "ready",
            sandbox_updated_at: new Date().toISOString(),
          },
        })
        .eq("id", projectId);
      return Response.json({
        enabled: true,
        ok: true,
        previewUrl: byProject.previewUrl,
        sandboxId: byProject.sandboxId,
        reconnected: true,
        recoveredFromStaleId: true,
        provider: getSandboxProviderId(),
        phase: "ready",
      });
    }
  }

  // Clear stale URL + sandbox id so the client cold-boots instead of framing a
  // dead tunnel / retrying reconnect against a terminated Modal sandbox.
  await supabase
    .from("projects")
    .update({
      preview_url: null,
      metadata: {
        ...meta,
        sandbox_id: null,
        sandbox_phase: "error",
        sandbox_phase_detail: result.error ?? "Sandbox expired",
        sandbox_updated_at: new Date().toISOString(),
      },
    })
    .eq("id", projectId);

  return Response.json({
    enabled: true,
    ok: false,
    error: result.error ?? "Sandbox expired",
    sandboxId: null,
    phase: "error",
    phaseDetail: result.error ?? "Sandbox expired",
  });
}


export const Route = createFileRoute("/api/projects/$id/sandbox-preview")({
  server: {
    handlers: {
      POST: async ({ request, params }) => handlePOST(request, params),
      GET: async ({ request, params }) => {
        try {
          return await handleGET(request, params);
        } catch (err) {
          // getProjectAccess() THROWS by design on transient Supabase failures
          // (see isTransientSupabaseError in lib/project/access.ts) so callers can
          // distinguish "backend blipped" from "no access". This route never
          // caught it, so a DNS wobble on the Supabase host
          // (`getaddrinfo ENOTFOUND …supabase.co`) surfaced as an UNHANDLED 500 —
          // and because the client polls this endpoint continuously, a few
          // seconds of bad DNS buried the terminal in duplicate stack traces.
          //
          // Answer with a shape the poller already understands instead: not ok,
          // a phase it can display, and 503 so it's clearly retryable rather
          // than a genuine failure of the project.
          const message = err instanceof Error ? err.message : String(err);
          const transient =
            /Could not load project|fetch failed|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN/i.test(
              message,
            );
          if (!transient) throw err;

          console.warn(`[sandbox-preview] transient backend error: ${message}`);
          return Response.json(
            {
              enabled: true,
              ok: false,
              previewUrl: null,
              sandboxId: null,
              phase: "backend_unreachable",
              phaseDetail:
                "Temporarily can't reach the project backend — retrying automatically.",
              provider: getSandboxProviderId(),
            },
            { status: 503 },
          );
        }
      },
    },
  },
});
