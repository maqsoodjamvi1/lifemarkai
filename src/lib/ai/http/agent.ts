import { createClientFromRequest } from "../../supabase/request-client.ts";
import { createAdminClient } from "../../supabase/server.ts";
import { getServerUser } from "../../supabase/server-user.ts";
import { runAgent,type AgentStep } from "../agent.ts";
import { mcpInitialize,mcpListTools,mcpCallTool } from "../mcp-client.ts";
import { detectLanguage } from "../code-parser.ts";
import { rateLimitAsync,RATE_LIMITS } from "../../rate-limit.ts";
import { canWriteProjectFiles,getProjectAccess } from "../../project/access.ts";
import { ensureDevCredits } from "../../dev-credits.ts";
import {
cancelCreditReservation,
claimDailyCredits,
reserveCredits,
settleCreditReservation,
} from "@/lib/credits";
import { computeCreditCost,maxCreditCostForMode,AGENT_MIN_CREDITS } from "../credit-cost.ts";
import { ensureCommonGeneratedSupportFiles } from "../generated-support-files.ts";
import { classifyBuildIntent } from "../build-intent.ts";
import { ensureWebsiteChrome } from "../website-chrome.ts";
import { alignGeneratedPackageJson } from "../../preview/align-package-json.ts";
import { autoWireAi } from "../auto-wire-ai.ts";
import {
parseCloudToolPermissions,
buildCloudPermissionsPromptBlock,
shouldBlockCloudAction,
} from "@/lib/cloud/permissions";
import { getDefaultAiModel } from "../model-defaults.ts";
import { attachSkillsToPrompt } from "../attach-skills.ts";
// Same ranked-context builder the build path uses — see the contextSeed comment
// at the runAgent call site.
import { buildProjectContext } from "../system-prompts.ts";
import {
buildEditorIntelligencePromptBlock,
recordEditorIntelligenceBuild,
} from "@/lib/ai/editor-lenses/persistence";
import { isSimpleEditorRequest,maxOutputTokensForRequest,resolveBudgetAwareModel } from "../cost-controls.ts";
import { resolveSmartModel } from "../editor-intelligence.ts";
import { persistChatTurnMessages } from "../persist-chat-turn.ts";
import { pushFileToRunningSandbox } from "../../preview/push-to-sandbox.ts";
import { commitGenerationSnapshot } from "../chat/commit-generation-snapshot.ts";
import { fireProjectWebhookEvent } from "../../webhooks/dispatch.ts";
import { checkTemplateCompatibility,lockControlledDependencyVersions,resolveControlledTemplateForPrompt } from "../../templates/controlled-registry.ts";
import { recordGenerationVerification } from "../generation-observability.ts";
import { setCorrelation } from "../../observability/correlation.ts";
import { ensureBuildRunId,getCorrelation } from "../../observability/correlation.ts";
import { isFeatureEnabled } from "../../config/features.ts";
import { BuildRunStore } from "../../build-runs/store.ts";


