"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronDown, FolderOpen, Folder,
  FilePlus, FolderPlus, Trash2, Pencil, Check, X, Search,
  BookOpen, Loader2, Upload, ChevronsUpDown,
} from "lucide-react";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useToast } from "@/hooks/use-toast";
import { detectLanguage } from "@/lib/ai/code-parser";
import type { ProjectFile } from "@/types/database";
import { FileOutlinePanel } from "./file-outline-panel";

interface FileTreePanelProps {
  files: ProjectFile[];
  activeFile: ProjectFile | null;
  onFileSelect: (file: ProjectFile) => void;
  projectId: string;
  onFilesChange: (files: ProjectFile[]) => void;
}

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children?: TreeNode[];
  file?: ProjectFile;
}

// ── Tree builder ──────────────────────────────────────────────────────────────

function buildTree(files: ProjectFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  const nodeMap = new Map<string, TreeNode>();

  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sortedFiles) {
    const parts = file.path.replace(/^\//, "").split("/");
    let siblings = root;

    for (let i = 0; i < parts.length; i++) {
      const path = parts.slice(0, i + 1).join("/");
      const isFolder = i < parts.length - 1;

      if (!nodeMap.has(path)) {
        const node: TreeNode = {
          name: parts[i],
          path,
          isFolder,
          children: isFolder ? [] : undefined,
          file: isFolder ? undefined : file,
        };
        nodeMap.set(path, node);
        siblings.push(node);
      }

      if (isFolder) {
        siblings = nodeMap.get(path)!.children!;
      }
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => n.children && sortNodes(n.children));
    return nodes;
  };

  return sortNodes(root);
}

// ── File icons ────────────────────────────────────────────────────────────────

const FILE_COLORS: Record<string, string> = {
  tsx: "text-[#61dafb]", ts: "text-[#3b82f6]",
  jsx: "text-[#61dafb]", js: "text-[#f7df1e]",
  css: "text-[#38bdf8]", html: "text-[#f97316]",
  json: "text-[#a3e635]", md: "text-[#94a3b8]",
  svg: "text-[#fb7185]", sh: "text-[#22d3ee]",
  sql: "text-[#fbbf24]",
};

const FILE_ICONS: Record<string, string> = {
  tsx: "⚛", ts: "TS", jsx: "⚛", js: "JS",
  css: "✦", html: "◇", json: "{}", md: "¶",
  svg: "◈", sh: "$", sql: "⊡",
};

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const color = FILE_COLORS[ext] ?? "text-slate-400";
  const label = FILE_ICONS[ext] ?? "·";
  return (
    <span className={`text-[9px] font-bold w-4 text-center shrink-0 ${color}`}>
      {label}
    </span>
  );
}

// ── Inline name input ─────────────────────────────────────────────────────────

function InlineInput({
  defaultValue = "",
  onConfirm,
  onCancel,
  depth,
}: {
  defaultValue?: string;
  onConfirm: (v: string) => void;
  onCancel: () => void;
  depth: number;
}) {
  const [value, setValue] = useState(defaultValue);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <div className="flex items-center gap-1 py-0.5 pr-1" style={{ paddingLeft: `${8 + depth * 12}px` }}>
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); if (value.trim()) onConfirm(value.trim()); }
          if (e.key === "Escape") onCancel();
        }}
        className="flex-1 min-w-0 bg-[#313244] border border-violet-500/60 rounded px-2 py-0.5 text-xs text-[#cdd6f4] outline-none font-mono"
      />
      <button onClick={() => value.trim() && onConfirm(value.trim())} className="text-emerald-400 hover:text-emerald-300"><Check className="w-3 h-3" /></button>
      <button onClick={onCancel} className="text-[#585b70] hover:text-[#cdd6f4]"><X className="w-3 h-3" /></button>
    </div>
  );
}

// ── Delete confirm mini-dialog ────────────────────────────────────────────────

function DeleteConfirm({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="px-3 py-2 space-y-2">
      <p className="text-xs text-[#cdd6f4]">Delete <span className="font-mono text-red-400">{name}</span>?</p>
      <div className="flex gap-2">
        <button onClick={onConfirm} className="flex-1 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded text-xs text-red-400 transition-colors">Delete</button>
        <button onClick={onCancel} className="flex-1 py-1 bg-[#313244] hover:bg-[#45475a] rounded text-xs text-[#cdd6f4] transition-colors">Cancel</button>
      </div>

    </div>
  );
}

