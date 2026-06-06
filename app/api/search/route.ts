import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export interface SearchResult {
  type: "project" | "file" | "message";
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  snippet: string;
  url: string;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  total: number;
}

function excerpt(text: string, query: string, maxLen = 120): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, maxLen) + (text.length > maxLen ? "…" : "");
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 80);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("q") ?? "").trim();
    if (!query || query.length < 2) {
      return NextResponse.json({ results: [], query, total: 0 });
    }
    if (query.length > 200) {
      return NextResponse.json({ error: "Query too long" }, { status: 400 });
    }

    // Fetch user projects first (needed to scope file + message queries)
    const { data: projects } = await (supabase as any)
      .from("projects")
      .select("id, name, framework, created_at")
      .eq("user_id", user.id)
      .ilike("name", `%${query}%`)
      .order("created_at", { ascending: false })
      .limit(5);

    const { data: allProjects } = await (supabase as any)
      .from("projects")
      .select("id, name")
      .eq("user_id", user.id)
      .limit(200);

    const projectMap: Record<string, string> = Object.fromEntries(
      (allProjects ?? []).map((p: { id: string; name: string }) => [p.id, p.name])
    );
    const projectIds = Object.keys(projectMap);

    // Parallel: file search + message search
    const [filesRes, messagesRes] = await Promise.all([
      projectIds.length
        ? (supabase as any)
            .from("project_files")
            .select("id, project_id, path, content, language")
            .in("project_id", projectIds)
            .or(`path.ilike.%${query}%,content.ilike.%${query}%`)
            .limit(10)
        : Promise.resolve({ data: [] }),
      projectIds.length
        ? (supabase as any)
            .from("messages")
            .select("id, project_id, role, content, created_at")
            .in("project_id", projectIds)
            .ilike("content", `%${query}%`)
            .eq("role", "user")
            .order("created_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] }),
    ]);

    const results: SearchResult[] = [];

    // Project matches
    for (const p of (projects ?? []) as Array<{ id: string; name: string; framework: string }>) {
      results.push({
        type: "project",
        id: p.id,
        projectId: p.id,
        projectName: p.name,
        title: p.name,
        snippet: `${p.framework ?? "react"} project`,
        url: `/editor/${p.id}`,
      });
    }

    // File matches
    for (const f of (filesRes.data ?? []) as Array<{
      id: string; project_id: string; path: string; content: string; language?: string;
    }>) {
      const pName = projectMap[f.project_id] ?? "Unknown";
      // Prefer path match title over content match
      const pathMatch = f.path.toLowerCase().includes(query.toLowerCase());
      results.push({
        type: "file",
        id: f.id,
        projectId: f.project_id,
        projectName: pName,
        title: f.path,
        snippet: pathMatch
          ? `${f.language ?? "file"} · ${pName}`
          : excerpt(f.content ?? "", query),
        url: `/editor/${f.project_id}?file=${encodeURIComponent(f.path)}`,
      });
    }

    // Message matches
    for (const m of (messagesRes.data ?? []) as Array<{
      id: string; project_id: string; content: string;
    }>) {
      const pName = projectMap[m.project_id] ?? "Unknown";
      results.push({
        type: "message",
        id: m.id,
        projectId: m.project_id,
        projectName: pName,
        title: excerpt(m.content, query, 60),
        snippet: excerpt(m.content, query),
        url: `/editor/${m.project_id}`,
      });
    }

    return NextResponse.json({ results, query, total: results.length });
  } catch (err) {
    console.error("[search]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
