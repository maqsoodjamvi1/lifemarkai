/** Lovable-style build activity steps shown during build/patch streams. */

export type BuildActivityStatus = "pending" | "running" | "done";

export interface BuildActivityStep {
  id: string;
  label: string;
  status: BuildActivityStatus;
}

export function initialBuildActivitySteps(fileCount: number): BuildActivityStep[] {
  const readLabel =
    fileCount > 0
      ? `Read ${fileCount} file${fileCount !== 1 ? "s" : ""}`
      : "Read project";
  return [
    { id: "read", label: readLabel, status: "done" },
    { id: "plan", label: "Planning changes…", status: "running" },
  ];
}

export function applyBuildIntentLabel(
  steps: BuildActivityStep[],
  statusLabel: string,
): BuildActivityStep[] {
  return steps.map((s) => (s.id === "plan" ? { ...s, label: statusLabel } : s));
}

/** Advance plan → generate when files start landing (per-file edits use separate cards). */
export function onBuildFileProgress(steps: BuildActivityStep[]): BuildActivityStep[] {
  const next = steps.map((s) =>
    s.id === "plan" && s.status === "running" ? { ...s, status: "done" as const } : s,
  );
  const hasGenerate = next.some((s) => s.id === "generate");
  if (hasGenerate) {
    return next.map((s) => (s.id === "generate" ? { ...s, status: "running" as const } : s));
  }
  return [...next, { id: "generate", label: "Writing files…", status: "running" as const }];
}

export function finalizeBuildActivity(
  steps: BuildActivityStep[],
  fileCount: number,
  opts?: { githubRepo?: string | null },
): BuildActivityStep[] {
  let next = steps.map((s) =>
    s.status === "running" ? { ...s, status: "done" as const } : s,
  );

  if (fileCount > 0 && !next.some((s) => s.id === "saved")) {
    next = [
      ...next,
      {
        id: "saved",
        label: `Saved ${fileCount} file${fileCount !== 1 ? "s" : ""} to project`,
        status: "done",
      },
    ];
  }

  if (opts?.githubRepo && !next.some((s) => s.id === "github")) {
    const shortRepo = opts.githubRepo.replace(/^gitlab:/, "").split("/").slice(-2).join("/");
    next = [
      ...next,
      {
        id: "github",
        label: `Connected to GitHub · ${shortRepo}`,
        status: "done",
      },
    ];
  }

  return next;
}

/** Reconstruct completed steps server-side for DB persistence + SSE done payload. */
export function buildCompletedBuildActivity(
  fileCount: number,
  statusLabel: string | null,
  filesGenerated: number,
  opts?: { githubRepo?: string | null },
): BuildActivityStep[] {
  let steps = initialBuildActivitySteps(fileCount);
  if (statusLabel) steps = applyBuildIntentLabel(steps, statusLabel);
  for (let i = 0; i < filesGenerated; i++) {
    steps = onBuildFileProgress(steps);
  }
  return finalizeBuildActivity(steps, filesGenerated, opts);
}
