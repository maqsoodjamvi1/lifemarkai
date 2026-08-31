/**
 * Turn an AI request failure into something the user can act on.
 *
 * WHY THIS EXISTS
 * ---------------
 * The chat panel had two ways to fail and they behaved completely differently.
 * A failure that arrived MID-STREAM (as an SSE `{error}` payload) was written
 * into the thread as a persistent message explaining the cause — that fix was
 * made after a drained OpenRouter balance 402'd every build invisibly for days.
 * A failure that arrived BEFORE the stream opened (a non-2xx response) got a
 * five-second toast and nothing else, which is the same invisibility the
 * in-chat message was introduced to end.
 *
 * Worse, the pre-stream paths never read the server's error body, so two very
 * different 402s — "this user is out of app credits" and "the platform's
 * OpenRouter balance is empty" — produced the identical message, "add credits
 * or upgrade your plan". A user acting on that tops up their own account and
 * watches nothing change, because the problem was never theirs.
 *
 * One function, used by every failure path, so the two can't drift again.
 */

export interface AiFailureInput {
  /** HTTP status, when the failure came from a response rather than a stream. */
  status?: number;
  /** The server's error text — from a JSON body, or an SSE `{error}` payload. */
  rawError?: string | null;
}

export interface AiFailureDescription {
  /** Short toast title. */
  title: string;
  /** Toast body — one line, no markdown. */
  summary: string;
  /** Markdown for the persistent in-thread message. */
  chatMarkdown: string;
  /**
   * True when the cause is the platform's own provider account, not anything
   * the user can fix by buying credits. Callers use this to avoid pointing the
   * user at a billing page that will not help them.
   */
  isPlatformFault: boolean;
}

/** Does this text describe the PLATFORM's provider balance, not the user's? */
function isProviderBalance(raw: string): boolean {
  return (
    /openrouter/i.test(raw) ||
    /insufficient credits \(guard\)/i.test(raw) ||
    /balance is negative/i.test(raw) ||
    /balance too low/i.test(raw)
  );
}

function isVerificationBlocked(raw: string): boolean {
  return /verification blocked this generation/i.test(raw);
}

function verificationReason(raw: string): string {
  return raw
    .replace(/^Error:\s*/i, "")
    .replace(/^Verification blocked this generation before it replaced your working app:\s*/i, "")
    .trim();
}

