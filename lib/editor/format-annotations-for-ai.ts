export interface AnnotationForAi {
  x: number;
  y: number;
  text: string;
  resolved?: boolean;
}

/** Format open preview sticky notes for an AI fix prompt. */
export function formatAnnotationsForAi(annotations: AnnotationForAi[]): string {
  const open = annotations.filter((a) => !a.resolved && a.text.trim());
  if (!open.length) return "";
  const lines = open.map(
    (a, i) => `${i + 1}. **Note** (${a.x.toFixed(0)}%, ${a.y.toFixed(0)}%): ${a.text.trim()}`,
  );
  return [
    "Address these preview annotations. Fix the underlying UI/UX at each marked location.",
    "",
    ...lines,
    "",
    "After fixing, summarize what changed.",
  ].join("\n");
}
