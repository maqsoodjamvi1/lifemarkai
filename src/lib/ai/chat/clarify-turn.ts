import type { ClarificationOption, ClarifyingQuestion } from "./clarification.ts";

export interface ClarifyInterviewQuestion extends ClarifyingQuestion {
  answer: string;
}

export interface ClarifyInterview {
  originalPrompt: string;
  questions: ClarifyInterviewQuestion[];
  /** Index of the question currently being asked. */
  currentIndex: number;
  /** Greeting / empty-intent start — remaining questions adapt to the product pick. */
  openEnded?: boolean;
  /** User picked “something else” — wait for a typed description before advancing. */
  awaitingDetails?: boolean;
}

export type ClarifyTurnResult =
  | { status: "next"; session: ClarifyInterview }
  | { status: "complete"; session: ClarifyInterview; enrichedPrompt: string };

const SKIP_ALL =
  /^(skip(?:\s+all)?|just build|build now|skip questions?|no questions?)\s*[!.]*$/i;

export function isClarifySkipAllText(text: string): boolean {
  return SKIP_ALL.test(text.trim());
}

export function currentClarifyQuestion(
  session: ClarifyInterview | null,
): ClarifyInterviewQuestion | null {
  if (!session) return null;
  const index = Math.max(0, session.currentIndex);
  return session.questions[index] ?? null;
}

export function normalizeClarifyInterview(session: ClarifyInterview): ClarifyInterview {
  const questions = session.questions ?? [];
  const firstUnanswered = questions.findIndex((q) => !q.answer.trim());
  const currentIndex =
    typeof session.currentIndex === "number" && session.currentIndex >= 0
      ? Math.min(session.currentIndex, questions.length)
      : firstUnanswered === -1
        ? questions.length
        : firstUnanswered;
  return { ...session, questions, currentIndex };
}

export function buildClarifyEnrichedPrompt(session: ClarifyInterview): string {
  const answersBlock = session.questions
    .filter((q) => q.answer.trim())
    .map((q) => `- ${q.question}: ${formatClarifyAnswer(q)}`)
    .join("\n");
  if (!answersBlock) return session.originalPrompt;
  return `${session.originalPrompt}\n\nDesign & requirements decisions (apply throughout the build):\n${answersBlock}`;
}

function optionLabel(option: string | ClarificationOption): { label: string; value: string } {
  if (typeof option === "string") return { label: option, value: option };
  return { label: option.label, value: option.value || option.label };
}

/** Show the chip label in the thread, not the internal value. */
export function formatClarifyAnswer(question: ClarifyInterviewQuestion): string {
  const parts = question.answer.split(" | ").map((part) => part.trim()).filter(Boolean);
  return parts
    .map((part) => {
      for (const option of question.options ?? []) {
        const details = optionLabel(option);
        if (part === details.value || part === details.label) return details.label;
      }
      return part;
    })
    .join(", ");
}

export function clarifyAckLine(answered: ClarifyInterviewQuestion): string {
  const shown = formatClarifyAnswer(answered);
  if (!shown) return "Okay.";
  const first = shown.split(",")[0]?.trim() || shown;
  return `Got it — ${first}.`;
}

export const CLARIFY_BUILD_LEAD_IN = "I'll start building this now.";

