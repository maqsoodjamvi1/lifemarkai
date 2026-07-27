// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";
import { rateLimit } from "@/lib/rate-limit";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB — Whisper API hard limit
const ALLOWED_TYPES = new Set([
  "audio/webm", "audio/mp4", "audio/mpeg", "audio/wav",
  "audio/ogg", "audio/flac", "audio/x-m4a",
]);

async function handlePOST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: 20 transcriptions per minute
  const rl = rateLimit(user.id, { limit: 20, windowMs: 60 });
  if (!rl.success) {
    return Response.json(
      { error: "Rate limit exceeded." },
      { status: 429, headers: { "X-RateLimit-Reset": String(rl.resetAt) } }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return Response.json(
      { error: `File too large. Maximum is ${MAX_FILE_SIZE / 1024 / 1024}MB.` },
      { status: 413 }
    );
  }

  // Validate mime type
  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json(
      { error: "Invalid file type. Must be an audio file." },
      { status: 415 }
    );
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "en",
  });

  return Response.json({ text: transcription.text });
}


export const Route = createFileRoute("/api/ai/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePOST(request),
    },
  },
});
