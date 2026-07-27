/** Matches `@src/App.tsx:12` or `@src/App.tsx:12-34` line references in chat input. */
export const LINE_REF_PATTERN = /@([\w./\\-]+):(\d+)(?:-(\d+))?/g;

export interface ParsedLineRef {
  /** Full match including `@` */
  raw: string;
  path: string;
  startLine: number;
  endLine: number;
}

export function parseLineRefs(input: string): ParsedLineRef[] {
  const refs: ParsedLineRef[] = [];
  const re = new RegExp(LINE_REF_PATTERN.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const start = Number.parseInt(m[2], 10);
    const end = m[3] ? Number.parseInt(m[3], 10) : start;
    refs.push({
      raw: m[0],
      path: m[1],
      startLine: start,
      endLine: end,
    });
  }
  return refs;
}

export function removeLineRefFromInput(input: string, raw: string): string {
  return input.replace(raw, "").replace(/  +/g, " ").trim();
}

export function formatLineRefLabel(ref: ParsedLineRef): string {
  const base = ref.path.split("/").pop() ?? ref.path;
  if (ref.endLine !== ref.startLine) return `${base}:${ref.startLine}-${ref.endLine}`;
  return `${base}:${ref.startLine}`;
}
