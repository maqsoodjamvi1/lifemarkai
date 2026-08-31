import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { describeFigmaTree, type FigmaNode } from "@/lib/figma/describe-tree";

/** Native /api/figma — fetch a Figma file, summarize into an AI clone prompt. */
const FIGMA_API = "https://api.figma.com/v1";

interface FigmaFileResponse {
  name: string;
  document: FigmaNode;
  components: Record<string, { name: string; description: string }>;
}

export const Route = createFileRoute("/api/figma")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const rl = rateLimit(user.id, { limit: 20, windowMs: 60 });
        if (!rl.success) {
          return Response.json({ error: "Rate limit exceeded." }, { status: 429, headers: { "X-RateLimit-Reset": String(rl.resetAt) } });
        }

        const { figmaUrl, figmaToken } = await request.json();
        if (!figmaUrl || !figmaToken) {
          return Response.json({ error: "figmaUrl and figmaToken are required" }, { status: 400 });
        }

        const fileKeyMatch = figmaUrl.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
        if (!fileKeyMatch) {
          return Response.json({ error: "Invalid Figma URL — could not extract file key" }, { status: 400 });
        }
        const fileKey = fileKeyMatch[1];

        const figmaRes = await fetch(`${FIGMA_API}/files/${fileKey}?depth=4`, {
          headers: { "X-Figma-Token": figmaToken },
        });
        if (!figmaRes.ok) {
          const body = await figmaRes.text();
          return Response.json({ error: `Figma API error ${figmaRes.status}: ${body}` }, { status: figmaRes.status });
        }

        const figmaFile = (await figmaRes.json()) as FigmaFileResponse;

        const pageDescriptions = figmaFile.document.children
          ?.slice(0, 5)
          .map((page) => `=== Page: "${page.name}" ===\n${describeFigmaTree(page)}`)
          .join("\n\n");

        const componentNames = Object.values(figmaFile.components ?? {})
          .slice(0, 30)
          .map((c) => `- ${c.name}${c.description ? `: ${c.description}` : ""}`)
          .join("\n");

        const summary = {
          fileName: figmaFile.name,
          fileKey,
          pages: figmaFile.document.children?.map((p) => p.name) ?? [],
          componentCount: Object.keys(figmaFile.components ?? {}).length,
          aiPrompt: `I want to recreate this Figma design as a React + Tailwind CSS app.

File: "${figmaFile.name}"

Layout structure:
${pageDescriptions ?? "(no pages found)"}

${componentNames ? `Named components:\n${componentNames}` : ""}

Each node above lists its real fill/stroke colors as hex, font family/size/weight for text, auto-layout direction/gap/padding (map HORIZONTAL/VERTICAL directly to flex-row/flex-col with the given gap and padding), and the ACTUAL text content in quotes after "text:" for every TEXT node — use that exact copy verbatim, do not invent placeholder text for anything that has a "text:" value.

Please generate React components that faithfully reproduce this UI using Tailwind CSS classes, using the exact colors, fonts, spacing, and copy given above rather than approximating them. Use semantic HTML and accessible markup, and match the visual hierarchy and layout direction shown above.`,
        };

        return Response.json(summary);
      },
    },
  },
});
