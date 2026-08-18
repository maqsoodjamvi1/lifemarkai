/**
 * Central feature configuration — Phase 0 of the Vercel adoption plan.
 *
 * Every Vercel integration (Observability, Speed Insights, Web Analytics,
 * AI SDK, AI Gateway, Workflow, Sandbox, Queues) ships behind a flag that
 * defaults to OFF. Nothing in this module changes runtime behaviour on its
 * own; it only answers "is this integration allowed right now, for this
 * user/project?" so every later phase has exactly one rollback lever.
 *
 * Precedence (deliberate, and the reason this is one module and not scattered
 * `process.env.X === "true"` checks):
 *
 *   1. Explicit OFF wins over everything. If `VERCEL_AI_SDK_ENABLED=false`
 *      the flag is off for internal users and for any rollout percentage.
 *      That is the one-environment-variable rollback the plan requires.
 *   2. Explicit ON enables it for everyone.
 *   3. Otherwise: internal allowlist (when `<FLAG>_INTERNAL=true`), then a
 *      deterministic percentage bucket (`<FLAG>_ROLLOUT=0..100`).
 *   4. Otherwise: off.
 *
 * The percentage bucket is a stable hash of (flag, userId) — the SAME user
 * stays in the same bucket across requests and deploys, so a 5% rollout is 5%
 * of users, not 5% of requests flapping mid-build. With no identity to hash
 * (background jobs, anonymous requests) a percentage rollout is treated as OFF
 * rather than coin-flipped, because a half-migrated build is worse than an
 * unmigrated one.
 *
 * Safe to import from server code. The two client-visible flags also read a
 * `VITE_`-prefixed name so the browser bundle can see them.
 */

export type FeatureFlagName =
  | "vercelObservability"
  | "vercelSpeedInsights"
  | "vercelWebAnalytics"
  | "vercelAiSdk"
  | "vercelAiGateway"
  | "vercelWorkflow"
  | "vercelSandbox"
  | "vercelQueue";

export interface FeatureFlagDefinition {
  /** Primary server env var. */
  env: string;
  /** Client-visible mirror (Vite only exposes `VITE_*` to the browser). */
  publicEnv?: string;
  /** Which plan phase introduces this flag. */
  phase: number;
  description: string;
  /** What flipping this back to `false` restores. */
  rollback: string;
}

export const FEATURE_FLAGS: Record<FeatureFlagName, FeatureFlagDefinition> = {
  vercelObservability: {
    env: "VERCEL_OBSERVABILITY_ENABLED",
    phase: 1,
    description: "Emit structured server events for AI, build, sandbox and deploy stages.",
    rollback: "Stops event emission. No request path changes; logs revert to console output.",
  },
  vercelSpeedInsights: {
    env: "VERCEL_SPEED_INSIGHTS_ENABLED",
    publicEnv: "VITE_VERCEL_SPEED_INSIGHTS_ENABLED",
    phase: 2,
    description: "Mount Speed Insights in the TanStack root layout.",
    rollback: "Script is not mounted. Editor startup returns to its pre-flag cost.",
  },
  vercelWebAnalytics: {
    env: "VERCEL_WEB_ANALYTICS_ENABLED",
    publicEnv: "VITE_VERCEL_WEB_ANALYTICS_ENABLED",
    phase: 2,
    description: "Mount Web Analytics and emit product events (no prompt text, no filenames).",
    rollback: "Script is not mounted and no product events are sent.",
  },
  vercelAiSdk: {
    env: "VERCEL_AI_SDK_ENABLED",
    phase: 4,
    description: "Route generateAI() through the Vercel AI SDK adapter instead of the legacy adapter.",
    rollback: "All generation returns to the legacy provider/gateway adapter on the next request.",
  },
  vercelAiGateway: {
    env: "VERCEL_AI_GATEWAY_ENABLED",
    phase: 5,
    description: "Let the Lifemark gateway select Vercel AI Gateway as upstream instead of OpenRouter.",
    rollback: "Upstream reverts to OpenRouter. The Lifemark gateway boundary is unchanged either way.",
  },
  vercelWorkflow: {
    env: "VERCEL_WORKFLOW_ENABLED",
    phase: 6,
    description: "Run Agent-mode builds as a durable Vercel Workflow.",
    rollback: "New builds run in-request as today. In-flight workflow runs must be drained or cancelled.",
  },
  vercelSandbox: {
    env: "VERCEL_SANDBOX_ENABLED",
    phase: 7,
    description: "Allow the sandbox provider interface to select Vercel Sandbox instead of Modal.",
    rollback: "New sandbox sessions go to Modal. Existing Vercel sessions still reconnect until they expire.",
  },
  vercelQueue: {
    env: "VERCEL_QUEUE_ENABLED",
    phase: 8,
    description: "Publish eligible background jobs to Vercel Queues instead of BullMQ.",
    rollback: "New jobs go to BullMQ. Already-enqueued Vercel messages must be drained, not abandoned.",
  },
};

