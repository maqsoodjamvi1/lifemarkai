/**
 * Parse LifemarkAI SQL backup dumps back into project file records.
 * Format mirrors src/routes/api/projects/db-backup.ts's export.
 *
 * Current (base64) format: content is base64-encoded before being embedded
 * between `/*` and `*\/` markers, preceded by a `-- ENCODING: base64` line.
 * Base64's alphabet (A-Za-z0-9+/=) can never produce the two-character
 * sequence `*\/`, so this is immune by construction to the bug the old
 * format had.
 *
 * Legacy (raw) format — no `-- ENCODING:` line — embedded file content
 * directly between `/*` and `*\/` with no escaping. That broke on the very
 * common case of a file whose own content contains `*\/` (any JS/TS/CSS
 * block comment, e.g. a JSDoc header): the non-greedy `/\*([\s\S]*?)\*\//`
 * match stopped at that FIRST internal `*\/`, silently truncating the file
 * and misparsing everything after it. That corruption already happened for
 * any legacy backup containing such a file — it can't be un-corrupted after
 * the fact, so this parser keeps the same best-effort raw-embed behavior
 * for legacy input rather than pretending it can recover data that was
 * already lost at export time. Every NEW backup is written in the base64
 * format and is not subject to this at all.
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
    const isBase64 = /^-- ENCODING: base64$/m.test(body);

    const contentMatch = body.match(/\/\*([\s\S]*?)\*\//);
    if (!path || !contentMatch) continue;

    let content = contentMatch[1];
    if (content.startsWith("\n")) content = content.slice(1);
    if (content.endsWith("\n")) content = content.slice(0, -1);

    if (isBase64) {
      // Buffer.from(str, "base64") never throws — Node's decoder silently
      // drops any character outside the base64 alphabet and decodes
      // whatever's left, which for genuinely malformed input produces
      // garbage bytes with no error at all. Validate the charset explicitly
      // first, so a corrupted block is skipped instead of "restored" as
      // binary noise.
      const trimmed = content.trim();
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(trimmed)) continue;
      content = Buffer.from(trimmed, "base64").toString("utf8");
    }

    files.push({ path, content, language });
  }

  return files;
}
