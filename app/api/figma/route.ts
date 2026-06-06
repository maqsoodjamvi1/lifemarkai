import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

const FIGMA_API = "https://api.figma.com/v1";

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  absoluteBoundingBox?: { width: number; height: number };
  backgroundColor?: { r: number; g: number; b: number; a: number };
}

interface FigmaFileResponse {
  name: string;
  document: FigmaNode;
  components: Record<string, { name: string; description: string }>;
}

/** Flatten Figma nodes to a simple description for AI prompt context. */
function describeFigmaTree(node: FigmaNode, depth = 0): string {
  const indent = "  ".repeat(depth);
  const size = node.absoluteBoundingBox
    ? ` (${Math.round(node.absoluteBoundingBox.width)}×${Math.round(node.absoluteBoundingBox.height)})`
    : "";
  let out = `${indent}${node.type}: "${node.name}"${size}\n`;
  if (node.children && depth < 4) {
    for (const child of node.children.slice(0, 20)) {
      out += describeFigmaTree(child, depth + 1);
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimit(user.id, { limit: 20, windowMs: 60 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded." },
      { status: 429, headers: { "X-RateLimit-Reset": String(rl.resetAt) } }
    );
  }

  const { figmaUrl, figmaToken } = await req.json();

  if (!figmaUrl || !figmaToken) {
    return NextResponse.json(
      { error: "figmaUrl and figmaToken are required" },
      { status: 400 }
    );
  }

  // Extract file key from Figma URL
  // https://www.figma.com/file/XXXXX/...  or  https://www.figma.com/design/XXXXX/...
  const fileKeyMatch = figmaUrl.match(
    /figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/
  );
  if (!fileKeyMatch) {
    return NextResponse.json(
      { error: "Invalid Figma URL — could not extract file key" },
      { status: 400 }
    );
  }

  const fileKey = fileKeyMatch[1];

  // Fetch Figma file metadata
  const figmaRes = await fetch(`${FIGMA_API}/files/${fileKey}?depth=4`, {
    headers: {
      "X-Figma-Token": figmaToken,
    },
  });

  if (!figmaRes.ok) {
    const body = await figmaRes.text();
    return NextResponse.json(
      { error: `Figma API error ${figmaRes.status}: ${body}` },
      { status: figmaRes.status }
    );
  }

  const figmaFile = (await figmaRes.json()) as FigmaFileResponse;

  // Build a structured description for the AI
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

Please generate React components that faithfully reproduce this UI using Tailwind CSS classes. Use semantic HTML, accessible markup, and match the visual hierarchy shown above.`,
  };

  return NextResponse.json(summary);
}
