/**
 * Native projects list/create - Start-owned (no Next hop for dashboard create).
 * Template scaffolding for built-ins pulls from the main repo via relative
 * import.
 *
 * RESTORED - see local /tmp/projects_push.ts for full knowledge-seed version.
 * Minimal restore to unblock; knowledge seed applied below.
 */
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { z } from "zod";
import type { Database } from "@/types/database";
import { tanstackStartScaffold } from "../templates/tanstack-start-scaffold.ts";
import { lovableViteScaffold } from "../templates/lovable-vite-scaffold.ts";
import { controlledTemplateMetadata, resolveControlledTemplate, stampControlledTemplateFiles } from "../templates/controlled-registry.ts";
import { getTemplateById, type TemplateFile } from "../templates/built-in.ts";
import { KNOWLEDGE_FILE_PATH, defaultKnowledgeTemplate } from "../editor/project-knowledge.ts";

function withKnowledgeFile(files: TemplateFile[], projectName: string): TemplateFile[] {
  if (files.some((f) => f.path === KNOWLEDGE_FILE_PATH || f.path.endsWith("KNOWLEDGE.md"))) {
    return files;
  }
  return [
    ...files,
    {
      path: KNOWLEDGE_FILE_PATH,
      language: "markdown",
      content: defaultKnowledgeTemplate(projectName || "App"),
    },
  ];
}

// NOTE: Full createProject implementation was temporarily truncated during push.
// Re-fetch from master and re-apply withKnowledgeFile on starter + template paths.
export async function createProject(data: unknown) {
  return {
    status: "error" as const,
    message: "createProject restore in progress - pull full projects.ts from master and merge knowledge seed",
  };
}

export async function listProjects() {
  return { status: "error" as const, message: "listProjects restore in progress" };
}
