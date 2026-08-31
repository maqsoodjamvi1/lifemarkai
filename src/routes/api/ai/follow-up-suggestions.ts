import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { generateAI } from "@/lib/ai/generate";
import { getFastAiModel } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api/parse-body";
import { parseFollowUpSuggestions } from "@/lib/ai/parse-follow-up-suggestions";
import { z } from "zod";

/**
 * Native /api/ai/follow-up-suggestions — response-specific follow-up chips.
 *
 * chat-panel.tsx's own generateSuggestions()/suggestFollowUps() (static,
 * zero-latency keyword/pool matching) still fire first and paint instantly —
 * this route is called in the background afterward, and its result replaces
 * those chips once it resolves. That split matters: the static system is
 * deliberately kept as the always-available floor (see
 * src/lib/ai/follow-up-suggestions.ts's header comment on why it's static),
 * while this route is what makes the chips actually specific to what was
 * just built rather than picked from a generic pool that can suggest
 * something already present. If this call fails or is slow, the static
 * chips already on screen just stay — no loading state, no broken UI.
 */
export const Route = createFileRoute("/api/ai/follow-up-suggestions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
        if (!rl.success) return Response.json({ error: "Rate limited" }, { status: 429 });

        const parsed = await parseBody(request, z.object({
          projectId: z.string().min(1),
          userMessage: z.string().max(4000).default(""),
          aiResponse: z.string().max(8000).default(""),
          changedFiles: z.array(z.string()).max(50).default([]),
        }));
        if (parsed instanceof Response) return parsed;
        const { projectId, userMessage, aiResponse, changedFiles } = parsed as {
          projectId: string; userMessage: string; aiResponse: string; changedFiles: string[];
        };

        const { data: project } = await supabase
          .from("projects").select("id, user_id, name, framework").eq("id", projectId).single();
        if (!project || project.user_id !== user.id) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        const systemPrompt = `You suggest what a user building a web app might want to do NEXT, right after an AI just made a change for them.

Rules:
- Output exactly 3 suggestions, one per line, nothing else — no numbering, no bullets, no preamble, no explanation.
- Each suggestion is a short, specific, actionable feature or improvement request, written the way a user would type it (e.g. "Add pagination to the orders table", not "Consider adding pagination").
- Base suggestions on what was ACTUALLY just built (the files changed and what the response describes) — never suggest something the response indicates already exists.
- Prefer the next logical feature over generic polish (dark mode, responsiveness) unless nothing more specific fits.
- Max 80 characters per suggestion.`;

        const userPrompt = `Project: ${project.name} (${project.framework ?? "web app"})

User asked: ${userMessage.slice(0, 1500) || "(no message)"}

AI response: ${aiResponse.slice(0, 3000) || "(no response text)"}

Files changed this turn: ${changedFiles.slice(0, 30).join(", ") || "(none)"}

Give 3 specific follow-up suggestions for what to build next.`;

        try {
          const response = await generateAI({
            model: getFastAiModel(),
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            maxTokens: 150,
          }, { projectId, userId: user.id, task: "follow_up_suggestions" });

          const suggestions = parseFollowUpSuggestions(response.content ?? "");
          if (suggestions.length === 0) {
            return Response.json({ error: "AI returned no usable suggestions" }, { status: 500 });
          }
          return Response.json({ suggestions });
        } catch (e) {
          return Response.json({ error: "AI generation failed: " + String(e) }, { status: 500 });
        }
      },
    },
  },
});
