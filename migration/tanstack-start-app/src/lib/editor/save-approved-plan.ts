/** Persist an approved plan to `.lovable/plan.md` (Lovable parity). */
export async function saveApprovedPlan(projectId: string, markdown: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/projects/${projectId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: ".lovable/plan.md",
        content: markdown,
        language: "markdown",
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
