// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * 21st.dev component import.
 *
 *  POST body: { projectId: string, url: string, targetPath?: string }
 *
 * Lovable lets users paste a 21st.dev URL to drop a hero/nav/testimonial/etc.
 * straight into their project. We do the same by fetching the public component
 * source from 21st.dev and writing it as a project file.
 *
 * 21st.dev URL shapes:
 *   https://21st.dev/components/<slug>
 *   https://21st.dev/<user>/<repo>/<slug>
 */

function parseUrl(url: string): { slug: string } | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("21st.dev")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const slug = parts[parts.length - 1];
    if (!slug) return null;
    return { slug };
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, url, targetPath } = await req.json() as {
    projectId: string; url: string; targetPath?: string;
  };
  if (!projectId || !url) {
    return NextResponse.json({ error: "projectId and url required" }, { status: 400 });
  }

  // Verify ownership
  const { data: project } = await supabase
    .from("projects")
    .select("id, framework")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const parsed = parseUrl(url);
  if (!parsed) {
    return NextResponse.json({ error: "Not a valid 21st.dev URL" }, { status: 400 });
  }

  // Fetch the raw component source. 21st.dev exposes a `?raw=true` query for raw TSX.
  // If that doesn't work, fall back to scraping the page and extracting the code block.
  let code = "";
  let componentName = parsed.slug.replace(/[^a-zA-Z0-9]+/g, "");
  componentName = componentName.charAt(0).toUpperCase() + componentName.slice(1);

  try {
    const rawRes = await fetch(`${url.replace(/\/$/, "")}/raw`, {
      headers: { "User-Agent": "LifemarkAI-21st-import/1.0" },
    });
    if (rawRes.ok) {
      code = await rawRes.text();
    } else {
      // Fallback: scrape page HTML
      const pageRes = await fetch(url, {
        headers: { "User-Agent": "LifemarkAI-21st-import/1.0" },
      });
      if (!pageRes.ok) {
        return NextResponse.json({ error: `21st.dev returned ${pageRes.status}` }, { status: 502 });
      }
      const html = await pageRes.text();
      // Extract a code block — very fragile, primarily a backstop
      const m = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
      if (m) {
        code = m[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
      }
    }
  } catch (err) {
    return NextResponse.json({ error: `Fetch failed: ${(err as Error).message}` }, { status: 502 });
  }

  if (!code.trim()) {
    return NextResponse.json({
      error: "Could not extract component source from 21st.dev. Paste the code manually instead.",
      hint: "Open the component on 21st.dev, copy the code, and use the AI chat to add it.",
    }, { status: 422 });
  }

  // Pick a sensible target path
  const finalPath = targetPath ?? `src/components/${componentName}.tsx`;

  // Write file (replace if exists)
  const { data: existing } = await supabase
    .from("project_files")
    .select("id")
    .eq("project_id", projectId)
    .eq("path", finalPath)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("project_files")
      .update({ content: code, language: "tsx" })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("project_files")
      .insert({ project_id: projectId, path: finalPath, language: "tsx", content: code });
  }

  return NextResponse.json({
    ok: true,
    component: componentName,
    path: finalPath,
    bytes: code.length,
    next_step: `Import ${componentName} from "${finalPath.replace(/\.tsx$/, "")}" in your page.`,
  });
}