export const FEATURE_FLAG_NAMES = Object.keys(FEATURE_FLAGS) as FeatureFlagName[];

/** Env var holding a comma-separated list of user ids treated as internal. */
export const INTERNAL_USERS_ENV = "LIFEMARK_INTERNAL_USER_IDS";

export interface FeatureFlagContext {
  userId?: string | null;
  projectId?: string | null;
  /** Force internal treatment (e.g. an admin-only route that already checked). */
  internal?: boolean;
}

export type FeatureFlagReason =
  | "env-off"
  | "env-on"
  | "internal"
  | "rollout"
  | "rollout-no-identity"
  | "default-off";

export interface FeatureFlagState {
  name: FeatureFlagName;
  enabled: boolean;
  reason: FeatureFlagReason;
  /** Configured rollout percentage, if any. */
  rolloutPercent: number;
}

function rawEnv(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const fromProcess = proc?.env?.[name];
  if (typeof fromProcess === "string" && fromProcess !== "") return fromProcess;
  // Browser bundle: Vite inlines import.meta.env.VITE_*.
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const fromMeta = meta?.[name];
  if (typeof fromMeta === "string" && fromMeta !== "") return fromMeta;
  return undefined;
}

const TRUE_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off", "disabled"]);

/** Tri-state read: `true`/`false` when set explicitly, `undefined` when unset. */
function readBoolEnv(name: string): boolean | undefined {
  const value = rawEnv(name);
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return undefined;
}

function readPercentEnv(name: string): number {
  const value = rawEnv(name);
  if (value === undefined) return 0;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
}

export function internalUserIds(): Set<string> {
  const raw = rawEnv(INTERNAL_USERS_ENV) ?? "";
  return new Set(
    raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

/** FNV-1a — small, dependency-free, and stable across processes and deploys. */
function stableBucket(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

export function featureFlagState(
  name: FeatureFlagName,
  ctx: FeatureFlagContext = {},
): FeatureFlagState {
  const definition = FEATURE_FLAGS[name];
  const rolloutPercent = readPercentEnv(`${definition.env}_ROLLOUT`);

  const explicit =
    readBoolEnv(definition.env) ??
    (definition.publicEnv ? readBoolEnv(definition.publicEnv) : undefined);

  // 1. Explicit OFF is the kill switch — nothing below can re-enable it.
  if (explicit === false) {
    return { name, enabled: false, reason: "env-off", rolloutPercent };
  }
  // 2. Explicit ON enables it everywhere.
  if (explicit === true) {
    return { name, enabled: true, reason: "env-on", rolloutPercent };
  }

  // 3a. Internal allowlist.
  if (readBoolEnv(`${definition.env}_INTERNAL`) === true) {
    const isInternal =
      ctx.internal === true || (!!ctx.userId && internalUserIds().has(ctx.userId));
    if (isInternal) {
      return { name, enabled: true, reason: "internal", rolloutPercent };
    }
  }

  // 3b. Deterministic percentage rollout, keyed on a stable identity.
  if (rolloutPercent > 0) {
    const identity = ctx.userId ?? ctx.projectId ?? null;
    if (!identity) {
      return { name, enabled: false, reason: "rollout-no-identity", rolloutPercent };
    }
    if (stableBucket(`${name}:${identity}`) < rolloutPercent) {
      return { name, enabled: true, reason: "rollout", rolloutPercent };
    }
    return { name, enabled: false, reason: "rollout", rolloutPercent };
  }

  return { name, enabled: false, reason: "default-off", rolloutPercent };
}

export function isFeatureEnabled(name: FeatureFlagName, ctx: FeatureFlagContext = {}): boolean {
  return featureFlagState(name, ctx).enabled;
}

/** Flat `{ flagName: boolean }` map — safe to attach to a log line or debug route. */
export function featureFlagSnapshot(ctx: FeatureFlagContext = {}): Record<FeatureFlagName, boolean> {
  const out = {} as Record<FeatureFlagName, boolean>;
  for (const name of FEATURE_FLAG_NAMES) out[name] = isFeatureEnabled(name, ctx);
  return out;
}

/** Full state per flag — for an admin/debug view that must explain WHY. */
export function describeFeatureFlags(ctx: FeatureFlagContext = {}): FeatureFlagState[] {
  return FEATURE_FLAG_NAMES.map((name) => featureFlagState(name, ctx));
}