export function describeAiFailure(input: AiFailureInput): AiFailureDescription {
  const raw = (input.rawError ?? "").trim();
  const status = input.status;
  const excerpt = raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;

  // Checked before the status switch: a provider-balance failure can arrive as
  // a 402, as a 500, or mid-stream with no status at all, and it needs the same
  // answer every time. Status is the weaker signal here; the text is the truth.
  if (isProviderBalance(raw) || (status === 402 && /openrouter/i.test(raw))) {
    return {
      title: "AI provider is out of credits",
      summary: "The platform's AI provider account needs topping up — your credits are untouched.",
      isPlatformFault: true,
      chatMarkdown:
        "⚠️ **The AI provider account is out of credits.**\n\n" +
        "Every model call is failing, so nothing could be generated. " +
        "**This is not your account** — your credits have not been spent and buying more will not help.\n\n" +
        "Whoever runs this instance needs to top up the OpenRouter balance at " +
        "https://openrouter.ai/settings/credits. Your message is still in the thread; " +
        "resend it once that is done." +
        (excerpt ? `\n\n\`\`\`\n${excerpt}\n\`\`\`` : ""),
    };
  }

  if (isVerificationBlocked(raw)) {
    const reason = verificationReason(raw);
    return {
      title: "Build failed verification",
      summary: "The generated code did not pass the safety/render check, so your app was left unchanged.",
      isPlatformFault: false,
      chatMarkdown:
        "⚠️ **The build failed verification, so your app was left unchanged.**\n\n" +
        "LifemarkAI generated a candidate update, but rejected it before replacing your files because the preview check found that the app would not render correctly." +
        (reason ? `\n\n**Why it was blocked:** ${reason}` : "") +
        "\n\nResend the message to retry, or make the request more specific about the page/app type and the design you want.",
    };
  }

  switch (status) {
    case 402:
      return {
        title: "Out of credits",
        summary: "This project is out of credits. Add credits or upgrade to keep building.",
        isPlatformFault: false,
        chatMarkdown:
          "⚠️ **You are out of credits.**\n\n" +
          "Nothing was generated and nothing was charged. Add credits or upgrade your plan, " +
          "then resend — your message is still here.",
      };

    case 423:
      return {
        title: "Project is Live — changes locked",
        summary: "Switch to the Test environment (top bar) to edit.",
        isPlatformFault: false,
        chatMarkdown:
          "🔒 **This project is in Live mode — edits are locked.**\n\n" +
          "Live protects your published app from accidental changes, so Build and Agent requests are " +
          "rejected. Nothing was changed and no credits were spent.\n\n" +
          "**To make changes:** switch to **Test** using the Test / Live toggle in the top bar, build and " +
          "preview there, then promote back to Live when you are happy. Your message is still here.",
      };

    case 429:
      return {
        title: "Rate limited",
        summary: "Too many requests in a short window. Wait a moment and resend.",
        isPlatformFault: false,
        chatMarkdown:
          "⏳ **Rate limited.**\n\n" +
          "Too many requests went out in a short window, so this one was refused before it reached the " +
          "model. Nothing was generated and nothing was charged. Wait a minute and resend — your message " +
          "is still here.",
      };

    case 401:
    case 403:
      return {
        title: "Session expired",
        summary: "Your session is no longer valid — reload the page and sign in again.",
        isPlatformFault: false,
        chatMarkdown:
          "🔑 **Your session is no longer valid.**\n\n" +
          "Reload the page and sign in again, then resend. Nothing was changed and your message is " +
          "still here.",
      };

    case 413:
      return {
        title: "Request too large",
        summary: "The prompt or attachment exceeded the size limit.",
        isPlatformFault: false,
        chatMarkdown:
          "📦 **That request was too large to send.**\n\n" +
          "Shorten the prompt, or attach the extra context as a file instead of pasting it inline. " +
          "Your message is still here.",
      };

    default:
      break;
  }

  if (typeof status === "number" && status >= 500) {
    return {
      title: "AI request failed",
      summary: `The server returned ${status}. Nothing was changed — resend to retry.`,
      isPlatformFault: true,
      chatMarkdown:
        `⚠️ **The server failed while handling this request** (HTTP ${status}), so no changes were made.\n\n` +
        "This is usually transient — resend to retry. Your message is still in the thread." +
        (excerpt ? `\n\n\`\`\`\n${excerpt}\n\`\`\`` : ""),
    };
  }

  const statusPart = typeof status === "number" ? ` (HTTP ${status})` : "";
  return {
    title: "AI request failed",
    summary: raw ? raw.slice(0, 200) : `The request failed${statusPart}.`,
    isPlatformFault: false,
    chatMarkdown:
      `⚠️ **The request failed${statusPart}**, so no changes were made.\n\n` +
      "Your message is still in the thread — resend to retry." +
      (excerpt ? `\n\n\`\`\`\n${excerpt}\n\`\`\`` : ""),
  };
}

/**
 * Read a failed Response's error text without ever throwing.
 *
 * The pre-stream paths used to discard the body entirely, which is how a
 * platform-level 402 came to wear a "top up your account" message meant for a
 * user-level one. A body may be JSON, plain text, or already consumed; none of
 * those may take down the error path that is trying to explain the failure.
 */
export async function readErrorBody(res: Response): Promise<string> {
  try {
    const text = await res.clone().text();
    if (!text) return "";
    try {
      const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
      const value = parsed.error ?? parsed.message;
      if (typeof value === "string") return value;
      if (value != null) return JSON.stringify(value);
    } catch {
      /* not JSON — the raw text is still useful */
    }
    return text.slice(0, 600);
  } catch {
    return "";
  }
}
