"use client";

import { useState, useMemo, useCallback } from "react";
import { ProjectGroups, type ProjectGroup } from "./project-groups";
import { ProjectsGrid } from "./projects-grid";

interface ProjectWithGroup {
  id: string;
  group_id?: string | null;
  [key: string]: unknown;
}

interface ProjectsWithGroupsProps {
  projects: ProjectWithGroup[];
}

export function ProjectsWithGroups({ projects }: ProjectsWithGroupsProps) {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groupsVersion, setGroupsVersion] = useState(0);

  // Derive counts per group from the projects list
  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach((p) => {
      if (p.group_id) counts[p.group_id] = (counts[p.group_id] ?? 0) + 1;
    });
    return counts;
  }, [projects]);

  // Filter projects by selected group
  const filteredProjects = useMemo(() => {
    if (activeGroupId === null) return projects;
    return projects.filter((p) => p.group_id === activeGroupId);
  }, [projects, activeGroupId]);

  const handleGroupsChange = useCallback(() => {
    setGroupsVersion((v) => v + 1);
  }, []);

  return (
    <div className="flex gap-6">
      {/* Groups sidebar */}
      <aside className="w-44 shrink-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2.5">
          Groups
        </p>
        <ProjectGroups
          key={groupsVersion}
          activeGroupId={activeGroupId}
          totalCount={projects.length}
          groupCounts={groupCounts}
          onGroupSelect={setActiveGroupId}
          onGroupsChange={handleGroupsChange}
        />
      </aside>

      {/* Projects grid */}
      <div className="flex-1 min-w-0">
        {filteredProjects.length === 0 && activeGroupId !== null ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-4xl mb-3">📂</div>
            <p className="text-sm font-medium mb-1">No projects in this group</p>
            <p className="text-xs text-muted-foreground">
              Open a project and use the ⋯ menu to move it here.
            </p>
          </div>
        ) : (
          <ProjectsGrid projects={filteredProjects as any[]} />
        )}
      </div>
    </div>
  );
}
