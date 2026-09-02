export interface ClarificationOption { label: string; description?: string; value?: string }
export interface ClarifyingQuestion {
  id: string; question: string; type: "text" | "choice"; kind: string;
  multiple: boolean; options?: Array<string | ClarificationOption>;
}

export const MAX_CLARIFY_TURNS = 5;

export interface ClarifyModelTurn {
  question: ClarifyingQuestion | null;
  ack?: string;
  readyToBuild: boolean;
}

export function buildClarificationPrompt(
  appType: string,
  appShell: boolean,
  openEnded = false,
  isContinue = false,
): string {
  return [
    "You are interviewing the user before writing any code — like Lovable chat, not a web form.",
    "Ask exactly ONE question. Never output a list of questions.",
    "Do not research, plan, or generate code in this step.",
    "Speak the question as a short line a product designer would actually say.",
    "If the answer is categorical, include 3-5 concrete choice options ({label, description, value}). If they should type freely, omit options.",
    isContinue
      ? "They already answered one or more interview questions. Ask the next missing decision. Do not repeat. Do not assume a website unless they said so."
      : openEnded
        ? "The user greeted you or said nothing useful. Ask what they want to create. Do not assume they want a website, store, or app type."
        : appShell
          ? `This looks like a ${appType.replace(/-/g, " ")} operations product. Ask about modules, who signs in, or roles — not marketing palettes.`
          : `Detected direction: ${appType}. Ask the single most important missing decision (audience, must-have, or look) — not something they already said.`,
    "If you already know the product, who it is for, and the day-one must-have, set readyToBuild true, put a one-line spoken ack in ack, and omit question.",
    "Never ask 'are you sure'. Never invent requirements they did not give.",
    'Return ONLY JSON: {"ack":"optional spoken ack of the last answer","question":"the one question","options":[{"label":"...","description":"...","value":"..."}],"multiple":false,"kind":"structure|audience|palette|database|general","readyToBuild":false}',
  ].join("\n");
}

export function buildClarifyContinueUserContent(opts: {
  originalPrompt: string;
  history: Array<{ question: string; answer: string }>;
  latestAnswer: string;
}): string {
  const lines = opts.history.map((turn) => `- ${turn.question}: ${turn.answer}`);
  return [
    `Original request: ${opts.originalPrompt}`,
    lines.length ? `Answers so far:\n${lines.join("\n")}` : "No answers yet.",
    `Latest answer: ${opts.latestAnswer}`,
    `Interview turns so far: ${opts.history.length} of ${MAX_CLARIFY_TURNS}.`,
    "Ask the next ONE question, or set readyToBuild true if you have enough to start.",
  ].join("\n");
}

export function parseClarifyHistory(raw: unknown): Array<{ question: string; answer: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const rec = item as Record<string, unknown>;
      const question = typeof rec.question === "string" ? rec.question.trim() : "";
      const answer = typeof rec.answer === "string" ? rec.answer.trim() : "";
      if (!question || !answer) return [];
      return [{ question, answer }];
    })
    .slice(0, MAX_CLARIFY_TURNS);
}

export function fallbackOpenEndedQuestions(): ClarifyingQuestion[] {
  return [
    {
      id: "product",
      question: "What do you want to create?",
      type: "choice",
      kind: "structure",
      multiple: false,
      options: [
        { label: "A website or landing page", description: "Public pages people visit", value: "website" },
        { label: "An online store", description: "Catalog, cart, checkout", value: "store" },
        { label: "An internal tool", description: "CRM, dashboard, ERP, admin", value: "ops" },
        { label: "A booking or scheduling app", description: "Appointments, classes, reservations", value: "booking" },
        { label: "Something else — I'll describe it", description: "Type the idea after you pick this", value: "other" },
      ],
    },
    {
      id: "audience",
      question: "Who is it mainly for?",
      type: "choice",
      kind: "audience",
      multiple: false,
      options: [
        { label: "Customers / public visitors", value: "public" },
        { label: "A team at work", value: "staff" },
        { label: "Both — public site plus a staff app", value: "both" },
      ],
    },
    {
      id: "mustdo",
      question: "What's the one thing it must do on day one?",
      type: "text",
      kind: "general",
      multiple: false,
    },
  ];
}

/** Next single fallback question when the model fails. Uses the bank in order. */
export function fallbackClarifyTurn(
  appType: string,
  appShell: boolean,
  openEnded = false,
  answeredCount = 0,
): ClarifyingQuestion {
  const bank = fallbackClarifyingQuestions(appType, appShell, openEnded);
  return bank[Math.min(Math.max(0, answeredCount), bank.length - 1)]!;
}