const DEFERRED_CHOICE =
  /^(other|something else|i['’]?ll describe|custom|type (my|your) own)\b/i;

/** Chip that means “I’ll type it” — don’t advance until they describe it. */
export function isClarifyDeferredChoice(
  question: ClarifyInterviewQuestion,
  raw: string,
): boolean {
  const answer = raw.trim();
  if (!answer) return false;
  for (const option of question.options ?? []) {
    const details = optionLabel(option);
    if (answer !== details.value && answer !== details.label) continue;
    if (DEFERRED_CHOICE.test(details.value) || DEFERRED_CHOICE.test(details.label)) return true;
  }
  return DEFERRED_CHOICE.test(answer);
}

export function clarifySpokenContent(
  question: string,
  opts?: { isFirst?: boolean; ack?: string },
): string {
  if (opts?.ack?.trim()) return `${opts.ack.trim()}\n\n${question}`;
  return question;
}

export interface ClarifyTimelineTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  current?: boolean;
  ack?: string;
}

/** Q&A turns for the chat timeline, including the unanswered question as the last assistant. */
export function buildClarifyTimeline(session: ClarifyInterview): ClarifyTimelineTurn[] {
  const turns: ClarifyTimelineTurn[] = [];
  for (let i = 0; i < session.currentIndex; i += 1) {
    const question = session.questions[i];
    if (!question) continue;
    turns.push({
      id: `clarify-q-${question.id}`,
      role: "assistant",
      content: clarifySpokenContent(question.question, {
        isFirst: i === 0,
        ack: i > 0 && session.questions[i - 1]?.answer.trim()
          ? clarifyAckLine(session.questions[i - 1]!)
          : undefined,
      }),
    });
    if (question.answer.trim()) {
      turns.push({
        id: `clarify-a-${question.id}`,
        role: "user",
        content: formatClarifyAnswer(question),
      });
    }
  }
  const current = currentClarifyQuestion(session);
  if (current) {
    const previous = session.currentIndex > 0 ? session.questions[session.currentIndex - 1] : undefined;
    const ack = previous?.answer.trim() ? clarifyAckLine(previous) : undefined;
    turns.push({
      id: `clarify-q-${current.id}`,
      role: "assistant",
      content: clarifySpokenContent(current.question, {
        isFirst: session.currentIndex === 0,
        ack,
      }),
      current: true,
      ack,
    });
  }
  return turns;
}

/** First assistant question — persist when the interview starts. */
export function clarifyOpeningPersistTurns(session: ClarifyInterview): ClarifyTimelineTurn[] {
  const current = currentClarifyQuestion(session);
  if (!current) return [];
  return [
    {
      id: `clarify-q-${current.id}`,
      role: "assistant",
      content: clarifySpokenContent(current.question, { isFirst: true }),
      current: true,
    },
  ];
}

/**
 * Rows to persist after one interview step: the answer just given (if any),
 * then either the next question or the "I'll start building" line.
 */
export function clarifyPersistDelta(
  before: ClarifyInterview,
  after: ClarifyInterview,
  complete: boolean,
): ClarifyTimelineTurn[] {
  const turns: ClarifyTimelineTurn[] = [];
  const answered = after.questions[before.currentIndex];
  if (
    answered?.answer.trim() &&
    after.currentIndex > before.currentIndex
  ) {
    turns.push({
      id: `clarify-a-${answered.id}`,
      role: "user",
      content: formatClarifyAnswer(answered),
    });
  }
  if (complete) {
    turns.push({
      id: "clarify-build-lead-in",
      role: "assistant",
      content: CLARIFY_BUILD_LEAD_IN,
    });
    return turns;
  }
  const next = currentClarifyQuestion(after);
  if (next && next.id !== answered?.id) {
    const previous = after.currentIndex > 0 ? after.questions[after.currentIndex - 1] : undefined;
    turns.push({
      id: `clarify-q-${next.id}`,
      role: "assistant",
      content: clarifySpokenContent(next.question, {
        ack: previous?.answer.trim() ? clarifyAckLine(previous) : undefined,
      }),
      ack: previous?.answer.trim() ? clarifyAckLine(previous) : undefined,
    });
  }
  return turns;
}

export function messageClarifyTurnId(metadata: unknown, id?: string): string | null {
  const meta = metadata as { clarifyTurnId?: string } | null;
  if (typeof meta?.clarifyTurnId === "string" && meta.clarifyTurnId) return meta.clarifyTurnId;
  if (typeof id === "string" && id.startsWith("clarify-")) return id;
  return null;
}

function followUpsForProduct(product: string): ClarifyingQuestion[] {
  const value = product.toLowerCase();
  const isOps = /\b(ops|internal|erp|crm|dashboard|admin|tool)\b/.test(value);
  const isStore = /\b(store|shop|commerce|cart)\b/.test(value);
  const isBooking = /\b(book|schedul|appoint|class)\b/.test(value);

  if (isOps) {
    return [
      {
        id: "modules",
        question: "Which pieces should we ship first?",
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

  if (isStore) {
    return [
      {
        id: "storemust",
        question: "What must the store do on day one?",
        type: "choice",
        kind: "structure",
        multiple: true,
        options: [
          { label: "Catalog", value: "catalog" },
          { label: "Cart & checkout", value: "checkout" },
          { label: "Orders", value: "orders" },
          { label: "Customer accounts", value: "accounts" },
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

  if (isBooking) {
    return [
      {
        id: "bookingmust",
        question: "What should people be able to book?",
        type: "choice",
        kind: "structure",
        multiple: false,
        options: [
          { label: "Appointments / 1:1", value: "appointments" },
          { label: "Classes / group slots", value: "classes" },
          { label: "Rooms or resources", value: "resources" },
          { label: "A mix", value: "mix" },
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

  return [
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

function withEmptyAnswer(question: ClarifyingQuestion): ClarifyInterviewQuestion {
  return { ...question, type: question.type, answer: "" };
}

/**
 * After the user picks a product type on an open-ended start, replace the
 * unanswered tail with questions that match that product — not a generic website.
 */
export function adaptRemainingQuestions(
  session: ClarifyInterview,
  answered: ClarifyInterviewQuestion,
): ClarifyInterviewQuestion[] {
  if (!session.openEnded) return session.questions;
  const isProduct =
    answered.id === "product" || /what do you want to create/i.test(answered.question);
  if (!isProduct || !answered.answer.trim()) return session.questions;

  const kept = session.questions.slice(0, session.currentIndex);
  const audience: ClarifyingQuestion = {
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
  };
  const keptIds = new Set(kept.map((q) => q.id));
  const next = [audience, ...followUpsForProduct(answered.answer)]
    .filter((q) => !keptIds.has(q.id))
    .map(withEmptyAnswer);
  return [...kept, ...next];
}

function finishIfDone(session: ClarifyInterview): ClarifyTurnResult {
  if (session.currentIndex >= session.questions.length) {
    return { status: "complete", session, enrichedPrompt: buildClarifyEnrichedPrompt(session) };
  }
  return { status: "next", session };
}

export function applyClarifyAnswer(session: ClarifyInterview, rawAnswer: string): ClarifyTurnResult {
  const answer = rawAnswer.trim();
  const current = session.questions[session.currentIndex];
  if (!current || !answer) return { status: "next", session };

  const answered: ClarifyInterviewQuestion = { ...current, answer };
  const questions = session.questions.map((q, i) => (i === session.currentIndex ? answered : q));
  const stepped: ClarifyInterview = {
    ...session,
    questions,
    currentIndex: session.currentIndex + 1,
    awaitingDetails: false,
  };
  const adapted: ClarifyInterview = {
    ...stepped,
    questions: adaptRemainingQuestions(stepped, answered),
  };
  return finishIfDone(adapted);
}

export function skipCurrentClarifyQuestion(session: ClarifyInterview): ClarifyTurnResult {
  return finishIfDone({
    ...session,
    currentIndex: session.currentIndex + 1,
    awaitingDetails: false,
  });
}

export function skipAllClarify(session: ClarifyInterview): ClarifyTurnResult {
  return {
    status: "complete",
    session: { ...session, currentIndex: session.questions.length, awaitingDetails: false },
    enrichedPrompt: buildClarifyEnrichedPrompt(session) || session.originalPrompt,
  };
}

/**
 * Record the current answer and step past it. Does NOT complete from leftover
 * pre-baked questions — the next question comes from the model.
 */
export function answerCurrentClarifyQuestion(
  session: ClarifyInterview,
  rawAnswer: string,
): ClarifyInterview {
  const current = session.questions[session.currentIndex];
  if (!current) {
    return { ...session, awaitingDetails: false };
  }
  const questions = session.questions.map((q, i) =>
    i === session.currentIndex ? { ...q, answer: rawAnswer.trim() } : q,
  );
  return {
    ...session,
    questions,
    currentIndex: session.currentIndex + 1,
    awaitingDetails: false,
  };
}

/** Append the model's next live question as the current unanswered turn. */
export function appendLiveClarifyQuestion(
  session: ClarifyInterview,
  question: ClarifyingQuestion,
): ClarifyInterview {
  const next = withEmptyAnswer(question);
  return {
    ...session,
    questions: [...session.questions, next],
    currentIndex: session.questions.length,
    awaitingDetails: false,
  };
}

export function liveClarifyQuestionTurn(
  session: ClarifyInterview,
  ack?: string,
): ClarifyTimelineTurn[] {
  const current = currentClarifyQuestion(session);
  if (!current) return [];
  const answeredCount = session.questions.filter((q) => q.answer.trim()).length;
  return [
    {
      id: `clarify-q-${current.id}`,
      role: "assistant",
      content: clarifySpokenContent(current.question, {
        isFirst: answeredCount === 0 && !ack,
        ack,
      }),
      current: true,
      ack,
    },
  ];
}
