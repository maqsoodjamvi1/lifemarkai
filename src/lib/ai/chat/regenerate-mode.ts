export type RegenerableMode = "chat" | "plan" | "build" | "agent";

/**
 * Pick the mode for Regenerate.
 *
 * Forcing "build" on every regenerate mutated Q&A turns and burned credits.
 * Trusting only `user.mode` was poisoned when a prior bug persisted chat on
 * a build. File-change metadata on the assistant is the durable signal:
 * if that turn wrote files, rebuild; otherwise replay the original mode.
 */
export function resolveRegenerateMode(opts: {
  userMode?: string | null;
  assistantFilesChanged?: unknown;
}): RegenerableMode {
  const files = Array.isArray(opts.assistantFilesChanged)
    ? opts.assistantFilesChanged.filter((path): path is string => typeof path === "string" && path.length > 0)
    : [];
  if (files.length > 0) return "build";

  const mode = opts.userMode;
  if (mode === "plan") return "plan";
  if (mode === "agent") return "agent";
  if (mode === "build" || mode === "patch") return "build";
  return "chat";
}
