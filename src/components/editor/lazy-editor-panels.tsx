
import type { Dispatch,SetStateAction } from "react";
import dynamic from "@/lib/lazy-component";
import { importWithRetry } from "@/lib/import-with-retry";
import type { LeftPanel,EditorMode } from "./editor-layout";
import type { Project,ProjectFile,Profile } from "@/types/database";
import type { Collaborator } from "@/hooks/use-yjs-editor";

// ── Code-split heavy panels ───────────────────────────────────────────────────
// This module is itself loaded lazily by editor-layout, but its static imports
// were bundled into ONE chunk — opening any tool panel downloaded all ~85
// panels. The heaviest (recharts-based analytics + the largest modules) are
// split into their own chunks here, following the same
// dynamic(importWithRetry(...), { ssr: false }) pattern used in editor-layout.
const panelLoading = () => (
  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
    Loading panel…
  </div>
);

const CollaborationPanel = dynamic(importWithRetry(() => import("./collaboration-panel").then((m) => m.CollaborationPanel)), { ssr: false, loading: panelLoading });
const FigmaPanel = dynamic(importWithRetry(() => import("./figma-panel").then((m) => m.FigmaPanel)), { ssr: false, loading: panelLoading });
const SecurityPanel = dynamic(importWithRetry(() => import("./security-panel").then((m) => m.SecurityPanel)), { ssr: false, loading: panelLoading });
const PaymentsPanel = dynamic(importWithRetry(() => import("./payments-panel").then((m) => m.PaymentsPanel)), { ssr: false, loading: panelLoading });
const GitHubPanel = dynamic(importWithRetry(() => import("./github-panel").then((m) => m.GitHubPanel)), { ssr: false, loading: panelLoading });
const DomainsPanel = dynamic(importWithRetry(() => import("./domains-panel").then((m) => m.DomainsPanel)), { ssr: false, loading: panelLoading });
const ProjectSettingsPanel = dynamic(importWithRetry(() => import("./project-settings-panel").then((m) => m.ProjectSettingsPanel)), { ssr: false, loading: panelLoading });
const PublishPanel = dynamic(importWithRetry(() => import("./publish-panel").then((m) => m.PublishPanel)), { ssr: false, loading: panelLoading });
const EditorIntelligencePanel = dynamic(importWithRetry(() => import("./editor-intelligence-panel").then((m) => m.EditorIntelligencePanel)), { ssr: false, loading: panelLoading });
const CommentsPanel = dynamic(importWithRetry(() => import("./comments-panel").then((m) => m.CommentsPanel)), { ssr: false, loading: panelLoading });
const DiffViewerPanel = dynamic(importWithRetry(() => import("./diff-viewer-panel").then((m) => m.DiffViewerPanel)), { ssr: false, loading: panelLoading });
const ProjectSiteAnalyticsPanel = dynamic(
  importWithRetry(() => import("./project-site-analytics-panel").then((m) => m.ProjectSiteAnalyticsPanel)),
  { ssr: false, loading: panelLoading }
);
const ConnectorWizardPanel = dynamic(
  importWithRetry(() => import("./connector-wizard-panel").then((m) => m.ConnectorWizardPanel)),
  { ssr: false, loading: panelLoading }
);
const SeoPanel = dynamic(
  importWithRetry(() => import("./seo-panel").then((m) => m.SeoPanel)),
  { ssr: false, loading: panelLoading }
);
const LifemarkCloudPanel = dynamic(
  importWithRetry(() => import("./lifemark-cloud-panel").then((m) => m.LifemarkCloudPanel)),
  { ssr: false, loading: panelLoading }
);

export interface LazyPanelContext {
  rightPanel: LeftPanel;
  project: Project;
  currentProject: Project;
  profile: Profile | null;
  files: ProjectFile[];
  activeFile: ProjectFile | null;
  pid: string;
  projectSlug: string;
  credits: number;
  isLiveLocked: boolean;
  yjsCollaborators: Collaborator[];
  setRightPanel: (p: LeftPanel | null) => void;
  setViewMode: (mode: "preview" | "code" | "both") => void;
  setActiveFile: (f: ProjectFile | null) => void;
  setFiles: Dispatch<SetStateAction<ProjectFile[]>>;
  setEditorMode: (mode: EditorMode) => void;
  setPendingCrossRefPrompt: (p: string | null) => void;
  handleProjectUpdate: (updates: Partial<Project>) => void;
  handleFilesUpdate: (files: ProjectFile[], opts?: { replace?: boolean }) => void;
  handleFileUpdate: (file: ProjectFile) => void;
  handleEnvUpdateFile: (path: string, content: string) => void | Promise<void>;
  handleCreditsUpdate: (credits: number) => void;
  sendPromptToChat: (p: string) => void;
}

