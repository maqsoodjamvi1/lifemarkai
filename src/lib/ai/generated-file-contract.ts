import type { ParsedFile } from "./code-parser";
import { guardFileWrite } from "./guard-file-write";

export interface FileContractIssue {
  code: string;
  path: string;
  message: string;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const RESERVED_ROOTS = new Set([".git", "node_modules", ".next", "dist", "build", "coverage"]);
const SECRET_FILES = /(^|\/)(?:\.env(?:\.(?!example$)[^/]*)?|id_rsa|id_ed25519|.*\.(?:pem|p12|pfx|key))$/i;

export function normalizeGeneratedPath(raw: string): string | null {
  const path = raw.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
  if (!path || path.startsWith("/") || /^[a-z]:\//i.test(path) || path.includes("\0")) return null;
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  if (RESERVED_ROOTS.has(parts[0].toLowerCase())) return null;
  return parts.join("/");
}

export function enforceGeneratedFileContract(
  files: ParsedFile[],
  previousFiles: Array<Pick<ParsedFile, "path" | "content">> = [],
): ParsedFile[] {
  const issues: FileContractIssue[] = [];
  const seen = new Set<string>();
  const previous = new Map(previousFiles.map((file) => [file.path.toLowerCase(), file.content]));

  const accepted = files.map((file) => {
    const path = normalizeGeneratedPath(file.path);
    if (!path) {
      issues.push({ code: "unsafe-path", path: file.path, message: "path must be project-relative and cannot target generated or dependency directories" });
      return null;
    }
    const key = path.toLowerCase();
    if (seen.has(key)) {
      issues.push({ code: "duplicate-target", path, message: "the generation contains multiple writes to the same case-insensitive path" });
    }
    seen.add(key);
    if (SECRET_FILES.test(path)) {
      issues.push({ code: "secret-file", path, message: "models cannot write environment or private-key files; use managed secrets" });
    }
    if (Buffer.byteLength(file.content, "utf8") > MAX_FILE_BYTES) {
      issues.push({ code: "oversized-file", path, message: `generated files are limited to ${MAX_FILE_BYTES} bytes` });
    }
    if (file.content.includes("\0")) {
      issues.push({ code: "binary-content", path, message: "binary content is not accepted by the text-file generation contract" });
    }
    const verdict = guardFileWrite({ path, next: file.content, previous: previous.get(key) });
    if (!verdict.ok) {
      issues.push({ code: verdict.code ?? "unsafe-write", path, message: verdict.reason ?? "file write rejected" });
    }
    return { ...file, path };
  }).filter((file): file is ParsedFile => file !== null);

  if (issues.length > 0) {
    const detail = issues.slice(0, 8).map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new Error(`Generated-file contract rejected ${issues.length} write(s): ${detail}`);
  }
  return accepted;
}
