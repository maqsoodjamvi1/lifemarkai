/**
 * Project knowledge file - sticky rules the agent must respect (Lovable Knowledge parity).
 */

export const KNOWLEDGE_FILE_PATH = "lifemark/KNOWLEDGE.md";

export interface ProjectKnowledge {
  productSummary?: string;
  stack?: string[];
  brandRules?: string[];
  neverDo?: string[];
  alwaysDo?: string[];
  rawMarkdown?: string;
}

export function parseKnowledgeMarkdown(md: string): ProjectKnowledge {
  const sections: Record<string, string[]> = {};
  let current = "raw";
  sections[current] = [];
  for (const line of md.split("\n")) {
    const h = line.match(/^##\s+(.+)/);
    if (h) {
      current = h[1].trim().toLowerCase();
      sections[current] = sections[current] ?? [];
      continue;
    }
    if (line.trim()) (sections[current] = sections[current] ?? []).push(line.trim());
  }
  const bullets = (key: string) =>
    (sections[key] ?? [])
      .filter((l) => l.startsWith("- ") || l.startsWith("* "))
      .map((l) => l.replace(/^[-*]\s+/, ""));
  return {
    productSummary: (sections["product"] ?? sections["summary"] ?? []).join(" ") || undefined,
    stack: bullets("stack"),
    brandRules: bullets("brand"),
    neverDo: bullets("never"),
    alwaysDo: bullets("always"),
    rawMarkdown: md,
  };
}

export function knowledgeToSystemBlock(k: ProjectKnowledge): string {
  const parts: string[] = ["# Project knowledge (must follow)"];
  if (k.productSummary) parts.push(`Product: ${k.productSummary}`);
  if (k.stack?.length) parts.push(`Stack: ${k.stack.join(", ")}`);
  if (k.alwaysDo?.length) parts.push(`Always:\n${k.alwaysDo.map((x) => `- ${x}`).join("\n")}`);
  if (k.neverDo?.length) parts.push(`Never:\n${k.neverDo.map((x) => `- ${x}`).join("\n")}`);
  if (k.brandRules?.length) parts.push(`Brand:\n${k.brandRules.map((x) => `- ${x}`).join("\n")}`);
  if (parts.length === 1 && k.rawMarkdown) return k.rawMarkdown;
  return parts.join("\n\n");
}

export function defaultKnowledgeTemplate(projectName: string): string {
  return `# ${projectName} knowledge

## Product
One-sentence description of what this app does.

## Stack
- React + TypeScript
- Tailwind CSS

## Always
- Prefer existing components before creating new ones
- Keep auth and payments changes behind explicit approval

## Never
- Commit secrets or API keys
- Drop database tables without a migration plan

## Brand
- Tone: clear and direct
`;
}
