"use client";

import type { Dispatch, SetStateAction } from "react";
import type { LeftPanel, EditorMode } from "./editor-layout";
import type { Project, ProjectFile, Profile } from "@/types/database";
import type { Collaborator } from "@/hooks/use-yjs-editor";
import { AgentPanel } from "./agent-panel";
import { GitHubPanel } from "./github-panel";
import { PackagesPanel } from "./packages-panel";
import { CollaborationPanel } from "./collaboration-panel";
import { ImageGenPanel } from "./image-gen-panel";
import { SupabaseWizard } from "./supabase-wizard";
import { EnvPanel } from "./env-panel";
import { PlanPanel } from "./plan-panel";
import { FigmaPanel } from "./figma-panel";
import { DomainsPanel } from "./domains-panel";
import { KnowledgePanel } from "./knowledge-panel";
import { ProjectSettingsPanel } from "./project-settings-panel";
import { SecurityPanel } from "./security-panel";
import { DeployHistoryPanel } from "./deploy-history-panel";
import { ProjectAnalyticsPanel } from "./project-analytics-panel";
import { ProjectSiteAnalyticsPanel } from "./project-site-analytics-panel";
import { AppAuthPanel } from "./app-auth-panel";
import { DesignSystemsPanel } from "./design-systems-panel";
import { SearchPanel } from "./search-panel";
import { ComponentsPanel } from "./components-panel";
import { DesignSystemPanel } from "./design-system-panel";
import { CommentsPanel } from "./comments-panel";
import { CrossReferencePanel } from "./cross-reference-panel";
import { EmailPanel } from "./email-panel";
import { TestingPanel } from "./testing-panel";
import { DesignGuidancePanel } from "./design-guidance-panel";
import { BrowserTestingPanel } from "./browser-testing-panel";
import { CodeReviewPanel } from "./code-review-panel";
import { McpPanel } from "./mcp-panel";
import { SeoPanel } from "./seo-panel";
import { ProblemsPanel } from "./problems-panel";
import { ConnectorWizardPanel } from "./connector-wizard-panel";
import { AccessibilityPanel } from "./accessibility-panel";
import { SchemaPanel } from "./schema-panel";
import { WebhookPanel } from "./webhook-panel";
import { PerformancePanel } from "./performance-panel";
import { I18nPanel } from "./i18n-panel";
import { ApiDocsPanel } from "./api-docs-panel";
import { LifemarkCloudPanel } from "./lifemark-cloud-panel";
import { StoragePanel } from "./storage-panel";
import { AppConnectorsPanel } from "./app-connectors-panel";
import { McpContextPanel } from "./mcp-context-panel";
import { AeoPanel } from "./aeo-panel";
import { VulnerabilityPanel } from "./vulnerability-panel";
import { DbSeedingPanel } from "./db-seeding-panel";
import { MonetizationPanel } from "./monetization-panel";
import { CopyGenPanel } from "./copy-gen-panel";
import { FeedbackWidgetPanel } from "./feedback-widget-panel";
import { GoLiveChecklistPanel } from "./golive-checklist-panel";
import { NativeDistributionPanel } from "./native-distribution-panel";
import { IconGenPanel } from "./icon-gen-panel";
import { ComponentMarketplacePanel } from "./component-marketplace-panel";
import { PwaPanel } from "./pwa-panel";
import { EdgeFunctionsPanel } from "./edge-functions-panel";
import { ApiPlaygroundPanel } from "./api-playground-panel";
import { BundleAnalyzerPanel } from "./bundle-analyzer-panel";
import { FormBuilderPanel } from "./form-builder-panel";
import { FeatureFlagsPanel } from "./feature-flags-panel";
import { ChangelogPanel } from "./changelog-panel";
import { DbQueryPanel } from "./db-query-panel";
import { RouterWizardPanel } from "./router-wizard-panel";
import { EnvHealthPanel } from "./env-health-panel";
import { PromptOptimizerPanel } from "./prompt-optimizer-panel";
import { SecretsVaultPanel } from "./secrets-vault-panel";
import { MigrationsWizardPanel } from "./migrations-wizard-panel";
import { ModelComparePanel } from "./model-compare-panel";
import { AiPersonaPanel } from "./ai-persona-panel";
import { ActivityTimelinePanel } from "./activity-timeline-panel";
import { CodeOwnershipPanel } from "./code-ownership-panel";
import { ConfigExportPanel } from "./config-export-panel";
import { SaveAsTemplatePanel } from "./save-as-template-panel";
import { DiffViewerPanel } from "./diff-viewer-panel";
import { DependencyGraphPanel } from "./dependency-graph-panel";
import { TimeLapsePanel } from "./time-lapse-panel";
import { CustomEmailsPanel } from "./custom-emails-panel";
import { DesignDirectionsPanel } from "./design-directions-panel";
import { AiIntegrationPanel } from "./ai-integration-panel";
import { DesignPanel } from "./design-panel";
import { VisualEditsPanel } from "./visual-edits-panel";
import { PublishPanel } from "./publish-panel";
import { PaymentsPanel } from "./payments-panel";
import { PaymentCheckoutPanel } from "./payment-checkout-panel";
import { EditorIntelligencePanel } from "./editor-intelligence-panel";

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
  handleFilesUpdate: (files: ProjectFile[]) => void;
  handleFileUpdate: (file: ProjectFile) => void;
  handleEnvUpdateFile: (path: string, content: string) => void;
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
        deployedUrl={project.deployed_url}
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
  if (rightPanel === "comments") return <CommentsPanel projectId={pid} currentUserId={profile?.id ?? ""} />;
  if (rightPanel === "mcpcontext") return <McpContextPanel projectId={pid} />;
  if (rightPanel === "aeo") return <AeoPanel files={files} onGenerateSchema={sendPromptToChat} />;
  if (rightPanel === "appconnectors") return <AppConnectorsPanel projectId={pid} />;
  if (rightPanel === "components") return <ComponentsPanel onInsertPrompt={sendPromptToChat} />;
  if (rightPanel === "designpanel") return <DesignSystemPanel projectId={pid} files={files} onFilesUpdate={handleFilesUpdate} />;
  return null;
}
