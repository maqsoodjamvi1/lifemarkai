
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

const PackagesPanel = dynamic(importWithRetry(() => import("./packages-panel").then((m) => m.PackagesPanel)), { ssr: false, loading: panelLoading });
const CollaborationPanel = dynamic(importWithRetry(() => import("./collaboration-panel").then((m) => m.CollaborationPanel)), { ssr: false, loading: panelLoading });
const ImageGenPanel = dynamic(importWithRetry(() => import("./image-gen-panel").then((m) => m.ImageGenPanel)), { ssr: false, loading: panelLoading });
const SupabaseWizard = dynamic(importWithRetry(() => import("./supabase-wizard").then((m) => m.SupabaseWizard)), { ssr: false, loading: panelLoading });
const EnvPanel = dynamic(importWithRetry(() => import("./env-panel").then((m) => m.EnvPanel)), { ssr: false, loading: panelLoading });
const FigmaPanel = dynamic(importWithRetry(() => import("./figma-panel").then((m) => m.FigmaPanel)), { ssr: false, loading: panelLoading });
const KnowledgePanel = dynamic(importWithRetry(() => import("./knowledge-panel").then((m) => m.KnowledgePanel)), { ssr: false, loading: panelLoading });
const SecurityPanel = dynamic(importWithRetry(() => import("./security-panel").then((m) => m.SecurityPanel)), { ssr: false, loading: panelLoading });
const DeployHistoryPanel = dynamic(importWithRetry(() => import("./deploy-history-panel").then((m) => m.DeployHistoryPanel)), { ssr: false, loading: panelLoading });
const DesignSystemsPanel = dynamic(importWithRetry(() => import("./design-systems-panel").then((m) => m.DesignSystemsPanel)), { ssr: false, loading: panelLoading });
const SearchPanel = dynamic(importWithRetry(() => import("./search-panel").then((m) => m.SearchPanel)), { ssr: false, loading: panelLoading });
const ComponentsPanel = dynamic(importWithRetry(() => import("./components-panel").then((m) => m.ComponentsPanel)), { ssr: false, loading: panelLoading });
const CrossReferencePanel = dynamic(importWithRetry(() => import("./cross-reference-panel").then((m) => m.CrossReferencePanel)), { ssr: false, loading: panelLoading });
const EmailPanel = dynamic(importWithRetry(() => import("./email-panel").then((m) => m.EmailPanel)), { ssr: false, loading: panelLoading });
const DesignGuidancePanel = dynamic(importWithRetry(() => import("./design-guidance-panel").then((m) => m.DesignGuidancePanel)), { ssr: false, loading: panelLoading });
const CodeReviewPanel = dynamic(importWithRetry(() => import("./code-review-panel").then((m) => m.CodeReviewPanel)), { ssr: false, loading: panelLoading });
const ProblemsPanel = dynamic(importWithRetry(() => import("./problems-panel").then((m) => m.ProblemsPanel)), { ssr: false, loading: panelLoading });
const AppErrorsPanel = dynamic(importWithRetry(() => import("./app-errors-panel").then((m) => m.AppErrorsPanel)), { ssr: false, loading: panelLoading });
const AccessibilityPanel = dynamic(importWithRetry(() => import("./accessibility-panel").then((m) => m.AccessibilityPanel)), { ssr: false, loading: panelLoading });
const SchemaPanel = dynamic(importWithRetry(() => import("./schema-panel").then((m) => m.SchemaPanel)), { ssr: false, loading: panelLoading });
const I18nPanel = dynamic(importWithRetry(() => import("./i18n-panel").then((m) => m.I18nPanel)), { ssr: false, loading: panelLoading });
const McpContextPanel = dynamic(importWithRetry(() => import("./mcp-context-panel").then((m) => m.McpContextPanel)), { ssr: false, loading: panelLoading });
const DbSeedingPanel = dynamic(importWithRetry(() => import("./db-seeding-panel").then((m) => m.DbSeedingPanel)), { ssr: false, loading: panelLoading });
const CopyGenPanel = dynamic(importWithRetry(() => import("./copy-gen-panel").then((m) => m.CopyGenPanel)), { ssr: false, loading: panelLoading });
const FeedbackWidgetPanel = dynamic(importWithRetry(() => import("./feedback-widget-panel").then((m) => m.FeedbackWidgetPanel)), { ssr: false, loading: panelLoading });
const GoLiveChecklistPanel = dynamic(importWithRetry(() => import("./golive-checklist-panel").then((m) => m.GoLiveChecklistPanel)), { ssr: false, loading: panelLoading });
const NativeDistributionPanel = dynamic(importWithRetry(() => import("./native-distribution-panel").then((m) => m.NativeDistributionPanel)), { ssr: false, loading: panelLoading });
const IconGenPanel = dynamic(importWithRetry(() => import("./icon-gen-panel").then((m) => m.IconGenPanel)), { ssr: false, loading: panelLoading });
const PwaPanel = dynamic(importWithRetry(() => import("./pwa-panel").then((m) => m.PwaPanel)), { ssr: false, loading: panelLoading });
const EdgeFunctionsPanel = dynamic(importWithRetry(() => import("./edge-functions-panel").then((m) => m.EdgeFunctionsPanel)), { ssr: false, loading: panelLoading });
const ApiPlaygroundPanel = dynamic(importWithRetry(() => import("./api-playground-panel").then((m) => m.ApiPlaygroundPanel)), { ssr: false, loading: panelLoading });
const BundleAnalyzerPanel = dynamic(importWithRetry(() => import("./bundle-analyzer-panel").then((m) => m.BundleAnalyzerPanel)), { ssr: false, loading: panelLoading });
const FormBuilderPanel = dynamic(importWithRetry(() => import("./form-builder-panel").then((m) => m.FormBuilderPanel)), { ssr: false, loading: panelLoading });
const FeatureFlagsPanel = dynamic(importWithRetry(() => import("./feature-flags-panel").then((m) => m.FeatureFlagsPanel)), { ssr: false, loading: panelLoading });
const ChangelogPanel = dynamic(importWithRetry(() => import("./changelog-panel").then((m) => m.ChangelogPanel)), { ssr: false, loading: panelLoading });
const DbQueryPanel = dynamic(importWithRetry(() => import("./db-query-panel").then((m) => m.DbQueryPanel)), { ssr: false, loading: panelLoading });
const RouterWizardPanel = dynamic(importWithRetry(() => import("./router-wizard-panel").then((m) => m.RouterWizardPanel)), { ssr: false, loading: panelLoading });
const EnvHealthPanel = dynamic(importWithRetry(() => import("./env-health-panel").then((m) => m.EnvHealthPanel)), { ssr: false, loading: panelLoading });
const PromptOptimizerPanel = dynamic(importWithRetry(() => import("./prompt-optimizer-panel").then((m) => m.PromptOptimizerPanel)), { ssr: false, loading: panelLoading });
const SecretsVaultPanel = dynamic(importWithRetry(() => import("./secrets-vault-panel").then((m) => m.SecretsVaultPanel)), { ssr: false, loading: panelLoading });
const ModelComparePanel = dynamic(importWithRetry(() => import("./model-compare-panel").then((m) => m.ModelComparePanel)), { ssr: false, loading: panelLoading });
const AiPersonaPanel = dynamic(importWithRetry(() => import("./ai-persona-panel").then((m) => m.AiPersonaPanel)), { ssr: false, loading: panelLoading });
const ActivityTimelinePanel = dynamic(importWithRetry(() => import("./activity-timeline-panel").then((m) => m.ActivityTimelinePanel)), { ssr: false, loading: panelLoading });
const CodeOwnershipPanel = dynamic(importWithRetry(() => import("./code-ownership-panel").then((m) => m.CodeOwnershipPanel)), { ssr: false, loading: panelLoading });
const ConfigExportPanel = dynamic(importWithRetry(() => import("./config-export-panel").then((m) => m.ConfigExportPanel)), { ssr: false, loading: panelLoading });
const SaveAsTemplatePanel = dynamic(importWithRetry(() => import("./save-as-template-panel").then((m) => m.SaveAsTemplatePanel)), { ssr: false, loading: panelLoading });
const DiffViewerPanel = dynamic(importWithRetry(() => import("./diff-viewer-panel").then((m) => m.DiffViewerPanel)), { ssr: false, loading: panelLoading });
const DependencyGraphPanel = dynamic(importWithRetry(() => import("./dependency-graph-panel").then((m) => m.DependencyGraphPanel)), { ssr: false, loading: panelLoading });
const TimeLapsePanel = dynamic(importWithRetry(() => import("./time-lapse-panel").then((m) => m.TimeLapsePanel)), { ssr: false, loading: panelLoading });
const DesignDirectionsPanel = dynamic(importWithRetry(() => import("./design-directions-panel").then((m) => m.DesignDirectionsPanel)), { ssr: false, loading: panelLoading });
const AiIntegrationPanel = dynamic(importWithRetry(() => import("./ai-integration-panel").then((m) => m.AiIntegrationPanel)), { ssr: false, loading: panelLoading });
const PaymentsPanel = dynamic(importWithRetry(() => import("./payments-panel").then((m) => m.PaymentsPanel)), { ssr: false, loading: panelLoading });

