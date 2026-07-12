import type { DiagnosableFile } from "./diagnose-imports";
import type { PreviewRuntimeError } from "./preview-error-bridge";

interface SymbolHit {
  path: string;
  symbol: string;
  line: number;
  codeWindow: string;
}

const STACK_SYMBOL_IGNORE = new Set([
  "Array",
  "Error",
  "MessagePort",
  "Object",
  "Promise",
  "React",
  "ReactDOM",
  "eval",
  "run",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, Math.max(0, index)).split("\n").length;
}

function sliceLines(content: string, line: number, radius = 8): string {
  const lines = content.split("\n");
  const start = Math.max(0, line - radius - 1);
  const end = Math.min(lines.length, line + radius);
  return lines
    .slice(start, end)
    .map((text, offset) => `${start + offset + 1}: ${text}`)
    .join("\n");
}

function extractStackSymbols(errors: PreviewRuntimeError[]): string[] {
  const seen = new Set<string>();
  const symbols: string[] = [];

  for (const err of errors) {
    const text = `${err.message}\n${err.stack ?? ""}`;
    for (const match of text.matchAll(/\bat\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*(?:\(|$)/g)) {
      const raw = match[1].split(".").pop() ?? match[1];
      if (raw.length < 3) continue;
      if (!/[A-Z]/.test(raw[0]) && !/(Section|Preview|Page|Card|List|Grid|Form|Panel|View|Provider|Hook|use[A-Z])/.test(raw)) {
        continue;
      }
      if (STACK_SYMBOL_IGNORE.has(raw) || seen.has(raw)) continue;
      seen.add(raw);
      symbols.push(raw);
    }
  }

  return symbols.slice(0, 8);
}

function findSymbolInFiles(files: DiagnosableFile[], symbol: string): SymbolHit[] {
  const symbolRe = new RegExp(
    [
      `(?:export\\s+default\\s+)?(?:async\\s+)?function\\s+${escapeRegExp(symbol)}\\b`,
      `(?:export\\s+)?(?:const|let|var)\\s+${escapeRegExp(symbol)}\\s*(?::[^=]+)?=`,
      `(?:export\\s+default\\s+)?class\\s+${escapeRegExp(symbol)}\\b`,
    ].join("|"),
    "m",
  );

  return files
    .filter((file) => /\.(tsx?|jsx?)$/i.test(file.path))
    .flatMap((file) => {
      const match = symbolRe.exec(file.content);
      if (!match) return [];
      const line = lineNumberAt(file.content, match.index);
      return [{
        path: file.path,
        symbol,
        line,
        codeWindow: sliceLines(file.content, line),
      }];
    })
    .slice(0, 4);
}

function propertyReadHints(errors: PreviewRuntimeError[]): Array<{ property: string; hint: string }> {
  const hints: Array<{ property: string; hint: string }> = [];
  const seen = new Set<string>();

  for (const err of errors) {
    const message = err.message;
    const read = message.match(/Cannot read properties of (?:undefined|null) \(reading ['"]([^'"]+)['"]\)/i);
    const prop = read?.[1];
    if (!prop || seen.has(prop)) continue;
    seen.add(prop);

    if (prop === "map") {
      hints.push({
        property: prop,
        hint: "Guard array data before mapping: use `(items ?? []).map(...)`, default props to `[]`, and make mock/context exports arrays.",
      });
    } else if (prop === "charAt") {
      hints.push({
        property: prop,
        hint: "Guard string values before `charAt`: use `String(value ?? '').charAt(0)` or default labels/names before rendering.",
      });
    } else {
      hints.push({
        property: prop,
        hint: `Guard the value before reading \`${prop}\`, or provide a complete default object from mock data/context/hooks.`,
      });
    }
  }

  return hints;
}

export function diagnoseRuntimeErrors(
  errors: PreviewRuntimeError[],
  files: DiagnosableFile[],
): string[] {
  if (errors.length === 0 || files.length === 0) return [];

  const issues: string[] = [];
  const seen = new Set<string>();
  const symbols = extractStackSymbols(errors);
  const propertyHints = propertyReadHints(errors);

  function push(issue: string) {
    if (seen.has(issue)) return;
    seen.add(issue);
    issues.push(issue);
  }

  for (const symbol of symbols) {
    for (const hit of findSymbolInFiles(files, symbol)) {
      const focused = propertyHints
        .filter(({ property }) => hit.codeWindow.includes(`.${property}`))
        .map(({ hint }) => hint);
      if (focused.length > 0) {
        for (const hint of focused) {
          push(`${hit.path}:${hit.line}: ${symbol} is in the stack. ${hint}`);
        }
      } else {
        push(`${hit.path}:${hit.line}: ${symbol} is in the preview stack. Inspect this component first and add defensive defaults around props, mock data, and hook/context results.`);
      }
    }
  }

  if (issues.length === 0) {
    for (const { hint } of propertyHints) push(hint);
  }

  return issues.slice(0, 8);
}

export function appendRuntimeDiagnosis(
  prompt: string,
  files: DiagnosableFile[],
  errors: PreviewRuntimeError[],
): string {
  const issues = diagnoseRuntimeErrors(errors, files);
  if (issues.length === 0) return prompt;
  return [
    prompt,
    "",
    "Runtime diagnosis (fix these first):",
    ...issues.map((issue) => `- ${issue}`),
  ].join("\n");
}
