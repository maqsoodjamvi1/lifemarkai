export const CHAT_INPUT_CAPABILITIES = {
  maxMessageLength: 12_000,
  warnMessageLength: 8_000,
  longPasteAttachmentChars: 5_000,
  longPasteMaxChars: 50_000,
} as const;

export interface SecretDetection {
  label: string;
  sample: string;
}

export interface SecretAssignment {
  name: string;
  value: string;
  start: number;
  end: number;
}

export interface RedactedPromptSecrets {
  redactedText: string;
  assignments: SecretAssignment[];
  hasUnsecuredSecret: boolean;
  unsecuredSecret: SecretDetection | null;
}

const SECRET_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "OpenRouter/OpenAI-style key", re: /\bsk-(?:or-v1-|proj-)?[A-Za-z0-9_-]{24,}\b/ },
  { label: "Anthropic key", re: /\bsk-ant-[A-Za-z0-9_-]{24,}\b/ },
  { label: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9_]{24,}\b/ },
  { label: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{24,}\b/ },
  { label: "Stripe live secret", re: /\bsk_live_[A-Za-z0-9]{20,}\b/ },
  { label: "AWS access key", re: /\bA(?:KIA|SIA)[A-Z0-9]{16}\b/ },
  { label: "JWT", re: /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/ },
  {
    label: "environment secret assignment",
    re: /\b(?:[A-Z0-9_]*(?:SECRET|PRIVATE|PASSWORD|TOKEN|API_KEY)[A-Z0-9_]*)\s*=\s*["']?[^"'\s]{16,}/,
  },
];

export function detectPromptSecret(text: string): SecretDetection | null {
  for (const pattern of SECRET_PATTERNS) {
    const match = text.match(pattern.re)?.[0];
    if (match) {
      return {
        label: pattern.label,
        sample: match.length > 16 ? `${match.slice(0, 8)}...${match.slice(-4)}` : match,
      };
    }
  }
  return null;
}

const SECRET_ASSIGNMENT_RE =
  /(?:^|[\n\r;])\s*(?:export\s+)?(?:const\s+|let\s+|var\s+)?([A-Z][A-Z0-9_]{2,})\s*[:=]\s*["']?([^"'\s`,;)]+)["']?/g;

function looksSensitiveKey(name: string): boolean {
  return /(?:SECRET|PRIVATE|PASSWORD|TOKEN|API_KEY|KEY|WEBHOOK|CLIENT_SECRET|SERVICE_ROLE)/i.test(name);
}

function looksSensitiveValue(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.re.test(value));
}

export function extractPromptSecretAssignments(text: string): SecretAssignment[] {
  const assignments: SecretAssignment[] = [];
  for (const match of text.matchAll(SECRET_ASSIGNMENT_RE)) {
    const rawName = match[1] ?? "";
    const rawValue = match[2] ?? "";
    if (!rawName || !rawValue) continue;
    if (!looksSensitiveKey(rawName) && !looksSensitiveValue(rawValue)) continue;
    const full = match[0] ?? "";
    const leading = full.match(/^[\n\r;]/)?.[0] ?? "";
    const start = (match.index ?? 0) + leading.length;
    assignments.push({
      name: rawName.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
      value: rawValue,
      start,
      end: (match.index ?? 0) + full.length,
    });
  }
  return assignments;
}

export function redactPromptSecrets(text: string): RedactedPromptSecrets {
  const assignments = extractPromptSecretAssignments(text);
  let redactedText = "";
  let cursor = 0;

  for (const assignment of assignments) {
    redactedText += text.slice(cursor, assignment.start);
    redactedText += `@secret:${assignment.name}`;
    cursor = assignment.end;
  }
  redactedText += text.slice(cursor);

  const unsecuredSecret = detectPromptSecret(redactedText);
  return {
    redactedText,
    assignments,
    hasUnsecuredSecret: !!unsecuredSecret,
    unsecuredSecret,
  };
}

export function shouldAttachLongPaste(text: string): boolean {
  return text.trim().length >= CHAT_INPUT_CAPABILITIES.longPasteAttachmentChars;
}

export function createLongPasteAttachment(text: string, now = Date.now()): { name: string; content: string; truncated: boolean } {
  const limit = CHAT_INPUT_CAPABILITIES.longPasteMaxChars;
  const truncated = text.length > limit;
  return {
    name: `pasted-${now}.txt`,
    content: truncated ? text.slice(0, limit) : text,
    truncated,
  };
}
