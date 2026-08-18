/**
 * Structured-output contracts — Phase 4 of the Vercel adoption plan.
 *
 * Zod schemas for every structured payload a model is asked to produce.
 * Today they harden the legacy path (parse-then-validate instead of trusting
 * regex extraction); when the AI SDK adapter takes over structured requests,
 * these same schemas become the SDK's schema arguments — one source of truth
 * for both transports, so the A/B measures the transport and not two
 * different validation regimes.
 *
 * All schemas are deliberately strict at the boundary the plan measures
 * ("invalid generated-file payloads decrease materially"): a payload that
 * fails here is a malformed RESPONSE, distinguishable from a bad-code
 * response, and is what the invalid-structured-response metric counts.
 */
import { z } from "zod";
import { normalizeGeneratedPath } from "./generated-file-contract.ts";

/** A project-relative path that survives the existing path-safety contract. */
export const safePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((raw) => normalizeGeneratedPath(raw) !== null, {
    message: "path must be project-relative and outside reserved directories",
  });

export const generatedFileSchema = z.object({
  path: safePathSchema,
  content: z.string(),
  language: z.string().max(32).optional(),
});

export const generatedFilesSchema = z.object({
  files: z.array(generatedFileSchema).min(1).max(200),
});

export const filePatchSchema = z.object({
  path: safePathSchema,
  find: z.string().min(1),
  replace: z.string(),
  /** How many occurrences the patch expects to hit; defaults to exactly one. */
  occurrences: z.number().int().min(1).max(100).default(1),
});

export const filePatchesSchema = z.object({
  patches: z.array(filePatchSchema).min(1).max(100),
});

export const planStepSchema = z.object({
  title: z.string().min(1).max(200),
  detail: z.string().max(2000).default(""),
  files: z.array(safePathSchema).max(50).default([]),
});

export const planSchema = z.object({
  summary: z.string().min(1).max(2000),
  steps: z.array(planStepSchema).min(1).max(30),
});

export const verificationResultSchema = z.object({
  passed: z.boolean(),
  errors: z.array(z.string().max(1000)).max(50).default([]),
  fixedFiles: z.array(safePathSchema).max(100).default([]),
});

export const followUpSuggestionsSchema = z.object({
  suggestions: z.array(z.string().min(1).max(200)).min(1).max(6),
});

export const migrationActionSchema = z.object({
  /** Migration file name, NOT free SQL-on-the-side: e.g. 175_add_orders.sql */
  filename: z.string().regex(/^\d{3}_[a-z0-9_]+\.sql$/),
  sql: z.string().min(1).max(200_000),
  description: z.string().max(500).default(""),
});

export type GeneratedFilesPayload = z.infer<typeof generatedFilesSchema>;
export type FilePatchesPayload = z.infer<typeof filePatchesSchema>;
export type PlanPayload = z.infer<typeof planSchema>;

export interface ContractParseResult<T> {
  ok: boolean;
  data?: T;
  /** Compact, model-feedable error list ("files.3.path: …"). */
  errors?: string[];
}

/**
 * Parse a raw model string (possibly fenced) against a schema.
 * Never throws — the caller decides between repair-loop and hard failure.
 */
export function parseStructuredResponse<T>(
  schema: z.ZodType<T>,
  raw: string,
): ContractParseResult<T> {
  let text = raw.trim();
  // Strip a single markdown fence if the model wrapped the JSON anyway.
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) text = fenced[1];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["response is not valid JSON"] };
  }
  const result = schema.safeParse(parsed);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    errors: result.error.issues.slice(0, 10).map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    ),
  };
}
