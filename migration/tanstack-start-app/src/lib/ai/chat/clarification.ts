export interface ClarificationOption { label: string; description?: string; value?: string }
export interface ClarifyingQuestion {
  id: string; question: string; type: "text" | "choice"; kind: string;
  multiple: boolean; options?: Array<string | ClarificationOption>;
}

export function buildClarificationPrompt(appType: string, appShell: boolean): string {
  return [
    "You are an expert product designer and software architect asking only decisions required before building.",
    "Do not research, plan, or generate code. Output only a JSON question array.",
    "Generate 1-4 questions only for decisions that materially change the product. Prefer 3-5 concrete choices.",
    'Each object: id, question, type ("text"|"choice"), kind, multiple (boolean), options ({label, description, value?}[]).',
    appShell ? `This is a ${appType} operations app. Ask about unresolved modules, authentication, and roles.` : "For a new website, ask only unresolved design decisions.",
    "For connectors clarify shared real data, per-user OAuth, published backend/auth, and additional AI providers. Use multiple:true for compatible choices and describe outcomes.",
    "Never ask what the request already answers. Keep each question short and answerable in one tap.",
  ].join("\n");
}

export function parseClarifyingQuestions(rawJson: string): ClarifyingQuestion[] {
  let rows: unknown[];
  try {
    const parsed: unknown = JSON.parse(rawJson);
    rows = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object"
      ? (Object.values(parsed as Record<string, unknown>).find(Array.isArray) as unknown[] | undefined) ?? [] : [];
  } catch { return []; }
  return rows.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const record = raw as Record<string, unknown>;
    const question = [record.question, record.q, record.text, record.prompt, record.label]
      .find((value): value is string => typeof value === "string" && value.trim() !== "");
    if (!question) return [];
    const source = Array.isArray(record.options) ? record.options : Array.isArray(record.choices) ? record.choices : [];
    const options = source.flatMap((item): Array<string | ClarificationOption> => {
      if (typeof item === "string" && item.trim()) return [item.trim()];
      if (!item || typeof item !== "object") return [];
      const option = item as Record<string, unknown>;
      const label = [option.label, option.text, option.value].find((v): v is string => typeof v === "string" && v.trim() !== "");
      if (!label) return [];
      return [{ label: label.trim(),
        ...(typeof option.description === "string" && option.description.trim() ? { description: option.description.trim() } : {}),
        ...(typeof option.value === "string" && option.value.trim() ? { value: option.value.trim() } : {}) }];
    });
    return [{ id: typeof record.id === "string" ? record.id : `q${index + 1}`, question: question.trim(),
      type: options.length ? "choice" as const : "text" as const,
      kind: typeof record.kind === "string" ? record.kind : "general", multiple: record.multiple === true,
      ...(options.length ? { options } : {}) }];
  });
}
