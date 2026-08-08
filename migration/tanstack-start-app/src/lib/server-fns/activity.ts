import { createClient } from "../supabase/server.ts";
import { getServerUser } from "../supabase/server-user.ts";

export type ActivityEvent = {
  id: string;
  type: "generation" | "deploy" | "commit" | "project_created";
  projectId: string;
  projectName: string;
  description: string;
  createdAt: string;
};

export async function listActivity() {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!projects?.length) return { status: "ok" as const, events: [] as ActivityEvent[] };

  const projectIds = projects.map((p: { id: string }) => p.id);
  const projectMap: Record<string, string> = Object.fromEntries(
    projects.map((p: { id: string; name: string }) => [p.id, p.name]),
  );

  const [messagesRes, deploymentsRes] = await Promise.all([
    supabase
      .from("messages")
      .select("id, project_id, content, created_at")
      .in("project_id", projectIds)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("deployments")
      .select("id, project_id, status, url, created_at")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const events: ActivityEvent[] = [];

  for (const p of (projects as Array<{ id: string; name: string; created_at: string }>).slice(
    0,
    5,
  )) {
    events.push({
      id: `project-${p.id}`,
      type: "project_created",
      projectId: p.id,
      projectName: p.name,
      description: `Created project "${p.name}"`,
      createdAt: p.created_at,
    });
  }

  for (const msg of (messagesRes.data ?? []) as Array<{
    id: string;
    project_id: string;
    content: string;
    created_at: string;
  }>) {
    const snippet = msg.content.slice(0, 60).replace(/\n/g, " ").trim();
    events.push({
      id: `msg-${msg.id}`,
      type: "generation",
      projectId: msg.project_id,
      projectName: projectMap[msg.project_id] ?? "Unknown",
      description: snippet.length < msg.content.length ? `${snippet}…` : snippet,
      createdAt: msg.created_at,
    });
  }

  for (const dep of (deploymentsRes.data ?? []) as Array<{
    id: string;
    project_id: string;
    status: string;
    url?: string;
    created_at: string;
  }>) {
    const pName = projectMap[dep.project_id] ?? "Unknown";
    events.push({
      id: `deploy-${dep.id}`,
      type: "deploy",
      projectId: dep.project_id,
      projectName: pName,
      description:
        dep.status === "success"
          ? `Deployed "${pName}"${dep.url ? ` → ${dep.url}` : ""}`
          : `Deploy ${dep.status} for "${pName}"`,
      createdAt: dep.created_at,
    });
  }

  events.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  return { status: "ok" as const, events: events.slice(0, 15) };
}
