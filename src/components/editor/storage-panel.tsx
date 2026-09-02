
/**
 * StoragePanel
 * Browse, upload, and manage Supabase Storage buckets and files directly
 * from the editor sidebar. Features:
 *   - List all buckets (public / private badge)
 *   - Navigate folders recursively
 *   - Upload files via drag-and-drop or file picker
 *   - Copy public URL / signed URL to clipboard
 *   - Delete files
 *   - Create new folders (zero-byte placeholder)
 */

import { useState,useEffect,useRef,useCallback } from "react";
import {
HardDrive,FolderOpen,Folder,File,Upload,Trash2,
Copy,Check,ChevronRight,RefreshCw,Loader2,Plus,
Image,FileText,Music,Video,Archive,Lock,Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";

interface Bucket {
  id: string;
  name: string;
  public: boolean;
  created_at?: string;
  file_size_limit?: number | null;
}

interface StorageFile {
  name: string;
  id: string | null;
  updated_at?: string;
  created_at?: string;
  last_accessed_at?: string;
  metadata?: {
    size?: number;
    mimetype?: string;
    cacheControl?: string;
  };
}

interface StoragePanelProps {
  projectId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg","jpeg","png","gif","webp","svg","ico","avif"].includes(ext)) return <Image className="w-3.5 h-3.5 text-violet-400 shrink-0" />;
  if (["mp4","webm","mov","avi","mkv"].includes(ext)) return <Video className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
  if (["mp3","wav","ogg","flac","aac"].includes(ext)) return <Music className="w-3.5 h-3.5 text-pink-400 shrink-0" />;
  if (["zip","tar","gz","rar","7z"].includes(ext)) return <Archive className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  if (["pdf","doc","docx","txt","md"].includes(ext)) return <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  return <File className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function StoragePanel({ projectId }: StoragePanelProps) {
  const api = `/api/projects/${projectId}/storage`;

  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<Bucket | null>(null);
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loadingBuckets, setLoadingBuckets] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [newBucketName, setNewBucketName] = useState("");
  const [newBucketPublic, setNewBucketPublic] = useState(false);
  const [creatingBucket, setCreatingBucket] = useState(false);
  const [backendNone, setBackendNone] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadBuckets = useCallback(async () => {
    setLoadingBuckets(true);
    try {
      const res = await fetch(`${api}?action=buckets`);
      const data = await res.json().catch(() => ({}));
      if (data.backend === "none") {
        setBackendNone(data.error ?? "Enable Cloud or link a Supabase project to use Storage.");
        setBuckets([]);
        return;
      }
      setBackendNone(null);
      if (!res.ok) throw new Error(data.error ?? "Failed to load buckets");
      setBuckets((data.buckets ?? []) as Bucket[]);
    } catch (e) {
      toast({ title: "Failed to load buckets", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoadingBuckets(false);
    }
  }, [api]);

  useEffect(() => { void loadBuckets(); }, [loadBuckets]);

  // ── Load files in current path ─────────────────────────────────────────────

  const loadFiles = useCallback(async (bucket: Bucket, path: string[]) => {
    setLoadingFiles(true);
    try {
      const prefix = path.length > 0 ? path.join("/") : "";
      const qs = new URLSearchParams({ action: "list", bucket: bucket.name, prefix });
      const res = await fetch(`${api}?${qs}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to list files");
      setFiles((data.files ?? []) as StorageFile[]);
    } catch (e) {
      toast({ title: "Failed to list files", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
      setFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  }, [api]);

  useEffect(() => {
    if (selectedBucket) void loadFiles(selectedBucket, currentPath);
  }, [selectedBucket, currentPath, loadFiles]);

  // ── Upload ─────────────────────────────────────────────────────────────────

  async function uploadFiles(fileList: FileList) {
    if (!selectedBucket) return;
    setUploading(true);
    let successCount = 0;
    for (const file of Array.from(fileList)) {
      const prefix = currentPath.length > 0 ? currentPath.join("/") + "/" : "";
      const filePath = prefix + file.name;
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result ?? "");
          const comma = result.indexOf(",");
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upload",
          bucket: selectedBucket.name,
          path: filePath,
          contentBase64,
          contentType: file.type || "application/octet-stream",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) successCount++;
      else toast({ title: `Failed to upload ${file.name}`, description: data.error, variant: "destructive" });
    }
    if (successCount > 0) {
      toast({ title: `Uploaded ${successCount} file${successCount !== 1 ? "s" : ""}` });
      void loadFiles(selectedBucket, currentPath);
    }
    setUploading(false);
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function deleteFile(file: StorageFile) {
    if (!selectedBucket) return;
    const prefix = currentPath.length > 0 ? currentPath.join("/") + "/" : "";
    const res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", bucket: selectedBucket.name, path: prefix + file.name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({ title: "Delete failed", description: data.error, variant: "destructive" });
    } else {
      toast({ title: `Deleted "${file.name}"` });
      void loadFiles(selectedBucket, currentPath);
    }
  }

  // ── Copy URL ───────────────────────────────────────────────────────────────

  async function copyUrl(file: StorageFile) {
    if (!selectedBucket) return;
    const prefix = currentPath.length > 0 ? currentPath.join("/") + "/" : "";
    const filePath = prefix + file.name;

    const res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "url",
        bucket: selectedBucket.name,
        path: filePath,
        public: selectedBucket.public,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      toast({ title: "Failed to create signed URL", description: data.error, variant: "destructive" });
      return;
    }
    const url = data.url as string;

    await navigator.clipboard.writeText(url);
    setCopiedUrl(file.name);
    setTimeout(() => setCopiedUrl(null), 2000);
    toast({ title: "URL copied!" });
  }

  // ── Create folder ──────────────────────────────────────────────────────────

  async function createFolder() {
    if (!selectedBucket || !newFolderName.trim()) return;
    const prefix = currentPath.length > 0 ? currentPath.join("/") + "/" : "";
    const placeholderPath = prefix + newFolderName.trim() + "/.gitkeep";
    const res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mkdir", bucket: selectedBucket.name, path: placeholderPath }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({ title: "Failed to create folder", description: data.error, variant: "destructive" });
    } else {
      toast({ title: `Folder "${newFolderName}" created` });
      setNewFolderName("");
      setShowNewFolder(false);
      void loadFiles(selectedBucket, currentPath);
    }
  }

  async function createBucket() {
    const name = newBucketName.trim().toLowerCase();
    if (!name) return;
    setCreatingBucket(true);
    try {
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_bucket", name, public: newBucketPublic }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not create bucket");
      toast({ title: `Bucket "${name}" created` });
      setNewBucketName("");
      void loadBuckets();
    } catch (e) {
      toast({
        title: "Could not create bucket",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setCreatingBucket(false);
    }
  }

  // ── Drag and drop ──────────────────────────────────────────────────────────

  const isFolder = (f: StorageFile) => f.id === null;

  // ── Render ─────────────────────────────────────────────────────────────────

  // Bucket list view
  if (!selectedBucket) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
          <HardDrive className="w-4 h-4 text-violet-400 shrink-0" />
          <span className="text-xs font-semibold flex-1">Storage</span>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={loadBuckets}>
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>

        {loadingBuckets ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {backendNone ? (
                <p className="text-[11px] text-muted-foreground px-2 py-2 leading-relaxed">{backendNone}</p>
              ) : (
                <div className="rounded-lg border border-border p-2 space-y-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground px-0.5">New bucket</p>
                  <Input
                    placeholder="avatars"
                    value={newBucketName}
                    onChange={(e) => setNewBucketName(e.target.value)}
                    className="h-7 text-xs"
                  />
                  <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={newBucketPublic}
                      onChange={(e) => setNewBucketPublic(e.target.checked)}
                    />
                    Public
                  </label>
                  <Button
                    size="sm"
                    className="h-6 text-[10px] w-full"
                    disabled={!newBucketName.trim() || creatingBucket}
                    onClick={() => void createBucket()}
                  >
                    {creatingBucket ? <Loader2 className="w-3 h-3 animate-spin" /> : "Create bucket"}
                  </Button>
                </div>
              )}
              {buckets.length === 0 && !backendNone ? (
                <p className="text-[10px] text-muted-foreground px-2">No buckets yet — create one above.</p>
              ) : (
                buckets.map((bucket) => (
                <button
                  key={bucket.id}
                  onClick={() => { setSelectedBucket(bucket); setCurrentPath([]); }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left group"
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${bucket.public ? "bg-emerald-500/10" : "bg-violet-500/10"}`}>
                    {bucket.public
                      ? <Globe className="w-3.5 h-3.5 text-emerald-400" />
                      : <Lock className="w-3.5 h-3.5 text-violet-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{bucket.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {bucket.public ? "Public" : "Private"}
                      {bucket.file_size_limit ? ` · max ${formatBytes(bucket.file_size_limit)}` : ""}
                    </p>
                  </div>
                  <ChevronRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                </button>
              ))
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    );
  }

  // File browser view
  const breadcrumbs = [selectedBucket.name, ...currentPath];

  return (
    <div
      className={`flex flex-col h-full ${dragging ? "ring-2 ring-inset ring-violet-500/40 bg-violet-500/5" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length > 0) void uploadFiles(e.dataTransfer.files);
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-border shrink-0 min-w-0">
        <button onClick={() => setSelectedBucket(null)} className="p-1 rounded hover:bg-muted/50 shrink-0">
          <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto">
          {breadcrumbs.map((crumb, i) => (
            <div key={i} className="flex items-center gap-0.5 shrink-0">
              {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />}
              <button
                onClick={() => {
                  if (i === 0) { setCurrentPath([]); }
                  else setCurrentPath(currentPath.slice(0, i));
                }}
                className={`text-[11px] px-1 py-0.5 rounded hover:bg-muted/50 transition-colors ${
                  i === breadcrumbs.length - 1 ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                {crumb}
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowNewFolder((v) => !v)} title="New folder">
            <Plus className="w-3 h-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Upload files">
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => void loadFiles(selectedBucket, currentPath)}>
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* New folder input */}
      {showNewFolder && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border bg-muted/20">
          <Input
            autoFocus
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void createFolder(); if (e.key === "Escape") { setShowNewFolder(false); setNewFolderName(""); } }}
            className="h-6 text-xs flex-1"
          />
          <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => void createFolder()} disabled={!newFolderName.trim()}>
            Create
          </Button>
        </div>
      )}

      {/* Drop zone hint */}
      {dragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-violet-500/20 border-2 border-dashed border-violet-500/60 rounded-xl px-6 py-4 text-center">
            <Upload className="w-6 h-6 text-violet-400 mx-auto mb-1" />
            <p className="text-sm font-medium text-violet-700 dark:text-violet-300">Drop files to upload</p>
          </div>
        </div>
      )}

      {/* File list */}
      {loadingFiles ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : files.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
          <FolderOpen className="w-8 h-8 text-muted-foreground/20" />
          <p className="text-xs text-muted-foreground">Empty folder</p>
          <p className="text-[10px] text-muted-foreground/60">Drop files here or click ↑ to upload</p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-1.5 space-y-0.5">
            {files.map((file) => {
              const folder = isFolder(file);
              return (
                <div
                  key={file.name}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/40 transition-colors group"
                >
                  {folder
                    ? <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    : fileIcon(file.name)}
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() => { if (folder) setCurrentPath([...currentPath, file.name]); }}
                  >
                    <p className="text-xs truncate">{file.name}</p>
                    {!folder && file.metadata?.size != null && (
                      <p className="text-[9px] text-muted-foreground">{formatBytes(file.metadata.size)}</p>
                    )}
                  </button>

                  {/* Action buttons — visible on hover */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!folder && (
                      <button
                        onClick={() => void copyUrl(file)}
                        className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                        title={selectedBucket.public ? "Copy public URL" : "Copy signed URL (1h)"}
                      >
                        {copiedUrl === file.name
                          ? <Check className="w-3 h-3 text-emerald-400" />
                          : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                    {!folder && (
                      <button
                        onClick={() => void deleteFile(file)}
                        className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Bucket badge */}
      <div className="border-t border-border px-3 py-1.5 flex items-center gap-2 shrink-0">
        <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${selectedBucket.public ? "text-emerald-400 border-emerald-500/30" : "text-violet-400 border-violet-500/30"}`}>
          {selectedBucket.public ? "PUBLIC" : "PRIVATE"}
        </Badge>
        <p className="text-[10px] text-muted-foreground flex-1 truncate">{selectedBucket.name}</p>
        <p className="text-[10px] text-muted-foreground">{files.filter((f) => !isFolder(f)).length} file{files.filter((f) => !isFolder(f)).length !== 1 ? "s" : ""}</p>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files) void uploadFiles(e.target.files); }}
      />
    </div>
  );
}