const AgentPanel = dynamic(importWithRetry(() => import("./agent-panel").then((m) => m.AgentPanel)), { ssr: false, loading: panelLoading });
const GitHubPanel = dynamic(importWithRetry(() => import("./github-panel").then((m) => m.GitHubPanel)), { ssr: false, loading: panelLoading });
const PlanPanel = dynamic(importWithRetry(() => import("./plan-panel").then((m) => m.PlanPanel)), { ssr: false, loading: panelLoading });
const DomainsPanel = dynamic(importWithRetry(() => import("./domains-panel").then((m) => m.DomainsPanel)), { ssr: false, loading: panelLoading });
const ProjectSettingsPanel = dynamic(importWithRetry(() => import("./project-settings-panel").then((m) => m.ProjectSettingsPanel)), { ssr: false, loading: panelLoading });
const AppAuthPanel = dynamic(importWithRetry(() => import("./app-auth-panel").then((m) => m.AppAuthPanel)), { ssr: false, loading: panelLoading });
const DesignSystemPanel = dynamic(importWithRetry(() => import("./design-system-panel").then((m) => m.DesignSystemPanel)), { ssr: false, loading: panelLoading });
const TestingPanel = dynamic(importWithRetry(() => import("./testing-panel").then((m) => m.TestingPanel)), { ssr: false, loading: panelLoading });
const PerformancePanel = dynamic(importWithRetry(() => import("./performance-panel").then((m) => m.PerformancePanel)), { ssr: false, loading: panelLoading });
const ApiDocsPanel = dynamic(importWithRetry(() => import("./api-docs-panel").then((m) => m.ApiDocsPanel)), { ssr: false, loading: panelLoading });
const StoragePanel = dynamic(importWithRetry(() => import("./storage-panel").then((m) => m.StoragePanel)), { ssr: false, loading: panelLoading });
const AeoPanel = dynamic(importWithRetry(() => import("./aeo-panel").then((m) => m.AeoPanel)), { ssr: false, loading: panelLoading });
const ComponentMarketplacePanel = dynamic(importWithRetry(() => import("./component-marketplace-panel").then((m) => m.ComponentMarketplacePanel)), { ssr: false, loading: panelLoading });
const MigrationsWizardPanel = dynamic(importWithRetry(() => import("./migrations-wizard-panel").then((m) => m.MigrationsWizardPanel)), { ssr: false, loading: panelLoading });
const CustomEmailsPanel = dynamic(importWithRetry(() => import("./custom-emails-panel").then((m) => m.CustomEmailsPanel)), { ssr: false, loading: panelLoading });
const DesignPanel = dynamic(importWithRetry(() => import("./design-panel").then((m) => m.DesignPanel)), { ssr: false, loading: panelLoading });
const VisualEditsPanel = dynamic(importWithRetry(() => import("./visual-edits-panel").then((m) => m.VisualEditsPanel)), { ssr: false, loading: panelLoading });
const PublishPanel = dynamic(importWithRetry(() => import("./publish-panel").then((m) => m.PublishPanel)), { ssr: false, loading: panelLoading });
const EditorIntelligencePanel = dynamic(importWithRetry(() => import("./editor-intelligence-panel").then((m) => m.EditorIntelligencePanel)), { ssr: false, loading: panelLoading });
const SelfHealingPanel = dynamic(importWithRetry(() => import("./self-healing-panel").then((m) => m.SelfHealingPanel)), { ssr: false, loading: panelLoading });
const CommentsPanel = dynamic(importWithRetry(() => import("./comments-panel").then((m) => m.CommentsPanel)), { ssr: false, loading: panelLoading });
const WebhookPanel = dynamic(importWithRetry(() => import("./webhook-panel").then((m) => m.WebhookPanel)), { ssr: false, loading: panelLoading });
const PaymentCheckoutPanel = dynamic(importWithRetry(() => import("./payment-checkout-panel").then((m) => m.PaymentCheckoutPanel)), { ssr: false, loading: panelLoading });

