import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { buildDeployIndexHtml } from "@/lib/deploy/build-deploy-files";
import { NextRequest, NextResponse } from "next/server";

/** GET /api/deploy/build-stats?projectId=<id> — verify deploy HTML build without publishing */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { user, source } = await getServerUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, name, badge_hidden, project_files(path, content)")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const files =
    (project.project_files as Array<{ path: string; content: string }>) ?? [];
  const html = buildDeployIndexHtml(files, {
    projectId,
    projectName: project.name as string,
    badgeHidden: (project as any).badge_hidden ?? false,
  });

  const stats = {
    sourceFiles: files.length,
    deployHtmlLen: html.length,
    hasMatchRoute: html.includes("function matchRoute"),
    hasModules: html.includes("lifemark-module"),
    oldSingleAppOnly:
      html.includes("React.createElement(App)") && !html.includes("lifemark-module"),
    authSource: source,
  };

  return NextResponse.json(stats);
}
