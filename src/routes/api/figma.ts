import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { describeFigmaTree, type FigmaNode } from "@/lib/figma/describe-tree";
import { generateComponentFromFigmaNode } from "@/lib/figma/generate-component";

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

        // Real, deterministic code — not a description the AI has to
        // re-imagine into structure. Walks each top-level frame on the
        // first couple of pages directly into JSX/Tailwind (see
        // src/lib/figma/generate-component.ts for why this exists: exact
        // nesting and spacing by construction, rather than an approximation
        // reconstructed from prose). Capped at 6 components total — this is
        // a starting scaffold to hand to the AI for wiring up real
        // functionality, not a bulk file-export feature.
        const generatedComponents: Array<{ componentName: string; code: string; page: string }> = [];
        for (const page of (figmaFile.document.children ?? []).slice(0, 3)) {
          for (const frame of (page.children ?? []).slice(0, 3)) {
            if (generatedComponents.length >= 6) break;
            const { componentName, code } = generateComponentFromFigmaNode(frame);
            generatedComponents.push({ componentName, code, page: page.name });
          }
        }
        const generatedComponentsBlock = generatedComponents
          .map((c) => `--- ${c.componentName}.tsx (from page "${c.page}") ---\n${c.code}`)
          .join("\n\n");

        const summary = {
          fileName: figmaFile.name,
          fileKey,
          pages: figmaFile.document.children?.map((p) => p.name) ?? [],
          componentCount: Object.keys(figmaFile.components ?? {}).length,
          generatedComponents,
          aiPrompt: `I want to recreate this Figma design as a React + Tailwind CSS app.

File: "${figmaFile.name}"

Layout structure:
${pageDescriptions ?? "(no pages found)"}

${componentNames ? `Named components:\n${componentNames}` : ""}

Each node above lists its real fill/stroke colors as hex, font family/size/weight for text, auto-layout direction/gap/padding (map HORIZONTAL/VERTICAL directly to flex-row/flex-col with the given gap and padding), and the ACTUAL text content in quotes after "text:" for every TEXT node — use that exact copy verbatim, do not invent placeholder text for anything that has a "text:" value.

${generatedComponentsBlock ? `I've already generated real starting components directly from the design's layer tree — exact structure, spacing, colors, and copy, no guessing:

${generatedComponentsBlock}

Use these as the real starting point (adjust file names/paths to fit the project) rather than rewriting their structure from the description above — the description is there to explain what's THERE, these components are the actual translation. Then make them functional: wire up real interactivity, state, routing, and data instead of leaving them static.` : `Please generate React components that faithfully reproduce this UI using Tailwind CSS classes, using the exact colors, fonts, spacing, and copy given above rather than approximating them. Use semantic HTML and accessible markup, and match the visual hierarchy and layout direction shown above.`}`,
        };

        return Response.json(summary);
      },
    },
  },
});
