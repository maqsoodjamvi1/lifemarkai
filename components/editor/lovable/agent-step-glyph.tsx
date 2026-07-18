"use client";

import {
  AlertCircle,
  FileCode,
  FileText,
  Image,
  ListChecks,
  Pencil,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

export type AgentStepKind =
  | "edit"
  | "delete"
  | "read"
  | "search"
  | "image"
  | "analyze"
  | "finalize"
  | "error"
  | "other";

/** Small glyph that conveys what kind of work an agent step is doing. */
export function LovableAgentStepGlyph({ kind }: { kind: AgentStepKind | string }) {
  const cls = "w-3.5 h-3.5 shrink-0 text-muted-foreground/70";
  switch (kind) {
    case "edit":
      return <Pencil className={cls} />;
    case "delete":
      return <Trash2 className={cls} />;
    case "read":
      return <FileText className={cls} />;
    case "search":
      return <Search className={cls} />;
    case "image":
      return <Image className={cls} />;
    case "analyze":
      return <ListChecks className={cls} />;
    case "finalize":
      return <Sparkles className={cls} />;
    case "error":
      return <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />;
    default:
      return <FileCode className={cls} />;
  }
}