export function LovableToolPanelContent({
  rightPanel,
  currentProject,
  profile,
  files,
  pid,
  handleFilesUpdate,
  handleEnvUpdateFile,
  sendPromptToChat,
}: Pick<
  LazyPanelContext,
  | "rightPanel"
  | "currentProject"
  | "profile"
  | "files"
  | "pid"
  | "handleFilesUpdate"
  | "handleEnvUpdateFile"
  | "sendPromptToChat"
>) {
  if (rightPanel === "analytics") return <ProjectSiteAnalyticsPanel project={currentProject} />;
  if (rightPanel === "cloud" || rightPanel === "supabase") {
    return (
      <LifemarkCloudPanel
        project={currentProject}
        files={files}
        onUpdateEnvFile={handleEnvUpdateFile}
      />
    );
  }
  if (rightPanel === "payments") return <PaymentsPanel profile={profile} />;
  if (rightPanel === "security") {
    return <SecurityPanel project={currentProject} files={files} onFilesUpdate={handleFilesUpdate} />;
  }
  if (rightPanel === "seo") return <SeoPanel projectId={pid} onSendToChat={sendPromptToChat} />;
  return null;
}

export function SecondaryPanelContent(ctx: LazyPanelContext) {
  const {
    rightPanel, currentProject, profile, files, pid,
    yjsCollaborators,
    setRightPanel, setPendingCrossRefPrompt,
    handleProjectUpdate, handleFilesUpdate,
    sendPromptToChat,
  } = ctx;

  if (rightPanel === "github") {
    return (
      <GitHubPanel
        project={currentProject}
        githubUsername={profile?.github_username ?? null}
        githubToken={profile?.github_access_token ?? null}
        githubApiBase={(profile as { github_api_base?: string | null } | null)?.github_api_base ?? null}
        gitlabUsername={profile?.gitlab_username ?? null}
        gitlabToken={profile?.gitlab_access_token ?? null}
        onProjectUpdated={handleProjectUpdate}
        files={files}
        onFilesPulled={(pulled) => {
          const byPath = new Map(files.map((f) => [f.path, f]));
          for (const p of pulled) {
            const existing = byPath.get(p.path);
            byPath.set(
              p.path,
              existing
                ? { ...existing, content: p.content }
                : ({
                    id: `pulled-${p.path}`,
                    project_id: currentProject.id,
                    path: p.path,
                    content: p.content,
                    language: p.language,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  } as ProjectFile),
            );
          }
          handleFilesUpdate(Array.from(byPath.values()), { replace: true });
        }}
      />
    );
  }
  if (rightPanel === "connectors") return <ConnectorWizardPanel onApplyConnector={sendPromptToChat} />;
  if (rightPanel === "settings") return <ProjectSettingsPanel project={currentProject} profile={profile} onProjectUpdate={handleProjectUpdate} />;
  if (rightPanel === "domains") return <DomainsPanel project={currentProject} />;
  if (rightPanel === "figma") return <FigmaPanel projectId={pid} onGenerateFromFigma={sendPromptToChat} />;
  if (rightPanel === "collab") return <CollaborationPanel project={currentProject} currentUserId={profile?.id ?? ""} yjsCollaborators={yjsCollaborators} />;
  if (rightPanel === "publishpanel") return <PublishPanel project={currentProject} files={files} />;
  if (rightPanel === "diffviewer") return <DiffViewerPanel projectId={currentProject.id} />;
  if (rightPanel === "intelligence") {
    return (
      <EditorIntelligencePanel
        projectId={currentProject.id}
        onSendPromptToChat={(p) => {
          setPendingCrossRefPrompt(p);
          setRightPanel(null);
        }}
      />
    );
  }
  if (rightPanel === "comments") {
    return (
      <CommentsPanel
        projectId={pid}
        currentUserId={profile?.id ?? ""}
        isPublic={currentProject.is_public}
      />
    );
  }
  return null;
}
