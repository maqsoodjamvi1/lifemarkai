/**
 * Zod-validated request-body parsing for API routes (improvement #5).
 *
 * Replaces hand-rolled `await request.json()` + manual field checks with one
 * helper that returns either the typed data or a ready-to-return 400
 * Response with a stable shape: { error, issues? }.
 *
 * Usage:
 *   const parsed = await parseBody(request, schema);
 *   if (parsed instanceof Response) return parsed;
 *   // parsed is z.infer<typeof schema>
 */
import type { z } from "zod";

export async function parseBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.infer<S> | Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return Response.json(
      {
        error: "Invalid request body",
        issues: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  return result.data;
}
