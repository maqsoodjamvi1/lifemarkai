/**
 * Sandbox isolation policy — OpenAI-incident-informed defaults.
 *
 * A container is not a sandbox by itself. Each generation job gets:
 *   - its own identity labels (no shared cross-job handle)
 *   - default-deny extra privileges (cap-drop ALL, no-new-privileges)
 *   - private writable storage (no shared volumes / npm cache mounts)
 *   - hard CPU, memory, PID, file-descriptor, and process budgets
 *   - optional registry-only egress (SANDBOX_EGRESS=registry + npm proxy)
 *
 * True default-deny internet requires a package proxy on the isolation
 * network; without SANDBOX_NPM_REGISTRY, registry mode refuses to boot
 * rather than silently opening egress.
 */

export const DEFAULT_ISOLATION_NETWORK = "lifemark-sandboxes";

export type SandboxEgressMode = "allow" | "registry";

type Environment = Record<string, string | undefined>;

export function sandboxEgressMode(env: Environment = process.env): SandboxEgressMode {
  const value = (env.SANDBOX_EGRESS ?? "allow").trim().toLowerCase();
  return value === "registry" || value === "deny" ? "registry" : "allow";
}

export function sandboxIsolationNetworkName(env: Environment = process.env): string {
  return env.SANDBOX_ISOLATION_NETWORK?.trim() || DEFAULT_ISOLATION_NETWORK;
}

export function sandboxNpmRegistry(env: Environment = process.env): string | null {
  const value = env.SANDBOX_NPM_REGISTRY?.trim();
  return value || null;
}

export function sandboxIsolationNetworkCreateBody(name: string, internal: boolean) {
  return {
    Name: name,
    Driver: "bridge",
    Internal: internal,
    CheckDuplicate: true,
    Labels: {
      "lifemark.isolation": "1",
    },
  };
}

export interface SandboxJobIdentity {
  projectId?: string;
  attemptId?: string;
  buildRunId?: string;
  requestId?: string;
}

export function sandboxJobId(identity: SandboxJobIdentity): string {
  return identity.attemptId || identity.buildRunId || identity.requestId || identity.projectId || "anonymous";
}

export function sandboxIsolationLabels(identity: SandboxJobIdentity): Record<string, string> {
  const labels: Record<string, string> = {
    "lifemark.sandbox": "1",
    "lifemark.job-id": sandboxJobId(identity),
  };
  if (identity.projectId) labels["lifemark.project"] = identity.projectId;
  if (identity.attemptId) labels["lifemark.attempt"] = identity.attemptId;
  if (identity.buildRunId) labels["lifemark.build-run"] = identity.buildRunId;
  if (identity.requestId) labels["lifemark.request"] = identity.requestId;
  return labels;
}

export function sandboxNpmInstallEnv(env: Environment = process.env): string[] {
  const registry = sandboxNpmRegistry(env);
  return registry ? [`npm_config_registry=${registry}`] : [];
}

export interface SandboxIsolationHostConfigInput {
  memoryMb: number;
  cpus: number;
  pidsLimit: number;
}

/**
 * Hardening flags applied to every preview container. Callers still set
 * NetworkMode / PortBindings / Init — those are routing concerns.
 */
export function sandboxIsolationHostConfig(input: SandboxIsolationHostConfigInput) {
  const memory = input.memoryMb * 1024 * 1024;
  return {
    Memory: memory,
    MemorySwap: memory,
    NanoCpus: Math.round(input.cpus * 1e9),
    PidsLimit: input.pidsLimit,
    CapDrop: ["ALL"] as string[],
    SecurityOpt: ["no-new-privileges"],
    Binds: [] as string[],
    Tmpfs: { "/tmp": "rw,noexec,nosuid,size=64m" },
    Ulimits: [
      { Name: "nofile", Soft: 1024, Hard: 2048 },
      { Name: "nproc", Soft: 256, Hard: input.pidsLimit },
    ],
  };
}

export function registryEgressReady(env: Environment = process.env): { ok: true } | { ok: false; error: string } {
  if (sandboxEgressMode(env) !== "registry") return { ok: true };
  if (!sandboxNpmRegistry(env)) {
    return {
      ok: false,
      error:
        "SANDBOX_EGRESS=registry requires SANDBOX_NPM_REGISTRY (a job-local package proxy). Refusing to boot with open egress.",
    };
  }
  return { ok: true };
}
