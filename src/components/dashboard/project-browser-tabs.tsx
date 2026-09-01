import { useMemo,useState,useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { ProjectsGrid } from "@/components/dashboard/projects-grid";
import { FeaturedTemplates } from "@/components/dashboard/featured-templates";
import { getRecentProjects } from "@/hooks/use-recent-projects";
import type { Project } from "@/types/database";

type TabId = "mine" | "recent" | "starred" | "shared" | "visitors" | "templates";

interface TemplateMeta {
  id: string;
  name: string;
  description: string | null;
  category: string;
  fork_count: number | null;
  preview_url: string | null;
}

interface ProjectBrowserTabsProps {
  projects: Project[];
  /**
   * Projects someone else owns and shared with this user (an accepted
   * `collaborators` row) — see DashboardHome.sharedProjects in
   * src/lib/dashboard-server.ts for why this can't be derived from
   * `projects` by filtering `is_public`.
   */
  sharedProjects?: Project[];
  templates: TemplateMeta[];
  initialTab?: TabId;
}

const TABS: { id: TabId; label: string }[] = [
  { id: "mine", label: "My projects" },
  { id: "recent", label: "Recently viewed" },
  { id: "starred", label: "Starred" },
  { id: "shared", label: "Shared with me" },
  { id: "visitors", label: "Most visitors" },
  { id: "templates", label: "Templates" },
];

export function ProjectBrowserTabs({ projects, sharedProjects = [], templates, initialTab = "mine" }: ProjectBrowserTabsProps) {
  const [tab, setTab] = useState<TabId>(initialTab);

  // `useState(initialTab)` only reads the prop on first mount. A sidebar
  // link to e.g. /dashboard?tab=starred re-renders this component with a
  // new `initialTab` but doesn't remount it (same route), so without this
  // effect the tab strip silently ignores the deep link and stays on
  // whatever tab was already showing.
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const filtered = useMemo(() => {
    if (tab === "starred") return projects.filter((p) => p.is_starred);
    // "Shared with me" means someone else's project shared with THIS user —
    // filtering `projects` (this user's own) by is_public used to show the
    // user's own public projects mislabeled as shared, or nothing at all.
    if (tab === "shared") return sharedProjects;
    if (tab === "recent") {
      const recentIds = getRecentProjects().map((r) => r.id);
      const byId = new Map(projects.map((p) => [p.id, p]));
      return recentIds.map((id) => byId.get(id)).filter(Boolean) as Project[];
    }
    if (tab === "visitors") {
      return [...projects]
        .filter((p) => (p.total_views ?? 0) > 0)
        .sort((a, b) => (b.total_views ?? 0) - (a.total_views ?? 0));
    }
    return projects;
  }, [projects, sharedProjects, tab]);

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-border mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? "border-violet-500 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
        <Link
          to="/templates"
          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-violet-500 whitespace-nowrap pb-2"
        >
          Browse all <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>

      {tab === "templates" ? (
        <FeaturedTemplates templates={templates} projectCount={projects.length} />
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          {tab === "shared"
            ? "No projects have been shared with you yet — ask an owner to add you as a collaborator to see it here."
            : tab === "starred"
              ? "Star projects from the editor to see them here."
              : tab === "recent"
                ? "Open a project to see it in recently viewed."
                : tab === "visitors"
                  ? "No visitor data yet — deploy a project and share it to see traffic here."
                  : "No projects yet — use the prompt above to create one."}
        </div>
      ) : (
        <ProjectsGrid projects={filtered} emphasizeViews={tab === "visitors"} />
      )}
    </div>
  );
}
