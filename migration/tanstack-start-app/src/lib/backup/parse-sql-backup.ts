/**
 * Parse LifemarkAI SQL backup dumps back into project file records.
 * Format mirrors app/api/projects/db-backup/route.ts export.
 */

export interface ParsedBackupFile {
  path: string;
  content: string;
  language: string;
}

export function parseSqlBackup(sql: string): ParsedBackupFile[] {
  if (!sql?.trim()) return [];

  const files: ParsedBackupFile[] = [];
  const parts = sql.split(/^-- FILE: /m);

  for (const part of parts.slice(1)) {
    const newline = part.indexOf("\n");
    if (newline < 0) continue;
    const path = part.slice(0, newline).trim();
    const body = part.slice(newline + 1);

    const langMatch = body.match(/^-- LANGUAGE: (.+)$/m);
    const language = langMatch?.[1]?.trim() ?? "plaintext";

    const contentMatch = body.match(/\/\*([\s\S]*?)\*\//);
    if (!path || !contentMatch) continue;

    let content = contentMatch[1];
    if (content.startsWith("\n")) content = content.slice(1);
    if (content.endsWith("\n")) content = content.slice(0, -1);

    files.push({ path, content, language });
  }

  return files;
}
