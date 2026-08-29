/**
 * Pure logic behind DashboardHome.sharedProjects (src/lib/dashboard-server.ts)
 * — turning a `collaborators` query's embedded `projects` rows into the list
 * the dashboard's "Shared with me" tab (project-browser-tabs.tsx) renders.
 *
 * Pulled out so the filtering (a collaborator row with no matching project —
 * the project was deleted after the invite was accepted — or an archived
 * one) is unit tested rather than only exercised by a live query.
 */

export interface CollaboratorProjectRow<T> {
  projects: T | null;
}

export function extractSharedProjects<T extends { id: string; status?: string | null }>(
  rows: CollaboratorProjectRow<T>[],
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const row of rows) {
    const project = row.projects;
    // The embedded `projects` value can come back null — the project was
    // deleted after the invite was accepted, or RLS no longer grants this
    // collaborator visibility into it — so this isn't optional.
    if (!project || project.status === "archived") continue;
    if (seen.has(project.id)) continue;
    seen.add(project.id);
    result.push(project);
  }
  return result;
}