/** When the model returns nothing, still interview — never skip straight to build. */
export function fallbackClarifyingQuestions(appType: string, appShell: boolean, openEnded = false): ClarifyingQuestion[] {
  if (openEnded) return fallbackOpenEndedQuestions();
  const audience: ClarifyingQuestion = {
    id: "audience",
    question: "Who is this mainly for?",
    type: "choice",
    kind: "audience",
    multiple: false,
    options: [
      { label: "Customers / public visitors", description: "Marketing, browse, buy or book", value: "public" },
      { label: "A team at work", description: "Internal ops, roles, daily workflows", value: "staff" },
      { label: "Both — public site plus a staff app", description: "Website for visitors, admin for the team", value: "both" },
    ],
  };
  if (appShell) {
    return [
      audience,
      {
        id: "modules",
        question: `Which ${appType.replace(/-/g, " ")} pieces matter first?`,
        type: "choice",
        kind: "structure",
        multiple: true,
        options: [
          { label: "Records & lists", description: "Create, search, and manage core items", value: "records" },
          { label: "Dashboard", description: "Today's numbers and work queue", value: "dashboard" },
          { label: "People & roles", description: "Sign-in, admin vs staff vs viewer", value: "auth" },
          { label: "Reports / history", description: "Activity, exports, audit trail", value: "reports" },
        ],
      },
      {
        id: "auth",
        question: "How should people sign in?",
        type: "choice",
        kind: "database",
        multiple: false,
        options: [
          { label: "Email and password", value: "email" },
          { label: "Google / GitHub", value: "oauth" },
          { label: "Invite-only", value: "invite" },
          { label: "No accounts yet", value: "none" },
        ],
      },
    ];
  }
  return [
    audience,
    {
      id: "musthave",
      question: "Which pages must exist on day one?",
      type: "choice",
      kind: "structure",
      multiple: true,
      options: [
        { label: "Home / hero", value: "home" },
        { label: "Services or product", value: "offer" },
        { label: "Pricing", value: "pricing" },
        { label: "Contact or booking", value: "contact" },
        { label: "About / gallery", value: "about" },
      ],
    },
    {
      id: "look",
      question: "What should it feel like?",
      type: "choice",
      kind: "palette",
      multiple: false,
      options: [
        { label: "Clean SaaS blue (#2563eb, #f8fafc)", value: "saas" },
        { label: "Warm editorial (#111827, #fffbeb, #b45309)", value: "editorial" },
        { label: "Bold dark (#0b1220, #38bdf8)", value: "midnight" },
        { label: "Soft brand violet (#7c3aed, #faf5ff)", value: "violet" },
      ],
    },
  ];
}

/**
 * Strip common wrapping the model adds around the JSON array despite being
 * told "output only a JSON question array" — markdown code fences
 * (```json ... ``` or ``` ... ```), or leading/trailing prose. Confirmed live
 * bug (brutal-testing session): clarifyFirst correctly reached the model and
 * got a real ~800-token response, but a bare JSON.parse on the raw stream
 * text silently failed and returned [], which the client then correctly
 * interpreted as "no questions" and force-built instead — so Clarify never
 * appeared even though every upstream gate was working.
 */
function stripJsonFences(rawJson: string): string {
  let text = rawJson.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  return text;
}

function extractJsonArrayText(rawJson: string): string {
  const text = stripJsonFences(rawJson);
  if (text.startsWith("[")) return text;
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return text;
}

function extractJsonValueText(rawJson: string): string {
  const text = stripJsonFences(rawJson);
  if (text.startsWith("{") || text.startsWith("[")) return text;
  const objStart = text.indexOf("{");
  const arrStart = text.indexOf("[");
  if (objStart !== -1 && (arrStart === -1 || objStart < arrStart)) {
    const end = text.lastIndexOf("}");
    if (end > objStart) return text.slice(objStart, end + 1);
  }
  return extractJsonArrayText(rawJson);
}

export function parseClarifyingQuestions(rawJson: string): ClarifyingQuestion[] {
  let rows: unknown[];
  try {
    const parsed: unknown = JSON.parse(extractJsonArrayText(rawJson));
    rows = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object"
      ? (Object.values(parsed as Record<string, unknown>).find(Array.isArray) as unknown[] | undefined) ?? [] : [];
  } catch {
    console.error("[CLARIFY_DIAG] parseClarifyingQuestions failed to parse model output", {
      rawJsonLength: rawJson.length,
      rawJsonSnippet: rawJson.slice(0, 300),
    });
    return [];
  }
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

export function parseClarifyTurn(rawJson: string): ClarifyModelTurn {
  try {
    const parsed: unknown = JSON.parse(extractJsonValueText(rawJson));
    if (Array.isArray(parsed)) {
      const questions = parseClarifyingQuestions(JSON.stringify(parsed));
      return { question: questions[0] ?? null, readyToBuild: questions.length === 0 };
    }
    if (!parsed || typeof parsed !== "object") {
      return { question: null, readyToBuild: false };
    }
    const rec = parsed as Record<string, unknown>;
    const ack = typeof rec.ack === "string" && rec.ack.trim() ? rec.ack.trim() : undefined;
    const readyToBuild = rec.readyToBuild === true || rec.done === true;
    const nested = Array.isArray(rec.questions)
      ? rec.questions
      : Array.isArray(rec.clarifying_questions)
        ? rec.clarifying_questions
        : null;
    if (nested) {
      const questions = parseClarifyingQuestions(JSON.stringify(nested));
      return { question: questions[0] ?? null, ack, readyToBuild: readyToBuild || questions.length === 0 };
    }
    const questions = parseClarifyingQuestions(JSON.stringify([parsed]));
    return {
      question: questions[0] ?? null,
      ack,
      readyToBuild: readyToBuild || (!questions[0] && readyToBuild),
    };
  } catch {
    return { question: null, readyToBuild: false };
  }
}
