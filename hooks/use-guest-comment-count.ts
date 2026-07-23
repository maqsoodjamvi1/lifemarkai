"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ProjectCommentRow {
  id: string;
  parent_id: string | null;
  resolved: boolean;
  is_guest?: boolean;
}

export interface GuestCommentCountState {
  count: number;
  loading: boolean;
  refresh: () => void;
}

/** Polls unresolved top-level guest comments for the composer banner. */
export function useGuestCommentCount(projectId: string | undefined): GuestCommentCountState {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setCount(0);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/comments`);
      if (!res.ok) return;
      const rows = (await res.json()) as ProjectCommentRow[];
      const openGuest = rows.filter(
        (c) => !c.parent_id && c.is_guest && !c.resolved,
      ).length;
      setCount(openGuest);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!projectId) return;
    const supabase = createClient();
    // Unique topic per mount — chat + preview both use this hook and must not
    // share a subscribed channel (Supabase rejects .on() after subscribe()).
    const channel = supabase
      .channel(`guest-comments:${projectId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "project_comments",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [projectId, refresh]);

  return { count, loading, refresh };
}
