"use client";

import { useEffect } from "react";

export function ProjectViewTracker({ projectId }: { projectId: string }) {
  useEffect(() => {
    // Fire-and-forget — don't block page render
    fetch(`/api/projects/${projectId}/views`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referrer: document.referrer }),
    }).catch(() => {}); // silently ignore errors
  }, [projectId]);

  return null;
}
