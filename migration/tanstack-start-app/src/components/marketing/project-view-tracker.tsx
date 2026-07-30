import { useEffect } from "react";

/** Fire-and-forget view ping (proxied API). */
export function ProjectViewTracker({ projectId }: { projectId: string }) {
  useEffect(() => {
    void fetch(`/api/projects/${projectId}/view`, { method: "POST" }).catch(() => {});
  }, [projectId]);
  return null;
}