export async function handleAiAgent(req: Request) {
  const supabase = createClientFromRequest(req);
  const { user } = await getServerUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) {
    return Response.json(
      { error: "Rate limit exceeded. Please wait before sending another request." },
      { status: 429, headers: { "X-RateLimit-Reset": String(rl.resetAt) } }
    );
  }

  const body = await req.json();
  const { projectId, task, rawTask, model, modelManuallySelected = false, previewUrl } = body;
  const clientPreviewUrl =
    typeof previewUrl === "string" && /^https?:\/\//i.test(previewUrl.trim())
      ? previewUrl.trim()
      : null;
  const costTask = typeof rawTask === "string" && rawTask.trim() ? rawTask : task;
  // Phase 0: identity on the correlation context (see http/chat.ts).
  setCorrelation({ userId: user.id, projectId: typeof projectId === "string" ? projectId : undefined });
  if (!projectId || typeof projectId !== "string") {
    return Response.json({ error: "projectId is required" }, { status: 400 });
  }
  if (!task || typeof task !== "string" || task.length > 8000) {
    return Response.json({ error: "Task must be a string under 8000 characters" }, { status: 400 });
  }

  // INTENT GATE. The chat route downgrades informational questions to chat mode
  // (see isInformationalQuery in http/chat.ts) but this route had no gate at
  // all: "why is the cart empty?" would spin up the full 30-iteration ReAct
  // loop, read files, and charge agent-tier credits to answer a question that
  // needed no edits. Tell the client to re-send as chat instead of burning the
  // run. 409 rather than 400 — the request is well-formed, just mis-routed.
  {
    const { isInformationalQuery } = await import("@/lib/ai/build-intent");
    if (isInformationalQuery(costTask)) {
      return Response.json(
        {
          error: "informational_query",
          message:
            "This looks like a question rather than a change request. Re-send it in Chat mode — it is faster and costs less.",
          suggestedMode: "chat",
        },
        { status: 409 },
      );
    }
  }

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canWriteProjectFiles(access)) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  // Check credits (agents cost more). Dev accounts auto-grant via ensureDevCredits.
  await claimDailyCredits(supabase, user.id); // grants today's free credits before the gate
  const { data: profile } = await supabase.from("profiles")
    .select("credits, workspace_knowledge, cloud_tool_permissions").eq("id", user.id).single();
  await ensureDevCredits(user.id);

  const cloudPermissions = parseCloudToolPermissions(profile?.cloud_tool_permissions);

  const { data: projectRow } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  // Test/Live environments: Agent mode writes files — block when Live.
  if ((projectRow as { environment?: string } | null)?.environment === "live") {
    return Response.json(
      {
        error: "This project is in the Live environment. Switch to Test to make changes, then publish them to Live.",
        environment_locked: true,
      },
      { status: 423 }
    );
  }

  const cloudBlock = shouldBlockCloudAction(task, cloudPermissions);
  if (cloudBlock.blocked) {
    return Response.json({ error: cloudBlock.reason, cloud_blocked: true, tool: cloudBlock.tool }, { status: 403 });
  }
  const projectKnowledge = (projectRow as { knowledge?: string | null } | null)?.knowledge?.trim();
  const workspaceKnowledge = profile?.workspace_knowledge?.trim();

  // Combine workspace + project knowledge (workspace first, project-level overrides)
  const knowledgeParts: string[] = [];
  if (workspaceKnowledge) knowledgeParts.push(`# Workspace Standards (always follow)\n${workspaceKnowledge}`);
  if (projectKnowledge) knowledgeParts.push(`# Project Instructions (takes precedence)\n${projectKnowledge}`);
  const editorIntelligenceContext = await buildEditorIntelligencePromptBlock(supabase, projectId);
  if (editorIntelligenceContext) knowledgeParts.push(editorIntelligenceContext.trim());
  knowledgeParts.push(buildCloudPermissionsPromptBlock(cloudPermissions, !!projectRow?.cloud_enabled));

  const { block: skillBlock } = await attachSkillsToPrompt(
    supabase,
    user.id,
    task,
    Array.isArray(projectRow?.disabled_skill_ids)
      ? projectRow.disabled_skill_ids.filter((id): id is string => typeof id === "string")
      : [],
  );
  if (skillBlock) knowledgeParts.push(skillBlock);

  const { data: files } = await supabase
    .from("project_files").select("path, content").eq("project_id", projectId);
  const fileCount = Array.isArray(files) ? files.length : 0;

  // ── Intelligence parity with chat builds (agent is the primary build path):
  // design-system context, decision-log memory, learned-rules flywheel.
  if (fileCount > 8) {
    try {
      const { buildDesignSystemBlock, buildDecisionLogBlock } = await import("@/lib/ai/design-system-context");
      const dsBlock = buildDesignSystemBlock(files as Array<{ path: string; content?: string | null }>);
      if (dsBlock) knowledgeParts.push(dsBlock);
      const decisions = (projectRow as { metadata?: { decision_log?: unknown } } | null)?.metadata?.decision_log;
      const dlBlock = buildDecisionLogBlock(decisions);
      if (dlBlock) knowledgeParts.push(dlBlock);
    } catch { /* non-fatal */ }
    try {
      const { buildLearnedRulesBlock } = await import("@/lib/ai/learned-rules");
      const { data: findings } = await supabase
        .from("health_findings")
        .select("title, detail")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(30);
      const lrBlock = buildLearnedRulesBlock(Array.isArray(findings) ? findings : []);
      if (lrBlock) knowledgeParts.push(lrBlock);
    } catch { /* table may not exist yet — non-fatal */ }
  }

  const knowledge = knowledgeParts.length > 0 ? knowledgeParts.join("\n\n---\n\n") : undefined;
  const serverAutoModel = modelManuallySelected === true
    ? model
    : resolveSmartModel("agent", { fileCount, hasPreviewError: false }, costTask);
  const effectiveModel = resolveBudgetAwareModel({
    requestedModel: serverAutoModel,
    mode: "agent",
    prompt: costTask,
    fileCount,
    manuallySelected: modelManuallySelected === true,
  });
  const simpleAgentRequest = isSimpleEditorRequest({
    mode: "agent",
    prompt: costTask,
    fileCount,
  });

  // ── User MCP chat connectors (migration 076) ─────────────────────────────
  // Load the user's enabled remote MCP servers (cap 5), list their tools, and
  // expose them to the agent as namespaced "mcp_{server}_{tool}" extra tools.
  // Failures are skipped silently (logged) — a dead connector never blocks a run.
  type ExtraTool = {
    name: string;
    description: string;
    inputSchema?: unknown;
    execute: (args: Record<string, unknown>) => Promise<string>;
  };
  const MAX_MCP_SERVERS = 5;
  const MAX_MCP_TOOLS = 25;
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "server";
  const extraTools: ExtraTool[] = [];
  try {
    const { data: mcpServers } = await supabase
      .from("user_mcp_servers")
      .select("id, name, url, auth_header, enabled")
      .eq("user_id", user.id)
      .eq("enabled", true)
      .order("created_at", { ascending: true })
      .limit(MAX_MCP_SERVERS);

    if (Array.isArray(mcpServers) && mcpServers.length > 0) {
      const settled = await Promise.allSettled(
        mcpServers.map(async (srv: { id: string; name: string; url: string; auth_header: string | null }) => {
          const init = await mcpInitialize(srv.url, srv.auth_header);
          const tools = await mcpListTools(srv.url, srv.auth_header, init.sessionId);
          return { srv, sessionId: init.sessionId, tools };
        })
      );
      for (const outcome of settled) {
        if (outcome.status === "rejected") {
          console.warn("[agent] MCP connector skipped:", outcome.reason instanceof Error ? outcome.reason.message : outcome.reason);
          continue;
        }
        const { srv, sessionId, tools } = outcome.value;
        const serverSlug = slugify(srv.name);
        for (const tool of tools) {
          if (extraTools.length >= MAX_MCP_TOOLS) break;
          const toolName = `mcp_${serverSlug}_${slugify(tool.name)}`;
          if (extraTools.some((t) => t.name === toolName)) continue;
          extraTools.push({
            name: toolName,
            description: `[${srv.name} connector] ${tool.description || tool.name}`.slice(0, 400),
            inputSchema: tool.inputSchema,
            execute: (args: Record<string, unknown>) =>
              mcpCallTool(srv.url, { name: tool.name, args, authHeader: srv.auth_header, sessionId }),
          });
        }
      }
    }
  } catch (err) {
    console.warn("[agent] MCP connector loading failed:", err instanceof Error ? err.message : err);
  }

  // ── connector_call agent tool (Lovable-parity connector actions) ─────────
  // Lets the agent call the project's configured app connectors directly.
  // Reads run freely; WRITES pause for user approval (Allow once / Always /
  // Never — stored in projects.metadata) exactly like Lovable's approval
  // cards. Blocked writes surface an approval_required observation that the
  // chat panel renders as an approval card.
  try {
    const { executeConnectorCall, configuredConnectorIds } = await import("@/lib/integrations/connector-exec");
    const { ENV_FILE_PATH: envPath, parseEnvFile: parseEnv } = await import("@/lib/project/env-file");
    const { data: envRow } = await supabase
      .from("project_files")
      .select("content")
      .eq("project_id", projectId)
      .eq("path", envPath)
      .maybeSingle();
    const configured = configuredConnectorIds(parseEnv((envRow as { content?: string } | null)?.content ?? ""));
    if (configured.length > 0) {
      extraTools.push({
        name: "connector_call",
        description: `Call one of the project's configured app connectors (${configured.join(", ")}). Reads (GET) run immediately; writes (POST/PUT/PATCH/DELETE) require the user's approval and may return approval_required — if so, tell the user to approve the action in chat and do not retry.`,
        inputSchema: {
          type: "object",
          properties: {
            connector: { type: "string", description: `Connector id, one of: ${configured.join(", ")}` },
            path: { type: "string", description: "API path starting with /, appended to the connector's base URL" },
            method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
            body: { type: "object", description: "JSON body for write methods" },
            query: { type: "object", description: "Query string parameters" },
          },
          required: ["connector", "path"],
        },
        execute: async (args: Record<string, unknown>) => {
          const res = await executeConnectorCall(
            supabase,
            projectId,
            (projectRow as { metadata?: unknown } | null)?.metadata,
            {
              connector: String(args.connector ?? ""),
              path: String(args.path ?? ""),
              method: typeof args.method === "string" ? args.method : "GET",
              body: args.body,
              query: (args.query ?? undefined) as Record<string, string> | undefined,
            },
          );
          return res.approval_required
            ? res.result // JSON payload with approval_required:true — panel renders the card
            : JSON.stringify({ ok: res.ok, status: res.status, body: res.result });
        },
      });
    }
  } catch (err) {
    console.warn("[agent] connector_call tool setup failed:", err instanceof Error ? err.message : err);
  }

  // ── web_search / fetch_url agent tools (Lovable-agent parity) ────────────
  // Lets the agent consult the live web mid-task (library docs, API shapes,
  // error messages). Keyless DuckDuckGo fallback so it works out of the box.
  try {
    const { searchWeb, fetchUrlAsText } = await import("@/lib/ai/agent-web-tools");
    extraTools.push({
      name: "web_search",
      description:
        "Search the web (returns up to 6 results with title, url, snippet). Use for current library docs, API references, or error messages you don't recognise. Follow up with fetch_url to read a promising result.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "Search query" } },
        required: ["query"],
      },
      execute: async (args: Record<string, unknown>) =>
        JSON.stringify(await searchWeb(String(args.query ?? ""))),
    });
    extraTools.push({
      name: "fetch_url",
      description:
        "Fetch a public http(s) page and return its readable text (capped at 6000 chars). Use after web_search, or when the user references a URL.",
      inputSchema: {
        type: "object",
        properties: { url: { type: "string", description: "Absolute public URL" } },
        required: ["url"],
      },
      execute: async (args: Record<string, unknown>) =>
        JSON.stringify(await fetchUrlAsText(String(args.url ?? ""))),
    });
  } catch (err) {
    console.warn("[agent] web tools setup failed:", err instanceof Error ? err.message : err);
  }

  // ── db_query agent tool (Lovable Cloud parity: agent can inspect the DB) ──
  // Read-only SELECT/WITH/EXPLAIN against the project's managed Postgres.
  // Gated on cloud_enabled + a provisioned ref + database permission != never.
  try {
    const cloudRef = (projectRow as { cloud_project_ref?: string | null } | null)?.cloud_project_ref;
    const dbPermission = (cloudPermissions as { database?: string } | null)?.database ?? "ask";
    if (projectRow?.cloud_enabled && cloudRef && dbPermission !== "never") {
      const { isReadOnlySql } = await import("@/lib/ai/agent-web-tools");
      const { queryManagedSql } = await import("@/lib/cloud/management");
      extraTools.push({
        name: "db_query",
        description:
          "Run a READ-ONLY SQL query (single SELECT/WITH/EXPLAIN statement) against this project's live Cloud Postgres. Use to inspect schema (information_schema.columns / pg_tables), check row counts, or debug data issues. Writes are rejected — propose schema changes as migration files instead.",
        inputSchema: {
          type: "object",
          properties: { sql: { type: "string", description: "A single read-only SQL statement" } },
          required: ["sql"],
        },
        execute: async (args: Record<string, unknown>) => {
          const sql = String(args.sql ?? "");
          if (!isReadOnlySql(sql)) {
            return JSON.stringify({ error: "Rejected: only a single read-only SELECT/WITH/EXPLAIN statement is allowed. Propose writes as migration files." });
          }
          const res = await queryManagedSql(cloudRef, sql);
          if (!res.ok) return JSON.stringify({ error: res.error ?? "query failed" });
          const rows = res.rows.slice(0, 50);
          const payload = JSON.stringify({ rowCount: res.rows.length, rows });
          return payload.length > 8000 ? payload.slice(0, 8000) + "…(truncated)" : payload;
        },
      });
    }
  } catch (err) {
    console.warn("[agent] db_query tool setup failed:", err instanceof Error ? err.message : err);
  }

  // ── db_propose_write: the agent may ASK to change live data, never do it ───
  //
  // Lovable's agent assigns a staff member to a department and enables a menu
  // for a user — real row changes on a running app. This is how we do that
  // without handing a language model an unattended UPDATE against a council's
  // production database.
  //
  // The tool ends at a proposal. It validates the statement, computes the EXACT
  // number of rows it would affect (sql-write-preview refuses anything it cannot
  // count precisely), records it as `proposed`, and returns the id. Execution
  // lives behind an authenticated approval endpoint, so the model has no path to
  // it at all — not a discouraged path, not a guarded one, none.
  //
  // NOTE on permissions: `database: "allow"` does NOT auto-run writes. That
  // setting was created when this permission meant read-only queries, and
  // silently re-reading an old consent as "may mutate production without
  // asking" is not something the user agreed to. `never` blocks proposing;
  // every other value still requires a human on the approval endpoint.
  try {
    const cloudRef = (projectRow as { cloud_project_ref?: string | null } | null)?.cloud_project_ref;
    const dbPermission = (cloudPermissions as { database?: string } | null)?.database ?? "ask";
    if (projectRow?.cloud_enabled && cloudRef && dbPermission !== "never") {
      const { planSqlWrite } = await import("@/lib/cloud/sql-write-preview");
      const { queryManagedSql } = await import("@/lib/cloud/management");
      extraTools.push({
        name: "db_propose_write",
        description:
          "Propose a single INSERT/UPDATE/DELETE against this project's live Cloud Postgres. This does NOT run it — it returns the exact number of rows the statement would affect so the user can approve or decline. Use for operational fixes to real data (assign a role, correct a field, enable a flag for a user). Rules: one statement; UPDATE and DELETE must have a WHERE clause; no subqueries; no schema changes. Read first with db_query, then propose using literal values.",
        inputSchema: {
          type: "object",
          properties: {
            sql: { type: "string", description: "A single INSERT, UPDATE or DELETE statement" },
            reason: { type: "string", description: "One sentence: why this change, in the user's terms" },
          },
          required: ["sql", "reason"],
        },
        execute: async (args: Record<string, unknown>) => {
          const sql = String(args.sql ?? "");
          const reason = String(args.reason ?? "").slice(0, 500);

          const plan = planSqlWrite(sql);
          if (!plan.ok) return JSON.stringify({ error: plan.reason });

          // Count using the read-only query the planner derived. If this fails,
          // the whole proposal fails: an approval prompt with no number on it is
          // the exact thing this design exists to prevent.
          let previewedRows: number;
          if (plan.staticCount != null) {
            previewedRows = plan.staticCount;
          } else {
            const counted = await queryManagedSql<{ affected: string | number }>(cloudRef, plan.countQuery!);
            if (!counted.ok) {
              return JSON.stringify({
                error: `Could not determine how many rows this would affect (${counted.error ?? "count failed"}). Not proposing a change nobody can size.`,
              });
            }
            const raw = counted.rows[0]?.affected;
            const n = typeof raw === "string" ? Number(raw) : raw;
            if (!Number.isFinite(n)) {
              return JSON.stringify({ error: "The row count came back unreadable. Not proposing a change nobody can size." });
            }
            previewedRows = Number(n);
          }

          const { data: row, error: auditError } = await (supabase as unknown as {
            from: (t: string) => {
              insert: (v: Record<string, unknown>) => {
                select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> };
              };
            };
          })
            .from("project_data_writes")
            .insert({
              project_id: projectId,
              statement: plan.statement,
              kind: plan.kind,
              target_table: plan.table,
              previewed_rows: previewedRows,
              status: "proposed",
            })
            .select("id")
            .single();

          // No audit row, no proposal. A mutation of a customer's production
          // data that nothing recorded is not something this product should be
          // able to produce, so this failure is fatal rather than logged.
          if (auditError || !row) {
            return JSON.stringify({
              error: `Could not record the proposal for audit (${auditError?.message ?? "no row returned"}). Nothing was changed.`,
            });
          }

          return JSON.stringify({
            proposed: true,
            proposalId: row.id,
            kind: plan.kind,
            table: plan.table,
            statement: plan.statement,
            rowsAffected: previewedRows,
            reason,
            note:
              previewedRows === 0
                ? "This currently matches NO rows — say so plainly rather than presenting it as a fix, and re-check the predicate."
                : "Tell the user what will change and how many rows, then wait. You cannot run this yourself.",
          });
        },
      });
    }
  } catch (err) {
    console.warn("[agent] db_propose_write tool setup failed:", err instanceof Error ? err.message : err);
  }

  const reservationAmount = maxCreditCostForMode("agent");
  const creditReservation = await reserveCredits(supabase, {
    userId: user.id,
    amount: reservationAmount,
    action: "agent_run",
    projectId,
  });
  if (!creditReservation) {
    return Response.json(
      { error: `Need at least ${reservationAmount} credits for Agent Mode (minimum ${AGENT_MIN_CREDITS})`, requiredCredits: reservationAmount, agentMinCredits: AGENT_MIN_CREDITS },
      { status: 402 },
    );
  }

  // ── Phase 6 pilot: durable build run (flag: VERCEL_WORKFLOW_ENABLED) ──────
  // Flag off (default): buildRunStore stays null, zero extra queries, byte-
  // identical behaviour. Flag on: the run gets a build_runs row, every SSE
  // event is persisted for reconnect replay (GET /api/build-runs/:id/events),
  // and the terminal state lands exactly once — closing the browser no longer
  // erases the build's history.
  let buildRunStore: BuildRunStore | null = null;
  let buildRunId: string | null = null;
  if (isFeatureEnabled("vercelWorkflow", { userId: user.id, projectId })) {
    try {
      const admin = await createAdminClient();
      buildRunStore = new BuildRunStore(admin as never);
      buildRunId = getCorrelation()?.buildRunId ?? ensureBuildRunId();
      await buildRunStore.startRun({
        runId: buildRunId,
        projectId,
        userId: user.id,
        mode: "agent",
        model: typeof model === "string" ? model : undefined,
        creditsReserved: creditReservation.amount,
        creditReservationKey: `resv_${creditReservation.id}`,
      });
    } catch (err) {
      // Durability is a pilot; the live build must not depend on it.
      console.warn("[agent] build-run start failed:", err);
      buildRunStore = null;
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        if (buildRunStore && buildRunId) buildRunStore.appendEvent(buildRunId, data);
      };

      let reservationFinalized = false;
      let producedBillableWork = false;
      let finalCreditCost: number | null = null;

      try {
        const projectFileMap = new Map<string, { path: string; content: string; language?: string }>();
        for (const file of Array.isArray(files) ? files : []) {
          const path = String(file.path ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
          if (!path) continue;
          projectFileMap.set(path, { path, content: String(file.content ?? ""), language: detectLanguage(path) });
        }

        // ── Pre-agent snapshot ───────────────────────────────────────────────
        //
        // The chat build route has taken one of these before every turn for a
        // long time; this route never did, and this route is where most edits
        // to a real project actually go — the client switches to it as soon as
        // the project has any user-authored files. So the default editing path
        // was the one with no way back.
        //
        // It matters more here than in chat, because the agent is the only
        // caller that issues real DELETEs against project_files. An agent that
        // removed or rewrote the wrong file left nothing to restore, and the
        // Undo button made it worse rather than better: with no snapshot from
        // this turn, Undo fetched the most recent snapshot in the project — one
        // from some earlier chat build — and silently threw away every agent
        // turn since.
        //
        // Best-effort by design: a snapshot failure must not cost the user
        // their turn. But it is awaited, because a snapshot written after the
        // agent has already started deleting files is not a snapshot.
        let preAgentSnapshotId: string | null = null;
        {
          const current = Array.from(projectFileMap.values());
          if (current.length > 0) {
            try {
              const { data: preSnap } = await supabase
                .from("project_snapshots")
                .insert({
                  project_id: projectId,
                  user_id: user.id,
                  label: `Auto-save before: ${String(rawTask ?? task).slice(0, 60)}`,
                  is_baseline: true,
                  files: current,
                  patches: null,
                  parent_id: null,
                })
                .select("id")
                .single();
              preAgentSnapshotId = (preSnap as { id: string } | null)?.id ?? null;
            } catch {
              preAgentSnapshotId = null; // never fail the turn over a snapshot
            }
          }
        }

        const result = await runAgent({
          task,
          projectId,
          userId: user.id,
          // Prefer the live Modal URL the editor is showing, then persisted preview_url, then deploy.
          deployedUrl:
            clientPreviewUrl ??
            (typeof (projectRow as { preview_url?: string | null } | null)?.preview_url === "string" &&
            /^https?:\/\//i.test((projectRow as { preview_url: string }).preview_url)
              ? (projectRow as { preview_url: string }).preview_url
              : null) ??
            (projectRow as { deployed_url?: string | null } | null)?.deployed_url ??
            null,
          files: files ?? [],
          // Seed the agent with ranked file CONTENT, not just a path list.
          // buildProjectContext is the same BM25-ranked, per-file-budgeted
          // selector the build path uses, so this costs nothing extra and stops
          // the loop spending iterations re-reading what we already have.
          // Budget is deliberately below build's 80k: the agent still has tools
          // for anything not included, and its output cap is only 8k.
          contextSeed: (() => {
            try {
              const list = (files ?? []) as Array<{ path: string; content: string }>;
              if (list.length === 0) return undefined;
              return buildProjectContext(list, 30000, costTask);
            } catch {
              return undefined; // never block a run on context selection
            }
          })(),
          model: effectiveModel,
          maxOutputTokens: maxOutputTokensForRequest({
            mode: "agent",
            prompt: costTask,
            fileCount,
            defaultBuildMax: 8000,
            defaultChatMax: 4000,
          }),
          knowledge,
          extraTools: extraTools.length > 0 ? extraTools : undefined,
          onStep: (step: AgentStep) => {
            producedBillableWork = true;
            send({ step });
          },
          onFileChange: async (path: string, content: string) => {
            producedBillableWork = true;
            // Defense in depth: tool executes now validate path before calling
            // this, but a malformed path here used to throw on path.replace()
            // and crash the whole shared ai-worker process — every concurrent
            // request, not just this one. Never let a bad path take the
            // process down; skip the update and keep the run alive instead.
            if (typeof path !== "string" || !path) {
              send({ warning: "Agent produced a file update with no path; skipped." });
              return;
            }
            const cleanPath = path.replace(/\\/g, "/").replace(/^\/+/, "");
            projectFileMap.set(cleanPath, { path: cleanPath, content, language: detectLanguage(cleanPath) });
            send({ fileUpdated: { path: cleanPath, content: content.slice(0, 100) + "..." } });

            // Staged only: activation happens once after verification.
            // And into the RUNNING preview container — the DB alone leaves the
            // sandbox serving the old file (observed stale-preview bug).
          },
          // Deletions remain staged until the full snapshot is committed.
          // nothing ever issued a DELETE against project_files: delete_file
          // returned "Deleted: <path>", the summary said so, and the file was
          // still in the project and the preview — and reappeared in context next
          // turn, so the agent could "delete" it over and over.
          onFileDelete: async (path: string) => {
            producedBillableWork = true;
            if (typeof path !== "string" || !path) {
              send({ warning: "Agent produced a file delete with no path; skipped." });
              return;
            }
            const cleanPath = path.replace(/\\/g, "/").replace(/^\/+/, "");

            // Report the truth. An unchecked delete meant a failed one still
            // announced "Deleted: <path>" to the user and dropped the file from
            // the agent's own working map — so the agent proceeded as though it
            // were gone, while the project and the preview still had it. That
            // divergence is worse than the failure: the next turn is reasoning
            // about a file set that does not exist.
            projectFileMap.delete(cleanPath);
            send({ fileDeleted: { path: cleanPath } });
          },
        });

        const supportFiles = ensureCommonGeneratedSupportFiles(Array.from(projectFileMap.values())).filter(
          (file) => !projectFileMap.has(file.path.replace(/\\/g, "/").replace(/^\/+/, "")),
        );
        if (supportFiles.length > 0) {
          for (const file of supportFiles) {
            projectFileMap.set(file.path, { path: file.path, content: file.content, language: file.language });
            send({ fileUpdated: { path: file.path, content: file.content.slice(0, 100) + "..." } });
          }
        }
        // ── Post-generation guarantees ────────────────────────────────────
        // Parity with the chat build path. The agent is the PRIMARY build path
        // for new projects (see the comment above the intelligence block), so a
        // guarantee wired only into chat.ts silently does not apply to most
        // builds — which is exactly what a live test showed: a landing page
        // arrived with a UI kit, an index route, and no header or footer at all.
        // See lib/ai/website-chrome.ts and lib/preview/align-package-json.ts.
        const guaranteed: Array<{ path: string; content: string; language?: string }> = [];
        try {
          const current = Array.from(projectFileMap.values()).map((file) => ({
            path: file.path,
            content: file.content ?? "",
            language: (file as { language?: string }).language ?? detectLanguage(file.path),
          }));
          // appType is REQUIRED here, not optional decoration: without it the
          // app-shell exemption never runs, and this path — the PRIMARY build
          // path for new projects — mounted a marketing header and footer into
          // every ERP, CRM and POS it produced. The structural fallbacks
          // (sidebar file, <aside> in the root shell) only catch a shell the
          // model already built, which is precisely not the failing case.
          const withChrome = ensureWebsiteChrome(current, [], {
            appType: classifyBuildIntent(task).appType,
            brand: (projectRow as { name?: string } | null)?.name ?? undefined,
          });
          for (const file of withChrome) {
            if (file.path === "package.json") {
              const aligned = alignGeneratedPackageJson(file.content);
              if (aligned.changed.length > 0) file.content = aligned.content;
              const template = resolveControlledTemplateForPrompt(task, String((projectRow as { framework?: string } | null)?.framework ?? "react"));
              const locked = lockControlledDependencyVersions(file.content, template);
              if (locked.changed.length > 0) file.content = locked.content;
            }
            const prev = projectFileMap.get(file.path);
            if (!prev || (prev.content ?? "") !== file.content) guaranteed.push(file);
          }
          if (guaranteed.length > 0) {
            for (const file of guaranteed) {
              projectFileMap.set(file.path, { path: file.path, content: file.content, language: file.language });
              send({ fileUpdated: { path: file.path, content: file.content.slice(0, 100) + "..." } });
            }
          }
        } catch {
          // Never fail a build over a guarantee pass.
        }

        const filesChanged = Array.from(
          new Set([...(Array.isArray(result.filesChanged) ? result.filesChanged : []), ...supportFiles.map((file) => file.path), ...guaranteed.map((file) => file.path)]),
        );

        let stagedVerification = null;
        const preAgentRevision = Number((projectRow as { generation_revision?: number } | null)?.generation_revision ?? 0);
        if (filesChanged.length > 0) {
          const candidateFiles = Array.from(projectFileMap.values()).map((file) => ({
            ...file,
            language: file.language ?? detectLanguage(file.path),
          }));
          const template = resolveControlledTemplateForPrompt(task, String((projectRow as { framework?: string } | null)?.framework ?? "react"));
          const compatibility = checkTemplateCompatibility(template, candidateFiles);
          if (!compatibility.compatible) {
            send({ template_status: {
              template: `${template.key}@${template.version}`,
              missing: compatibility.missingPaths,
              dependency_drift: compatibility.dependencyDrift,
            } });
          }
          const { runSelfVerification } = await import("@/lib/ai/self-verify");
          stagedVerification = await runSelfVerification({
            supabase,
            projectId,
            userId: user.id,
            candidateFiles: candidateFiles as unknown as import("@/types/database").ProjectFile[],
            persistFixes: false,
            emit: (status) => send({ verify_status: status }),
          });
          if (!stagedVerification?.passed) {
            const reason = stagedVerification?.errors[0] ?? "candidate verification could not complete";
            try {
              // Same reasoning as the chat route: overlay stagedVerification's
              // accumulated repair-round writes onto the original candidate so
              // the audit trail reflects what the final (failing) render
              // actually saw, not the pre-repair snapshot.
              const finalByPath = new Map(candidateFiles.map((file) => [file.path, file]));
              for (const fixed of stagedVerification?.fixedFiles ?? []) {
                finalByPath.set(fixed.path, fixed);
              }
              // Supabase's rpc() builder is thenable but not a real Promise —
              // chaining .catch() directly threw "is not a function" and
              // crashed the whole agent run before it could even report the
              // verification failure. await + try/catch is the safe pattern
              // (matches every other .rpc() call in this codebase).
              await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<unknown> })
                .rpc("record_failed_generation", {
                  target_project_id: projectId,
                  run_source: "agent",
                  staged_files: Array.from(finalByPath.values()),
                  failure_message: reason,
                });
            } catch { /* best-effort logging only, never fails the run */ }
            throw new Error(`Agent verification failed; the last working revision was preserved: ${reason}`);
          }
          for (const fixed of stagedVerification.fixedFiles) projectFileMap.set(fixed.path, fixed);
          const committed = await commitGenerationSnapshot(
            supabase,
            projectId,
            "agent",
            Array.from(projectFileMap.values()),
          );
          for (const file of committed) pushFileToRunningSandbox(supabase, projectId, file.path, file.content);
        }

        // Save agent task as messages — including a compact persisted work
        // trace (Lovable parity: expandable "Worked for Xs · N steps" on
        // finished messages, surviving reloads).
        const traceSteps = result.steps
          .filter((s: AgentStep) => s.type === "action" || s.type === "thought")
          .slice(0, 40)
          .map((s: AgentStep) => ({
            t: s.type,
            ...(s.tool ? { tool: s.tool } : {}),
            c: (s.content ?? "").slice(0, 140),
            ...(s.args?.path ? { path: String(s.args.path).slice(0, 120) } : {}),
          }));
        const firstTs = result.steps[0]?.timestamp;
        const lastTs = result.steps[result.steps.length - 1]?.timestamp;
        const workSeconds = firstTs && lastTs
          ? Math.max(1, Math.round((new Date(lastTs).getTime() - new Date(firstTs).getTime()) / 1000))
          : undefined;
        const persisted = await persistChatTurnMessages(
          supabase,
          [
            { project_id: projectId, role: "user", content: costTask, mode: "agent" },
            {
              project_id: projectId,
              role: "assistant",
              content: result.summary || "Agent finished.",
              tokens_used: result.tokensUsed,
              model: effectiveModel ?? getDefaultAiModel(),
              mode: "agent",
              metadata: {
                steps: result.steps.length,
                files_changed: filesChanged,
                agent_trace: traceSteps,
                ...(workSeconds ? { work_seconds: workSeconds } : {}),
                // Carries the per-message "Revert to this version" affordance,
                // which agent turns simply did not have. Without it the only
                // recovery was the global Undo, which restored whatever the
                // last CHAT build had saved — usually far further back than the
                // user intended, and silently.
                ...(preAgentSnapshotId ? { snapshot_id: preAgentSnapshotId } : {}),
              },
            },
          ],
          { projectId, label: "agent-turn" },
        );
        const assistantMessageId = persisted.assistantMessageId;

        // Project memory: record this agent build in the decision log
        // (parity with chat builds — capped, zero AI cost, best-effort).
        if (filesChanged.length > 0) {
          try {
            const { appendDecision } = await import("@/lib/ai/design-system-context");
            const prevMeta = ((projectRow as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
            const nextLog = appendDecision(prevMeta.decision_log, {
              at: new Date().toISOString(),
              req: String(rawTask ?? task).slice(0, 140),
              files: filesChanged.length,
              paths: filesChanged.slice(0, 3),
            });
            await supabase
              .from("projects")
              .update({ metadata: { ...prevMeta, decision_log: nextLog } as unknown as import("@/types/database").Json })
              .eq("id", projectId);
          } catch { /* best-effort */ }
        }

        // ── Lovable parity: backend auto-wiring + self-verification ──────────
        let backendWiring = null;
        let verification = stagedVerification;
        if (filesChanged.length > 0) {
          try {
            const { data: changedRows } = await supabase
              .from("project_files")
              .select("path, content, language")
              .eq("project_id", projectId)
              .in("path", filesChanged);
            const { autoWireBackend } = await import("@/lib/cloud/auto-wire");
            backendWiring = await autoWireBackend({
              supabase,
              projectId,
              userId: user.id,
              prompt: task,
              generatedFiles: (changedRows ?? []) as Array<{ path: string; content: string }>,
              cloudToolPermissionsRaw: profile?.cloud_tool_permissions,
              emit: (status) => send({ wiring_status: status }),
            });
            // In-app AI connector auto-wiring (managed AI for the generated app)
            try {
              await autoWireAi({
                supabase,
                projectId,
                prompt: task,
                generatedFiles: (changedRows ?? []) as Array<{ path: string; content: string }>,
                emit: (status) => send({ wiring_status: status }),
              });
            } catch { /* never fail the build */ }
          } catch { backendWiring = null; }

          try {
            const { runSelfVerification } = await import("@/lib/ai/self-verify");
            verification = await runSelfVerification({
              supabase,
              projectId,
              userId: user.id,
              emit: (status) => send({ verify_status: status }),
              maxRounds: stagedVerification ? 0 : simpleAgentRequest ? 0 : undefined,
            });
            // Errors that survive the auto-fix rounds become 'runtime' health
            // findings, which is what feeds the learned-rules flywheel
            // (lib/ai/learned-rules.ts needs >=2 hits per class before it
            // injects a rule). Chat did this; the agent route did NOT — and the
            // agent is the DEFAULT path for edits on mature projects
            // (editor-intelligence.ts shouldAutoBuildMode), so the flywheel was
            // starved of its main data source. Best-effort, never fails a run.
            if (verification && !verification.passed) {
              try {
                const { recordVerificationFindings } = await import("@/lib/ai/self-healing");
                await recordVerificationFindings({
                  supabase,
                  projectId,
                  userId: user.id,
                  verification,
                }).catch(() => {});
              } catch { /* ignore */ }
              const { data: activeRevision } = await supabase
                .from("projects")
                .select("generation_revision")
                .eq("id", projectId)
                .single();
              const expectedRevision = Number((activeRevision as { generation_revision?: number } | null)?.generation_revision);
              if (Number.isSafeInteger(expectedRevision)) {
                const { error: rollbackError } = await (supabase as unknown as {
                  rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
                }).rpc("rollback_generation_revision", {
                  target_project_id: projectId,
                  target_revision: preAgentRevision,
                  expected_revision: expectedRevision,
                });
                if (!rollbackError) send({
                  verify_status: "Verification failed after activation. Restored the last working revision.",
                  auto_rolled_back: true,
                });
              }
            }
          } catch { verification = null; }

          await recordEditorIntelligenceBuild({
            supabase,
            projectId,
            projectName: (projectRow as { name?: string | null } | null)?.name ?? null,
            source: "agent",
            mode: "agent",
            prompt: task,
            filesChanged,
            assistantMessageId,
            backendWiring,
            verification,
          });
          await recordGenerationVerification(
            supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<unknown> },
            projectId,
            resolveControlledTemplateForPrompt(task, String((projectRow as { framework?: string } | null)?.framework ?? "react")),
            verification,
            verification?.passed ? "verification" : "post-activation",
          );
        }

        finalCreditCost = computeCreditCost({
          mode: "agent",
          filesGenerated: filesChanged.length,
          tokensUsed: result.tokensUsed,
          usedAutoFix: (verification?.fixesApplied ?? 0) > 0,
        });
        const remainingCredits = await settleCreditReservation(
          supabase,
          creditReservation.id,
          finalCreditCost,
        );
        if (remainingCredits == null) {
          throw new Error("Unable to settle reserved Agent credits");
        }
        reservationFinalized = true;

        import("@/lib/stripe/auto-topup")
          .then(({ triggerAutoTopupIfNeeded }) => triggerAutoTopupIfNeeded(user.id))
          .catch(() => {});

        if (filesChanged.length > 0) {
          fireProjectWebhookEvent(supabase, projectId, "ai_generation", {
            mode: "agent",
            filesChanged: filesChanged.length,
            paths: filesChanged.slice(0, 20),
          }).catch(() => {});
        }

        send({
          done: true,
          summary: result.summary,
          filesChanged,
          creditsUsed: finalCreditCost,
          remainingCredits,
          assistantMessageId,
          backend_wired: backendWiring ?? undefined,
          verification: verification
            ? { engine: verification.engine, passed: verification.passed, fixesApplied: verification.fixesApplied, errors: verification.errors }
            : undefined,
        });
        if (buildRunStore && buildRunId) {
          await buildRunStore.finishRun({
            runId: buildRunId,
            status: "completed",
            creditsFinalized: finalCreditCost ?? undefined,
            creditFinalizationKey: `fin_${creditReservation.id}`,
            verificationPassed: verification?.passed,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Agent failed";
        send({ error: msg });
        if (buildRunStore && buildRunId) {
          await buildRunStore.finishRun({
            runId: buildRunId,
            status: "failed",
            failureCode: msg.slice(0, 200),
          });
        }
      } finally {
        if (!reservationFinalized) {
          try {
            if (producedBillableWork) {
              const fallbackCost = Math.min(
                creditReservation.amount,
                finalCreditCost ?? creditReservation.amount,
              );
              const remaining = await settleCreditReservation(
                supabase,
                creditReservation.id,
                fallbackCost,
              );
              reservationFinalized = remaining != null;
            } else {
              await cancelCreditReservation(supabase, creditReservation.id);
              reservationFinalized = true;
            }
          } catch (reservationError) {
            // Fail closed: keep the reservation deducted when provider work may
            // already have been delivered or persisted.
            console.error("[agent] Failed to finalize credit reservation", reservationError);
          }
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/** Thin alias for Next route re-export */
export const POST = handleAiAgent;
