/**
 * Durable build-run store — Phase 6 of the Vercel adoption plan.
 *
 * Wraps the migration-175 tables in the four operations a durable build needs:
 *
 *   startRun()   — one row per buildRunId; calling twice is a no-op, so the
 *                  entrypoint can be replayed (or raced by a reconnect).
 *   appendEvent()— persists every SSE event; the browser replays events after
 *                  its last seen id on reconnect instead of losing the build.
 *   runStep()    — the workflow primitive: execute `fn` exactly once per
 *                  (run, stepKey). A replay finds the UNIQUE row and returns
 *                  the STORED result without executing. This is what makes
 *                  "steps must be idempotent / replayed steps must not
 *                  generate twice" a database guarantee.
 *   finishRun()  — terminal state (completed | failed | cancelled), exactly
 *                  once: later calls lose the conditional update, so a crash
 *                  handler racing a success handler cannot flip a terminal
 *                  state.
 *
 * The store takes a supabase-like client (service role in production, a fake
 * in tests) and NEVER throws out of event/bookkeeping paths — a persistence
 * hiccup must degrade durability, not break the live build. runStep() is the
 * exception: its job is correctness, so its errors propagate.
 *
 * Usage is gated by the `vercelWorkflow` flag at the call site (http/agent.ts):
 * flag off = no rows, no reads, byte-identical behaviour to before Phase 6.
 */

export interface SupabaseLike {
  from(table: string): {
    insert(row: Record<string, unknown>): PromiseLike<{ error: { code?: string; message: string } | null }>;
    update(patch: Record<string, unknown>): {
      eq(column: string, value: unknown): {
        eq(column: string, value: unknown): PromiseLike<{ error: { message: string } | null }>;
      };
    };
    select(columns: string): {
      eq(column: string, value: unknown): {
        eq(column: string, value: unknown): {
          maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
        gt(column: string, value: unknown): {
          order(column: string, opts: { ascending: boolean }): {
            limit(count: number): PromiseLike<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
          };
        };
      };
    };
  };
}

export interface StartRunInput {
  runId: string;
  projectId: string;
  userId: string;
  mode: "agent" | "build" | "patch" | "chat";
  model?: string;
  creditsReserved?: number;
  creditReservationKey?: string;
  sandboxProvider?: string;
  workflowProvider?: string;
}

export type TerminalStatus = "completed" | "failed" | "cancelled";

export interface FinishRunInput {
  runId: string;
  status: TerminalStatus;
  failureCode?: string;
  creditsFinalized?: number;
  creditFinalizationKey?: string;
  verificationPassed?: boolean;
  candidateVersion?: number;
}

const UNIQUE_VIOLATION = "23505";

export class BuildRunStore {
  private readonly supabase: SupabaseLike;

  // Plain assignment, not a parameter property: the repo's node --test lane
  // runs under --experimental-strip-types, which forbids parameter properties.
  constructor(supabase: SupabaseLike) {
    this.supabase = supabase;
  }

  /** Idempotent: a second start of the same runId is a successful no-op. */
  async startRun(input: StartRunInput): Promise<void> {
    try {
      const { error } = await this.supabase.from("build_runs").insert({
        id: input.runId,
        project_id: input.projectId,
        user_id: input.userId,
        mode: input.mode,
        status: "running",
        model: input.model ?? null,
        credits_reserved: input.creditsReserved ?? null,
        credit_reservation_key: input.creditReservationKey ?? null,
        sandbox_provider: input.sandboxProvider ?? null,
        workflow_provider: input.workflowProvider ?? "in-request",
      });
      if (error && error.code !== UNIQUE_VIOLATION) {
        console.warn("[build-runs] startRun failed:", error.message);
      }
    } catch (err) {
      console.warn("[build-runs] startRun threw:", err);
    }
  }

