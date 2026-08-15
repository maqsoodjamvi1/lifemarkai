export type CoreLoopApiMethod = "GET" | "POST";

export const CORE_LOOP_API_SURFACE = [
  { method: "POST", path: "/api/projects" },
  { method: "POST", path: "/api/ai/chat" },
  { method: "POST", path: "/api/projects/:projectId/sandbox-preview" },
  { method: "GET", path: "/api/projects/:projectId/sandbox-preview" },
  { method: "POST", path: "/api/projects/:projectId/sandbox-preview/stop" },
  { method: "POST", path: "/api/projects/:projectId/preview-verify" },
  { method: "POST", path: "/api/deploy" },
  { method: "GET", path: "/api/deploy" },
] as const;

export function normalizeCoreLoopApiPath(value: string): string {
  const pathname = new URL(value, "http://core-loop.local").pathname;
  return pathname.replace(
    /^\/api\/projects\/[^/]+\/(sandbox-preview(?:\/stop)?|preview-verify)$/,
    "/api/projects/:projectId/$1",
  );
}

export function isCoreLoopApiRequest(method: string, value: string): boolean {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = normalizeCoreLoopApiPath(value);
  return CORE_LOOP_API_SURFACE.some(
    (entry) => entry.method === normalizedMethod && entry.path === normalizedPath,
  );
}

export function assertCoreLoopApiRequest(method: string, value: string): void {
  if (!isCoreLoopApiRequest(method, value)) {
    throw new Error(
      `Core-loop contract rejected ${method.toUpperCase()} ${normalizeCoreLoopApiPath(value)}`,
    );
  }
}
