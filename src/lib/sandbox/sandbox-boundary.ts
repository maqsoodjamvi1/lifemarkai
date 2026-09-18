/**
 * Sandbox isolation for shared services — package mirrors, caches, volumes,
 * and preview URLs are not harmless just because they are "infrastructure".
 *
 * OpenAI's August 2026 agent incident used a permitted package service as an
 * unintended communication channel. LifeMarkAI therefore: scopes credentials
 * per project, denies cross-sandbox storage, allowlists egress intent, redacts
 * secrets from logs, and terminates a sandbox that starts probing.
 */
import { SECRET_PATTERNS } from "../security/detect-secret.ts";

export const SANDBOX_ISOLATION_LABEL = "lifemark.isolation";
export const SANDBOX_CREDENTIAL_SCOPE_LABEL = "lifemark.credential-scope";
export const SANDBOX_NO_SHARED_STORAGE_LABEL = "lifemark.no-shared-storage";

/** Destinations generated apps may reach from a preview sandbox. */
export const ALLOWED_SANDBOX_EGRESS_HOSTS = [
  "registry.npmjs.org",
  "registry.yarnpkg.com",
  "npm.pkg.github.com",
  "nodejs.org",
  "registry.npmmirror.com",
] as const;

const BLOCKED_PROBE_HOSTS = [
  "169.254.169.254",
  "metadata.google.internal",
  "kubernetes.default",
  "kubernetes.default.svc",
  "docker.sock",
];

export interface SandboxIsolationPolicy {
  labels: Record<string, string>;
  extraHosts: string[];
  binds: string[];
  volumesFrom: string[];
}

export function sandboxIsolationPolicy(projectId: string): SandboxIsolationPolicy {
  const scope = projectId.trim();
  return {
    labels: {
      [SANDBOX_ISOLATION_LABEL]: "per-project",
      [SANDBOX_CREDENTIAL_SCOPE_LABEL]: scope,
      [SANDBOX_NO_SHARED_STORAGE_LABEL]: "1",
    },
    extraHosts: [
      "metadata.google.internal:0.0.0.0",
      "kubernetes.default:0.0.0.0",
      "kubernetes.default.svc:0.0.0.0",
    ],
    binds: [],
    volumesFrom: [],
  };
}

export function assertSandboxStorageIsolation(hostConfig: {
  Binds?: string[] | null;
  VolumesFrom?: string[] | null;
}): string[] {
  const errors: string[] = [];
  if ((hostConfig.Binds ?? []).length > 0) {
    errors.push("sandbox HostConfig.Binds must be empty — shared volumes are a cross-project channel");
  }
  if ((hostConfig.VolumesFrom ?? []).length > 0) {
    errors.push("sandbox HostConfig.VolumesFrom must be empty — do not inherit another container's filesystem");
  }
  return errors;
}

export function isAllowedSandboxEgressHost(host: string, previewDomain?: string | null): boolean {
  const normalized = host.trim().toLowerCase().replace(/:\d+$/, "");
  if (!normalized) return false;
  if (BLOCKED_PROBE_HOSTS.some((blocked) => normalized.includes(blocked))) return false;
  if (ALLOWED_SANDBOX_EGRESS_HOSTS.some((allowed) => normalized === allowed || normalized.endsWith(`.${allowed}`))) {
    return true;
  }
  const domain = (previewDomain ?? "").trim().toLowerCase();
  if (domain && (normalized === domain || normalized.endsWith(`.${domain}`))) return true;
  return false;
}

export function redactSandboxOutput(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    const flags = pattern.re.flags.includes("g") ? pattern.re.flags : `${pattern.re.flags}g`;
    try {
      out = out.replace(new RegExp(pattern.re.source, flags), `{{${pattern.name}}}`);
    } catch {
      /* a hostile pattern must never break log collection */
    }
  }
  out = out.replace(
    /\b([A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PRIVATE)[A-Z0-9_]*)\s*[:=]\s*['"]?[^\s'"]{8,}/g,
    "$1={{redacted}}",
  );
  return out;
}

export interface SandboxProbeVerdict {
  shouldTerminate: boolean;
  reason: string | null;
}

const PROBE_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /169\.254\.169\.254|metadata\.google\.internal|\/latest\/meta-data/i, reason: "cloud-metadata probe" },
  { re: /\/var\/run\/docker\.sock|docker\.sock/i, reason: "docker-socket probe" },
  { re: /\/proc\/1\/environ|\/proc\/self\/environ/i, reason: "process-environ probe" },
  { re: /npm\s+config\s+set\s+registry\s+https?:\/\/(?!registry\.npmjs\.org)/i, reason: "npm-registry redirect" },
  { re: /(?:curl|wget|nc|ncat|ncat)\s+[^\n]*(?:169\.254|metadata\.google|docker\.sock)/i, reason: "egress probe tool" },
];

export function detectAnomalousSandboxProbe(output: string): SandboxProbeVerdict {
  for (const pattern of PROBE_PATTERNS) {
    if (pattern.re.test(output)) {
      return { shouldTerminate: true, reason: pattern.reason };
    }
  }
  return { shouldTerminate: false, reason: null };
}