  /** Fire-and-forget event persistence; ordering comes from the identity id. */
  appendEvent(runId: string, payload: object): void {
    void (async () => {
      try {
        await this.supabase.from("build_run_events").insert({ run_id: runId, payload });
      } catch {
        /* durability is best-effort; the live stream already delivered it */
      }
    })();
  }

  /**
   * Execute `fn` exactly once for (runId, stepKey).
   *
   * Completed replay → stored result, `fn` NOT executed.
   * Failed-step replay → re-executes (a failed step may be retried; only
   * SUCCESS is permanent).
   * Two racers → both run `fn`, but only one INSERT wins the unique
   * constraint; the loser returns the WINNER's stored result so downstream
   * state derives from exactly one execution.
   */
  async runStep<T>(runId: string, stepKey: string, fn: () => Promise<T>): Promise<T> {
    const existing = await this.readStep(runId, stepKey);
    if (existing && existing.status === "completed") {
      return existing.result as T;
    }

    const result = await fn(); // errors propagate — a failed step is retryable

    const { error } = await this.supabase.from("build_run_steps").insert({
      run_id: runId,
      step_key: stepKey,
      status: "completed",
      result: result === undefined ? null : (result as unknown),
    });
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        // Lost the race — the other execution's result is the canonical one.
        const winner = await this.readStep(runId, stepKey);
        if (winner && winner.status === "completed") return winner.result as T;
      } else {
        // Persistence failed: surface it. Returning an unrecorded result would
        // let a replay execute the step a second time.
        throw new Error(`[build-runs] could not record step ${stepKey}: ${error.message}`);
      }
    }
    return result;
  }

  /** Record a failed step (diagnostic only — failed steps stay retryable). */
  async recordStepFailure(runId: string, stepKey: string, err: unknown): Promise<void> {
    try {
      await this.supabase.from("build_run_steps").insert({
        run_id: runId,
        step_key: stepKey,
        status: "failed",
        error: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
      });
    } catch {
      /* best-effort */
    }
  }

  /** Terminal transition, exactly once: only a 'running' row is updated. */
  async finishRun(input: FinishRunInput): Promise<void> {
    try {
      const patch: Record<string, unknown> = {
        status: input.status,
        completed_at: new Date().toISOString(),
      };
      if (input.failureCode !== undefined) patch.failure_code = input.failureCode;
      if (input.creditsFinalized !== undefined) patch.credits_finalized = input.creditsFinalized;
      if (input.creditFinalizationKey !== undefined) patch.credit_finalization_key = input.creditFinalizationKey;
      if (input.verificationPassed !== undefined) patch.verification_passed = input.verificationPassed;
      if (input.candidateVersion !== undefined) patch.candidate_version = input.candidateVersion;
      const { error } = await this.supabase
        .from("build_runs")
        .update(patch)
        .eq("id", input.runId)
        .eq("status", "running");
      if (error) console.warn("[build-runs] finishRun failed:", error.message);
    } catch (err) {
      console.warn("[build-runs] finishRun threw:", err);
    }
  }

  /** Events after a cursor — the reconnect/replay read. */
  async eventsAfter(runId: string, afterId: number, limit = 500): Promise<Array<{ id: number; payload: unknown }>> {
    const { data, error } = await this.supabase
      .from("build_run_events")
      .select("id, payload")
      .eq("run_id", runId)
      .gt("id", afterId)
      .order("id", { ascending: true })
      .limit(limit);
    if (error || !data) return [];
    return data as Array<{ id: number; payload: unknown }>;
  }

  private async readStep(
    runId: string,
    stepKey: string,
  ): Promise<{ status: string; result: unknown } | null> {
    try {
      const { data } = await this.supabase
        .from("build_run_steps")
        .select("status, result")
        .eq("run_id", runId)
        .eq("step_key", stepKey)
        .maybeSingle();
      return (data as { status: string; result: unknown } | null) ?? null;
    } catch {
      return null;
    }
  }
}
