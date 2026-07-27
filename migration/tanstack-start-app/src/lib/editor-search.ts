/**
 * Typed URL search for /editor/$projectId — Zod + TanStack validateSearch.
 * Changes update React state instantly (no Next RSC refetch cycle).
 */
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";

export const editorModeSchema = z.enum(["plan", "build", "agent", "chat", "patch"]);
export const editorViewSchema = z.enum(["preview", "code", "both", "files"]);

/** Soft schema: invalid values are dropped instead of hard-failing navigation. */
export const editorSearchSchema = z
  .object({
    prompt: z.string().optional(),
    deploy: z.string().optional(),
    mode: editorModeSchema.optional(),
    /** Open this project file path in the code panel */
    file: z.string().min(1).optional(),
    /** Canvas layout: preview | code | both | files */
    view: editorViewSchema.optional(),
    /** Left tool panel id (chat, review, …) */
    panel: z.string().min(1).optional(),
    /** Snapshot / version marker (numeric or opaque string) */
    version: z.union([z.coerce.number().int().positive(), z.string().min(1)]).optional(),
    /** Diagnostic: force minimal EditorShell instead of shared EditorLayout */
    shell: z.union([z.literal("1"), z.literal("true"), z.coerce.boolean()]).optional(),
  })
  .catch({});

export type EditorSearch = z.infer<typeof editorSearchSchema>;

export const editorSearchValidator = zodValidator(editorSearchSchema);

/** Map legacy `view=split` (common in builder UIs) → `both`. */
export function normalizeEditorSearchInput(
  search: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...search };
  if (next.view === "split") next.view = "both";
  return next;
}
