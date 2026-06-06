"use client";

import { useEffect } from "react";

const KEY = "lm-recent-projects";
const MAX = 4;

export interface RecentProject {
  id: string;
  name: string;
  framework: string;
  visitedAt: number;
}

/** Read the recent-projects list from localStorage (safe to call on server — returns []). */
export function getRecentProjects(): RecentProject[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as RecentProject[];
  } catch {
    return [];
  }
}

/** Push a project visit into the list, capping at MAX entries. */
export function recordProjectVisit(project: { id: string; name: string; framework: string }) {
  if (typeof window === "undefined") return;
  try {
    const prev = getRecentProjects().filter((p) => p.id !== project.id);
    const next: RecentProject[] = [
      { ...project, visitedAt: Date.now() },
      ...prev,
    ].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
}

/**
 * Call this inside any editor page component to record the current project visit.
 * Safe to call multiple times — deduplicates by id.
 */
export function useRecordProjectVisit(project: { id: string; name: string; framework: string }) {
  useEffect(() => {
    recordProjectVisit(project);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);
}