const ProjectAnalyticsPanel = dynamic(
  importWithRetry(() => import("./project-analytics-panel").then((m) => m.ProjectAnalyticsPanel)),
  { ssr: false, loading: panelLoading }
);
const ProjectSiteAnalyticsPanel = dynamic(
  importWithRetry(() => import("./project-site-analytics-panel").then((m) => m.ProjectSiteAnalyticsPanel)),
  { ssr: false, loading: panelLoading }
);
const MonetizationPanel = dynamic(
  importWithRetry(() => import("./monetization-panel").then((m) => m.MonetizationPanel)),
  { ssr: false, loading: panelLoading }
);
const ConnectorWizardPanel = dynamic(
  importWithRetry(() => import("./connector-wizard-panel").then((m) => m.ConnectorWizardPanel)),
  { ssr: false, loading: panelLoading }
);
const McpPanel = dynamic(
  importWithRetry(() => import("./mcp-panel").then((m) => m.McpPanel)),
  { ssr: false, loading: panelLoading }
);
const AppConnectorsPanel = dynamic(
  importWithRetry(() => import("./app-connectors-panel").then((m) => m.AppConnectorsPanel)),
  { ssr: false, loading: panelLoading }
);
const MediaGalleryPanel = dynamic(
  importWithRetry(() => import("./media-gallery-panel").then((m) => m.MediaGalleryPanel)),
  { ssr: false, loading: panelLoading }
);
const SeoPanel = dynamic(
  importWithRetry(() => import("./seo-panel").then((m) => m.SeoPanel)),
  { ssr: false, loading: panelLoading }
);
const BrowserTestingPanel = dynamic(
  importWithRetry(() => import("./browser-testing-panel").then((m) => m.BrowserTestingPanel)),
  { ssr: false, loading: panelLoading }
);
const VulnerabilityPanel = dynamic(
  importWithRetry(() => import("./vulnerability-panel").then((m) => m.VulnerabilityPanel)),
  { ssr: false, loading: panelLoading }
);
const LifemarkCloudPanel = dynamic(
  importWithRetry(() => import("./lifemark-cloud-panel").then((m) => m.LifemarkCloudPanel)),
  { ssr: false, loading: panelLoading }
);
const DatabaseManagerPanel = dynamic(
  importWithRetry(() => import("./database-manager-panel").then((m) => m.DatabaseManagerPanel)),
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
  setRightPanel,
  handleFilesUpdate,
  sendPromptToChat,
}: Pick<
  LazyPanelContext,
  | "rightPanel"
  | "currentProject"
  | "profile"
  | "files"
  | "pid"
  | "setRightPanel"
  | "handleFilesUpdate"
  | "sendPromptToChat"
