import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { extractDocumentText } from "@/lib/ai/document-extract";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB — plenty for a text-bearing docx/xlsx/pptx

async function handlePOST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: 20 extractions per minute — same ceiling as /api/ai/transcribe.
  const rl = rateLimit(user.id, { limit: 20, windowMs: 60 });
  if (!rl.success) {
    return Response.json(
      { error: "Rate limit exceeded." },
      { status: 429, headers: { "X-RateLimit-Reset": String(rl.resetAt) } },
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  if (file.size > MAX_FILE_SIZE) {
    return Response.json(
      { error: `File too large. Maximum is ${MAX_FILE_SIZE / 1024 / 1024}MB.` },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await extractDocumentText(buffer, file.name);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 422 });
  }
  return Response.json({ text: result.text });
}

export const Route = createFileRoute("/api/ai/extract-document")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePOST(request),
    },
  },
});
