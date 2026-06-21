"use client";

import type { GeneratedFile } from "./file-attachment-card";
import { FileAttachmentList } from "./file-attachment-card";

export interface AnalyzeMessageMeta {
  kind: "analyze";
  instruction: string;
  stdout?: string;
  stderr?: string;
  files: GeneratedFile[];
}

interface AnalyzeMessageCardProps {
  meta: AnalyzeMessageMeta;
  createdAt?: string;
  onSaveToProject?: (file: GeneratedFile) => Promise<void> | void;
}

export function AnalyzeMessageCard({ meta, createdAt, onSaveToProject }: AnalyzeMessageCardProps) {
  return (
    <div className="w-full space-y-2 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3">
      <div className="flex items-center gap-2 text-[11px]">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-400"><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-5"/></svg>
        <span className="font-medium text-violet-300">Data analysis</span>
        {createdAt && <span className="text-muted-foreground">· {createdAt}</span>}
      </div>
      <p className="text-xs text-foreground/90 italic">&ldquo;{meta.instruction}&rdquo;</p>
      {meta.stdout && (
        <pre className="text-[11px] font-mono whitespace-pre-wrap bg-background/60 border border-border/40 rounded-lg p-2 max-h-32 overflow-y-auto">
          {meta.stdout}
        </pre>
      )}
      {meta.stderr && (
        <details className="text-[10px]">
          <summary className="cursor-pointer text-red-400 hover:text-red-300">View errors</summary>
          <pre className="font-mono whitespace-pre-wrap bg-red-500/5 border border-red-500/20 rounded-lg p-2 mt-1 max-h-32 overflow-y-auto">
            {meta.stderr}
          </pre>
        </details>
      )}
      {meta.files.length > 0 && (
        <FileAttachmentList
          files={meta.files}
          caption={`${meta.files.length} file${meta.files.length === 1 ? "" : "s"} generated`}
          onSaveToProject={onSaveToProject}
        />
      )}
    </div>
  );
}

export function parseAnalyzeMetadata(metadata: unknown): AnalyzeMessageMeta | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  if (m.kind !== "analyze") return null;
  const files = Array.isArray(m.files) ? m.files : [];
  return {
    kind: "analyze",
    instruction: String(m.instruction ?? ""),
    stdout: m.stdout ? String(m.stdout) : undefined,
    stderr: m.stderr ? String(m.stderr) : undefined,
    files: files.map((f) => {
      const file = f as Record<string, unknown>;
      return {
        name: String(file.name ?? "file"),
        base64: String(file.base64 ?? ""),
        sizeBytes: Number(file.sizeBytes ?? 0),
        mimeType: String(file.mimeType ?? "application/octet-stream"),
      };
    }),
  };
}
