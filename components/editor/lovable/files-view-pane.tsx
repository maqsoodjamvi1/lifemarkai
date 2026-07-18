"use client";

import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { FileTreePanel } from "@/components/editor/file-tree-panel";
import { CodePanel } from "@/components/editor/code-panel";
import type { Collaborator as YjsCollaborator } from "@/hooks/use-yjs-editor";
import type { ProjectFile } from "@/types/database";

interface LovableFilesViewPaneProps {
  files: ProjectFile[];
  activeFile: ProjectFile | null;
  projectId: string;
  onFileSelect: (file: ProjectFile) => void;
  onFilesChange: (files: ProjectFile[]) => void;
  onSave: (content: string) => void | Promise<void>;
  onChange: (content: string) => void;
  collabUser?: { id: string; name: string; avatar?: string };
  onCollaboratorsChange?: (users: YjsCollaborator[]) => void;
}

/**
 * Lovable-parity Files tab — dedicated file tree + editor split (not a sidebar toggle).
 */
export function LovableFilesViewPane({
  files,
  activeFile,
  projectId,
  onFileSelect,
  onFilesChange,
  onSave,
  onChange,
  collabUser,
  onCollaboratorsChange,
}: LovableFilesViewPaneProps) {
  return (
    <div
      data-files-view
      className="flex h-full min-h-0 flex-col bg-[var(--bg-base)] rounded-[var(--radius-4)] shadow-surface-md overflow-hidden m-1"
    >
      <div className="flex items-center gap-2 px-3 h-9 border-b border-[color:var(--border-default)] shrink-0">
        <span className="text-xs font-[500] text-[var(--fg-primary)]">Files</span>
        <span className="text-[10px] text-[var(--fg-tertiary)]">{files.length} files</span>
      </div>
      <PanelGroup direction="horizontal" autoSaveId={`lifemark-files-split-${projectId}`} className="min-h-0 flex-1">
        <Panel defaultSize={32} minSize={18} maxSize={50} id="files-tree">
          <div className="h-full border-r border-[color:var(--border-default)]">
            <FileTreePanel
              files={files}
              activeFile={activeFile}
              projectId={projectId}
              onFileSelect={onFileSelect}
              onFilesChange={onFilesChange}
            />
          </div>
        </Panel>
        <PanelResizeHandle className="w-px bg-border hover:bg-primary/50 transition-colors cursor-col-resize" />
        <Panel defaultSize={68} minSize={30} id="files-code">
          <CodePanel
            file={activeFile}
            files={files}
            projectId={projectId}
            onSave={onSave}
            onChange={onChange}
            onFileChange={onFileSelect}
            collabUser={collabUser}
            onCollaboratorsChange={onCollaboratorsChange}
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}