>) {
  if (rightPanel === "analytics") return <ProjectSiteAnalyticsPanel project={currentProject} />;
  if (rightPanel === "cloud") {
    return (
      <LifemarkCloudPanel
        project={currentProject}
        onOpenSubPanel={(p) => setRightPanel(p as LeftPanel)}
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
    rightPanel, project, currentProject, profile, files, activeFile, pid, projectSlug,
    credits, isLiveLocked, yjsCollaborators,
    setRightPanel, setViewMode, setActiveFile, setFiles, setEditorMode, setPendingCrossRefPrompt,
    handleProjectUpdate, handleFilesUpdate, handleFileUpdate, handleEnvUpdateFile,
    handleCreditsUpdate, sendPromptToChat,
  } = ctx;

  if (rightPanel === "github") {
    return (
      <GitHubPanel
        project={currentProject}
        githubUsername={profile?.github_username ?? null}
        githubToken={profile?.github_access_token ?? null}
        gitlabUsername={profile?.gitlab_username ?? null}
        gitlabToken={profile?.gitlab_access_token ?? null}
        onProjectUpdated={handleProjectUpdate}
        files={files}
        onFilesPulled={(pulled) => {
          // Merge by path into the editor's live file list. Without this the
          // editor kept the pre-pull content and the next autosave reverted
          // the pull.
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
  if (rightPanel === "knowledge") return <KnowledgePanel project={currentProject} profile={profile} onProjectUpdate={handleProjectUpdate} />;
  if (rightPanel === "activity") return <ProjectAnalyticsPanel project={currentProject} />;
  if (rightPanel === "deploys") {
    return (
      <DeployHistoryPanel
        project={currentProject}
        onFilesRefresh={async () => {
          const res = await fetch(`/api/projects/${project.id}/files`);
          if (res.ok) setFiles(await res.json());
        }}
      />
    );
  }
  if (rightPanel === "supabase") return <SupabaseWizard projectId={pid} />;
  if (rightPanel === "env") return <EnvPanel projectId={pid} files={files} onUpdateFile={handleEnvUpdateFile} />;
  if (rightPanel === "image") return <ImageGenPanel projectId={pid} />;
  if (rightPanel === "testing") return <TestingPanel projectId={pid} files={files} onFilesUpdate={handleFilesUpdate} onOpenFile={setActiveFile} />;
  if (rightPanel === "mcp") return <McpPanel />;
  if (rightPanel === "connectors") return <ConnectorWizardPanel onApplyConnector={sendPromptToChat} />;
  if (rightPanel === "settings") return <ProjectSettingsPanel project={currentProject} profile={profile} onProjectUpdate={handleProjectUpdate} />;
  if (rightPanel === "search") {
    return (
      <SearchPanel
        files={files}
        projectId={project.id}
        onFileSelect={(f) => { setActiveFile(f); setRightPanel(null); setViewMode("code"); }}
        onFilesUpdate={handleFilesUpdate}
      />
    );
  }
  if (rightPanel === "domains") return <DomainsPanel project={currentProject} />;
  if (rightPanel === "appauth") return <AppAuthPanel project={currentProject} />;
  if (rightPanel === "designsystem") return <DesignSystemsPanel project={currentProject} onProjectUpdate={handleProjectUpdate} />;
  if (rightPanel === "figma") return <FigmaPanel projectId={pid} onGenerateFromFigma={sendPromptToChat} />;
  if (rightPanel === "collab") return <CollaborationPanel project={currentProject} currentUserId={profile?.id ?? ""} yjsCollaborators={yjsCollaborators} />;
  if (rightPanel === "customemail") return <CustomEmailsPanel />;
  if (rightPanel === "storage") return <StoragePanel projectId={pid} />;
  if (rightPanel === "designdir") return <DesignDirectionsPanel onSendToChat={sendPromptToChat} />;
  if (rightPanel === "design") return <DesignPanel projectId={pid} onApply={sendPromptToChat} />;
  if (rightPanel === "visualedits") return <VisualEditsPanel projectId={pid} onApply={sendPromptToChat} />;
  if (rightPanel === "publishpanel") return <PublishPanel project={currentProject} />;
  if (rightPanel === "checkout") return <PaymentCheckoutPanel projectId={pid} />;
  if (rightPanel === "problems") return <ProblemsPanel projectId={pid} />;
  // Distinct from "problems": those are compile-time markers from the editor's own
  // Monaco. These are runtime errors real visitors hit on the PUBLISHED app.
  if (rightPanel === "apperrors") return <AppErrorsPanel projectId={pid} />;
  if (rightPanel === "accessibility") return <AccessibilityPanel files={files} onFixWithAI={sendPromptToChat} />;
  if (rightPanel === "schema") return <SchemaPanel files={files} onGenerateMigration={sendPromptToChat} />;
  if (rightPanel === "webhooks") return <WebhookPanel projectId={pid} />;
  if (rightPanel === "performance") return <PerformancePanel files={files} onFixWithAI={sendPromptToChat} />;
  if (rightPanel === "i18n") return <I18nPanel files={files} onGenerateTranslations={sendPromptToChat} />;
  if (rightPanel === "apidocs") return <ApiDocsPanel files={files} />;
  if (rightPanel === "vulnscan") return <VulnerabilityPanel files={files} onFixWithAI={sendPromptToChat} />;
  if (rightPanel === "dbseed") return <DbSeedingPanel projectId={pid} files={files} />;
  if (rightPanel === "monetize") return <MonetizationPanel projectId={pid} projectSlug={projectSlug} />;
  if (rightPanel === "copygen") return <CopyGenPanel projectId={pid} files={files} onInsertCopy={sendPromptToChat} />;
  if (rightPanel === "feedback") return <FeedbackWidgetPanel projectId={pid} projectSlug={projectSlug} />;
  if (rightPanel === "golive") {
    return (
      <GoLiveChecklistPanel
        projectId={project.id}
        files={files}
        onFixWithAI={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }}
      />
    );
  }
  if (rightPanel === "nativeapps") {
    return (
      <NativeDistributionPanel
        project={project}
        files={files}
        deployedUrl={project.deployed_url}
        onFilesUpdate={handleFilesUpdate}
        onSendToChat={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }}
      />
    );
  }
  if (rightPanel === "icongen") return <IconGenPanel projectId={project.id} files={files} />;
  if (rightPanel === "compmarket") {
    return <ComponentMarketplacePanel projectId={project.id} onInstall={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />;
  }
  if (rightPanel === "pwa") {
    return <PwaPanel projectId={project.id} files={files} onGenerateFiles={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />;
  }
  if (rightPanel === "edgefn") return <EdgeFunctionsPanel projectId={project.id} />;
  if (rightPanel === "apiplay") return <ApiPlaygroundPanel projectId={project.id} files={files} />;
  if (rightPanel === "bundle") {
    return <BundleAnalyzerPanel files={files} onFixWithAI={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />;
  }
  if (rightPanel === "formgen") {
    return <FormBuilderPanel projectId={project.id} onInsertForm={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />;
  }
  if (rightPanel === "flags") {
    return <FeatureFlagsPanel projectId={project.id} onInsertCode={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />;
  }
  if (rightPanel === "changelog") {
    return <ChangelogPanel projectId={project.id} onInsertChangelog={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />;
  }
  if (rightPanel === "dbquery") return <DbQueryPanel projectId={project.id} />;
  if (rightPanel === "dbmanager") return <DatabaseManagerPanel projectId={pid} isLocked={isLiveLocked} />;
  if (rightPanel === "routerwiz") {
    return <RouterWizardPanel projectId={project.id} files={files} onInsertCode={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />;
  }
  if (rightPanel === "envhealth") return <EnvHealthPanel projectId={project.id} />;
  if (rightPanel === "promptopt") {
    return <PromptOptimizerPanel onSendToChat={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />;
  }
  if (rightPanel === "secrets") return <SecretsVaultPanel projectId={project.id} />;
  if (rightPanel === "migrations") {
    return (
      <MigrationsWizardPanel
        projectId={project.id}
        files={files}
        onInsertCode={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }}
        onFilesUpdate={(partial) => {
          const now = new Date().toISOString();
          setFiles(
            partial.map((pf) => ({
              id: `restore-${pf.path}`,
              project_id: project.id,
              path: pf.path,
              content: pf.content,
              language: pf.language ?? "plaintext",
              created_at: now,
              updated_at: now,
            }))
          );
        }}
      />
    );
  }
  if (rightPanel === "modelcmp") {
    return <ModelComparePanel projectId={project.id} onSendToChat={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />;
  }
  if (rightPanel === "persona") return <AiPersonaPanel projectId={project.id} />;
  if (rightPanel === "activityfeed") return <ActivityTimelinePanel projectId={project.id} />;
  if (rightPanel === "ownership") return <CodeOwnershipPanel projectId={project.id} files={files} />;
  if (rightPanel === "configexport") return <ConfigExportPanel projectId={project.id} />;
  if (rightPanel === "savetemplate") return <SaveAsTemplatePanel projectId={project.id} projectName={project.name} />;
  if (rightPanel === "diffviewer") return <DiffViewerPanel projectId={project.id} />;
  if (rightPanel === "depgraph") {
    return (
      <DependencyGraphPanel
        projectId={project.id}
        files={files}
        onFileOpen={(path) => { const f = files.find((x) => x.path === path); if (f) setActiveFile(f); }}
      />
    );
  }
  if (rightPanel === "timelapse") return <TimeLapsePanel projectId={project.id} />;
  if (rightPanel === "aiintegration") return <AiIntegrationPanel project={currentProject} onProjectUpdate={handleProjectUpdate} />;
  if (rightPanel === "intelligence") return <EditorIntelligencePanel projectId={project.id} onSendPromptToChat={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />;
  if (rightPanel === "healing") {
    return (
      <SelfHealingPanel
        projectId={pid}
        files={files}
        isLocked={isLiveLocked}
        onFilesRefresh={async () => {
          const res = await fetch(`/api/projects/${pid}/files`);
          if (res.ok) setFiles(await res.json());
        }}
      />
    );
  }
  if (rightPanel === "plan") {
    return (
      <PlanPanel
        project={currentProject}
        files={files}
        onApprovePlan={(md) => {
          setEditorMode("build");
          setPendingCrossRefPrompt(`Implement this approved plan:\n\n${md}`);
          setRightPanel(null);
        }}
      />
    );
  }
  if (rightPanel === "agent") {
    return (
      <AgentPanel
        projectId={pid}
        files={files}
        onFilesUpdated={handleFilesUpdate}
        onCreditsChange={handleCreditsUpdate}
        credits={credits}
        isLocked={isLiveLocked}
      />
    );
  }
  if (rightPanel === "crossref") return <CrossReferencePanel currentProjectId={pid} onFilesUpdate={handleFilesUpdate} onAdaptWithAI={sendPromptToChat} />;
  if (rightPanel === "review") {
    return (
      <CodeReviewPanel
        activeFile={activeFile}
        onJumpToLine={(line) => {
          setViewMode("code");
          setRightPanel(null);
          requestAnimationFrame(() => {
            window.dispatchEvent(new CustomEvent("monaco-reveal-line", { detail: { line } }));
          });
        }}
        onFixWithAI={(issue) => sendPromptToChat(`Fix ${issue.category} issue: ${issue.title} — ${issue.description}`)}
      />
    );
  }
  if (rightPanel === "guidance") return <DesignGuidancePanel projectId={pid} files={files} onApplyFix={sendPromptToChat} />;
  if (rightPanel === "e2e") return <BrowserTestingPanel project={currentProject} files={files} onFilesUpdate={handleFilesUpdate} onOpenFile={setActiveFile} />;
  if (rightPanel === "packages") return <PackagesPanel projectId={pid} files={files} onFileChange={handleFileUpdate} />;
  if (rightPanel === "email") return <EmailPanel projectId={pid} files={files} onFilesUpdate={handleFilesUpdate} />;
  if (rightPanel === "comments") return <CommentsPanel projectId={pid} currentUserId={profile?.id ?? ""} isPublic={currentProject.is_public} />;
  if (rightPanel === "mcpcontext") return <McpContextPanel projectId={pid} />;
  if (rightPanel === "aeo") return <AeoPanel files={files} onGenerateSchema={sendPromptToChat} />;
  if (rightPanel === "appconnectors") return <AppConnectorsPanel projectId={pid} />;
  if (rightPanel === "media") return <MediaGalleryPanel files={files} onSendToChat={sendPromptToChat} onFilesUpdate={handleFilesUpdate} />;
  if (rightPanel === "components") return <ComponentsPanel onInsertPrompt={sendPromptToChat} />;
  if (rightPanel === "designpanel") return <DesignSystemPanel projectId={pid} files={files} onFilesUpdate={handleFilesUpdate} />;
  return null;
}