// ── Tree node ─────────────────────────────────────────────────────────────────

interface NodeActions {
  onRename: (node: TreeNode, newName: string) => void;
  onDelete: (node: TreeNode) => void;
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
}

function TreeNodeComponent({
  node, activeFile, onFileSelect, depth = 0, actions,
}: {
  node: TreeNode;
  activeFile: ProjectFile | null;
  onFileSelect: (file: ProjectFile) => void;
  depth?: number;
  actions: NodeActions;
}) {
  const [open, setOpen] = useState(depth < 2);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isActive = node.file?.id === activeFile?.id;
  // Collapse / expand-all events from file tree toolbar
  useEffect(() => {
    if (!node.isFolder) return;
    const collapseHandler = () => setOpen(false);
    const expandHandler = () => setOpen(true);
    window.addEventListener("collapse-all-folders", collapseHandler);
    window.addEventListener("expand-all-folders", expandHandler);
    return () => {
      window.removeEventListener("collapse-all-folders", collapseHandler);
      window.removeEventListener("expand-all-folders", expandHandler);
    };
  }, [node.isFolder]);

  const handleRename = (newName: string) => {
    setRenaming(false);
    actions.onRename(node, newName);
  };

  if (node.isFolder) {
    return (
      <div>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div>
              {renaming ? (
                <InlineInput
                  defaultValue={node.name}
                  onConfirm={handleRename}
                  onCancel={() => setRenaming(false)}
                  depth={depth}
                />
              ) : (
                <button
                  onClick={() => setOpen((v) => !v)}
                  onDoubleClick={(e) => { e.preventDefault(); setRenaming(true); }}
                  className="flex items-center gap-1.5 w-full px-2 py-1 rounded hover:bg-[#313244]/60 text-xs text-[#a6adc8] hover:text-[#cdd6f4] transition-colors group"
                  style={{ paddingLeft: `${8 + depth * 12}px` }}
                >
                  <span className="text-[#585b70] shrink-0">
                    {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </span>
                  {open
                    ? <FolderOpen className="w-3.5 h-3.5 text-yellow-400/70 shrink-0" />
                    : <Folder className="w-3.5 h-3.5 text-yellow-400/50 shrink-0" />}
                  <span className="truncate flex-1 text-left">{node.name}</span>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
                    <span
                      className="p-0.5 rounded hover:bg-[#45475a]"
                      onClick={(e) => { e.stopPropagation(); actions.onNewFile(node.path); }}
                      title="New file"
                    >
                      <FilePlus className="w-3 h-3" />
                    </span>
                    <span
                      className="p-0.5 rounded hover:bg-[#45475a]"
                      onClick={(e) => { e.stopPropagation(); actions.onNewFolder(node.path); }}
                      title="New folder"
                    >
                      <FolderPlus className="w-3 h-3" />
                    </span>
                  </div>
                </button>
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="bg-[#181825] border-[#313244] text-[#cdd6f4] text-xs">
            <ContextMenuItem onClick={() => actions.onNewFile(node.path)} className="gap-2 text-xs cursor-pointer">
              <FilePlus className="w-3.5 h-3.5" /> New file
            </ContextMenuItem>
            <ContextMenuItem onClick={() => actions.onNewFolder(node.path)} className="gap-2 text-xs cursor-pointer">
              <FolderPlus className="w-3.5 h-3.5" /> New folder
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => setRenaming(true)} className="gap-2 text-xs cursor-pointer">
              <Pencil className="w-3.5 h-3.5" /> Rename
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setDeleting(true)} className="gap-2 text-xs text-red-400 cursor-pointer focus:text-red-400 focus:bg-red-500/10">
              <Trash2 className="w-3.5 h-3.5" /> Delete folder
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        {deleting && (
          <DeleteConfirm name={node.name} onConfirm={() => { setDeleting(false); actions.onDelete(node); }} onCancel={() => setDeleting(false)} />
        )}

        <AnimatePresence>
          {open && node.children && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              {node.children.map((child) => (
                <TreeNodeComponent
                  key={child.path}
                  node={child}
                  activeFile={activeFile}
                  onFileSelect={onFileSelect}
                  depth={depth + 1}
                  actions={actions}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // File node
  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div>
            {renaming ? (
              <InlineInput
                defaultValue={node.name}
                onConfirm={handleRename}
                onCancel={() => setRenaming(false)}
                depth={depth}
              />
            ) : (
              <button
                onClick={() => node.file && onFileSelect(node.file)}
                onDoubleClick={(e) => { e.preventDefault(); setRenaming(true); }}
                className={`flex items-center gap-1.5 w-full py-1 rounded text-xs transition-colors group ${
                  isActive
                    ? "bg-[#313244] text-[#cdd6f4]"
                    : "text-[#a6adc8] hover:bg-[#313244]/60 hover:text-[#cdd6f4]"
                }`}
                style={{ paddingLeft: `${8 + depth * 12}px`, paddingRight: "6px" }}
              >
                <FileIcon name={node.name} />
                <span className="truncate flex-1 text-left font-mono text-[11px]">{node.name}</span>
              </button>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="bg-[#181825] border-[#313244] text-[#cdd6f4] text-xs">
          <ContextMenuItem onClick={() => setRenaming(true)} className="gap-2 text-xs cursor-pointer">
            <Pencil className="w-3.5 h-3.5" /> Rename
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => setDeleting(true)} className="gap-2 text-xs text-red-400 cursor-pointer focus:text-red-400 focus:bg-red-500/10">
            <Trash2 className="w-3.5 h-3.5" /> Delete file
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {deleting && (
        <DeleteConfirm name={node.name} onConfirm={() => { setDeleting(false); actions.onDelete(node); }} onCancel={() => setDeleting(false)} />
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

type CreatingState = { type: "file" | "folder"; parentPath: string } | null;

export function FileTreePanel({
  files, activeFile, onFileSelect, projectId, onFilesChange,
}: FileTreePanelProps) {
  const [creating, setCreating] = useState<CreatingState>(null);
  // Listen for new-file event from tab bar toolbar
  useEffect(() => {
    const handler = () => setCreating({ type: "file", parentPath: "" });
    window.addEventListener("new-file-from-tabbar", handler);
    return () => window.removeEventListener("new-file-from-tabbar", handler);
  }, []);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [generatingReadme, setGeneratingReadme] = useState(false);
  const [importingZip, setImportingZip] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // When searching, flatten files and filter by path
  const filteredFiles = searchQuery.trim()
    ? files.filter((f) => f.path.toLowerCase().includes(searchQuery.toLowerCase()))
    : null;

  const tree = buildTree(files);

  const apiBase = `/api/projects/${projectId}/files`;

  const createFile = useCallback(async (parentPath: string, name: string, isFolder: boolean) => {
    if (isFolder) {
      // Folders are virtual — create a placeholder .gitkeep inside
      const path = parentPath ? `${parentPath}/${name}/.gitkeep` : `${name}/.gitkeep`;
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: "", language: "plaintext" }),
      });
      if (!res.ok) { toast({ title: "Failed to create folder", variant: "destructive" }); return; }
      const newFile = await res.json();
      onFilesChange([...files, newFile]);
    } else {
      const path = parentPath ? `${parentPath}/${name}` : name;
      const language = detectLanguage(path);
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: "", language }),
      });
      if (!res.ok) { toast({ title: "Failed to create file", variant: "destructive" }); return; }
      const newFile = await res.json();
      const updated = [...files, newFile];
      onFilesChange(updated);
      onFileSelect(newFile);
    }
  }, [files, apiBase, onFilesChange, onFileSelect, toast]);

  const renameNode = useCallback(async (node: TreeNode, newName: string) => {
    if (newName === node.name) return;

    if (node.isFolder) {
      // Rename all files that start with this folder path
      const prefix = node.path + "/";
      const toRename = files.filter((f) => f.path.startsWith(prefix));
      const updated = await Promise.all(
        toRename.map(async (f) => {
          const parentDir = node.path.split("/").slice(0, -1).join("/");
          const newPath = (parentDir ? `${parentDir}/${newName}` : newName) + f.path.slice(node.path.length);
          const res = await fetch(apiBase, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileId: f.id, path: newPath }),
          });
          return res.ok ? (await res.json()) as ProjectFile : f;
        })
      );
      onFilesChange(files.map((f) => updated.find((u) => u.id === f.id) ?? f));
    } else if (node.file) {
      const dir = node.path.includes("/") ? node.path.split("/").slice(0, -1).join("/") : "";
      const newPath = dir ? `${dir}/${newName}` : newName;
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: node.file.id, path: newPath }),
      });
      if (!res.ok) { toast({ title: "Failed to rename", variant: "destructive" }); return; }
      const updated = await res.json() as ProjectFile;
      onFilesChange(files.map((f) => f.id === updated.id ? updated : f));
    }
  }, [files, apiBase, onFilesChange, toast]);

  const deleteNode = useCallback(async (node: TreeNode) => {
    if (node.isFolder) {
      // Delete all files inside the folder
      const prefix = node.path + "/";
      const toDelete = files.filter((f) => f.path.startsWith(prefix) || f.path === node.path);
      await Promise.all(
        toDelete.map((f) =>
          fetch(apiBase, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileId: f.id }),
          })
        )
      );
      const deletedIds = new Set(toDelete.map((f) => f.id));
      onFilesChange(files.filter((f) => !deletedIds.has(f.id)));
      toast({ title: `Deleted folder "${node.name}"` });
    } else if (node.file) {
      const res = await fetch(apiBase, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: node.file.id }),
      });
      if (!res.ok) { toast({ title: "Failed to delete", variant: "destructive" }); return; }
      onFilesChange(files.filter((f) => f.id !== node.file!.id));
      if (activeFile?.id === node.file.id) {
        const remaining = files.filter((f) => f.id !== node.file!.id);
        if (remaining.length > 0) onFileSelect(remaining[0]);
      }
      toast({ title: `Deleted "${node.name}"` });
    }
  }, [files, activeFile, apiBase, onFilesChange, onFileSelect, toast]);

  const nodeActions: NodeActions = {
    onRename: renameNode,
    onDelete: deleteNode,
    onNewFile: (parentPath) => setCreating({ type: "file", parentPath }),
    onNewFolder: (parentPath) => setCreating({ type: "folder", parentPath }),
  };

  const generateReadme = useCallback(async () => {
    setGeneratingReadme(true);
    try {
      const res = await fetch(`${apiBase}/readme`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error ?? "README generation failed", variant: "destructive" });
        return;
      }
      const { content, path } = await res.json();
      // Add README.md to file list or update existing
      const existing = files.find((f) => f.path === path);
      if (existing) {
        onFilesChange(files.map((f) => f.path === path ? { ...f, content } : f));
        onFileSelect({ ...existing, content });
      } else {
        const newFile = {
          id: `readme-${Date.now()}`,
          project_id: projectId,
          path,
          content,
          language: "markdown",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as ProjectFile;
        onFilesChange([...files, newFile]);
        onFileSelect(newFile);
      }
      toast({ title: "README.md generated ✓" });
    } catch {
      toast({ title: "README generation failed", variant: "destructive" });
    } finally {
      setGeneratingReadme(false);
    }
  }, [apiBase, files, projectId, onFilesChange, onFileSelect, toast]);

  const importZip = useCallback(async (file: File) => {
    setImportingZip(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/import-zip`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: json.error ?? "ZIP import failed", variant: "destructive" });
        return;
      }
      // Reload project files from server
      const filesRes = await fetch(`${apiBase}?projectId=${projectId}`);
      if (filesRes.ok) {
        const updated = await filesRes.json();
        if (Array.isArray(updated)) onFilesChange(updated);
      }
      toast({ title: `Imported ${json.imported} file${json.imported !== 1 ? "s" : ""} ✓` });
    } catch {
      toast({ title: "ZIP import failed", variant: "destructive" });
    } finally {
      setImportingZip(false);
      if (zipInputRef.current) zipInputRef.current.value = "";
    }
  }, [projectId, apiBase, onFilesChange, toast]);

  return (
    <div className="flex flex-col h-full bg-[#181825] border-r border-[#1e1e2e] select-none">
      {/* Hidden ZIP input */}
      <input
        ref={zipInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importZip(f);
        }}
      />
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e2e] shrink-0">
        <span className="text-[10px] font-semibold text-[#585b70] uppercase tracking-wider">Files</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => zipInputRef.current?.click()}
            disabled={importingZip}
            title="Import ZIP"
            className="p-1 rounded hover:bg-[#313244] text-[#585b70] hover:text-amber-400 disabled:opacity-40 transition-colors"
          >
            {importingZip
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Upload className="w-3.5 h-3.5" />
            }
          </button>
          <button
            onClick={generateReadme}
            disabled={generatingReadme}
            title="Generate README with AI"
            className="p-1 rounded hover:bg-[#313244] text-[#585b70] hover:text-violet-400 disabled:opacity-40 transition-colors"
          >
            {generatingReadme
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <BookOpen className="w-3.5 h-3.5" />
            }
          </button>
          <button
            onClick={() => window.dispatchEvent(new Event("collapse-all-folders"))}
            className="p-1 rounded text-[#585b70] hover:text-[#cdd6f4] hover:bg-[#313244] transition-colors"
            title="Collapse all folders"
          >
            <ChevronsUpDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => window.dispatchEvent(new Event("expand-all-folders"))}
            className="p-1 rounded text-[#585b70] hover:text-[#cdd6f4] hover:bg-[#313244] transition-colors"
            title="Expand all folders"
          >
            <ChevronsUpDown className="w-3.5 h-3.5 rotate-90" />
          </button>
          <button
            onClick={() => setCreating({ type: "file", parentPath: "" })}
            title="New file"
            className="p-1 rounded hover:bg-[#313244] text-[#585b70] hover:text-[#cdd6f4] transition-colors"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setCreating({ type: "folder", parentPath: "" })}
            title="New folder"
            className="p-1 rounded hover:bg-[#313244] text-[#585b70] hover:text-[#cdd6f4] transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search input */}
      <div className="px-2 py-1.5 border-b border-[#1e1e2e] shrink-0">
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${
          searchFocused ? "bg-[#313244] ring-1 ring-violet-500/40" : "bg-[#1e1e2e]"
        }`}>
          <Search className="w-3 h-3 text-[#585b70] shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search code..."
            className="flex-1 bg-transparent text-[11px] text-[#cdd6f4] placeholder-[#45475a] outline-none font-mono"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-[#585b70] hover:text-[#cdd6f4]">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* Inline new file/folder at root */}
        {creating && creating.parentPath === "" && (
          <InlineInput
            defaultValue={creating.type === "folder" ? "new-folder" : "NewFile.tsx"}
            onConfirm={(name) => {
              createFile("", name, creating.type === "folder");
              setCreating(null);
            }}
            onCancel={() => setCreating(null)}
            depth={0}
          />
        )}

        {/* Search results view */}
        {filteredFiles !== null ? (
          filteredFiles.length === 0 ? (
            <div className="text-center py-8 text-xs text-[#585b70]">
              No files match <span className="font-mono text-[#cdd6f4]">&quot;{searchQuery}&quot;</span>
            </div>
          ) : (
            filteredFiles.map((file) => {
              const parts = file.path.split("/");
              const filename = parts.pop() ?? file.path;
              const dir = parts.join("/");
              const isActive = activeFile?.id === file.id;
              return (
                <button
                  key={file.id}
                  onClick={() => onFileSelect(file)}
                  className={`w-full flex flex-col px-3 py-1.5 text-left hover:bg-[#313244]/60 transition-colors ${
                    isActive ? "bg-[#313244]" : ""
                  }`}
                >
                  <span className="font-mono text-[11px] text-[#cdd6f4] truncate">{filename}</span>
                  {dir && <span className="text-[10px] text-[#585b70] truncate">{dir}</span>}
                </button>
              );
            })
          )
        ) : (
          tree.map((node) => (
            <TreeNodeComponent
              key={node.path}
              node={node}
              activeFile={activeFile}
              onFileSelect={onFileSelect}
              depth={0}
              actions={nodeActions}
            />
          ))
        )}

        {/* Outline panel below the file tree */}
        {activeFile && !searchQuery && (
          <FileOutlinePanel file={activeFile} />
        )}
      </div>
    </div>
  );
}
