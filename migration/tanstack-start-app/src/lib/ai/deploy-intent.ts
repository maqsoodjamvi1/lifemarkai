/**
 * Deploy-intent detection for "publish from chat" (Lovable "ship it" parity).
 *
 * `detectDeployIntent` decides whether a chat message is PRIMARILY asking to
 * publish/deploy the current app (→ the chat route short-circuits into the
 * deploy pipeline, zero AI cost) versus a build request that merely mentions
 * deploy-adjacent words ("build a page about deployment tools").
 *
 * Deliberately conservative: a false negative costs one extra click on the
 * Publish button; a false positive publishes an app the user didn't ask to
 * publish. When in doubt, return false.
 *
 * Pure function — NO imports — so it can be ported/tested standalone.
 */

/** Clear publish phrases (verb forms only — "deployment" as a noun never matches). */
const DEPLOY_PHRASE =
  /\b(ship\s+(it|this|the\s+(app|site|project|website))|publish|deploy|go(es)?\s+live|make\s+(it|this|the\s+(app|site|project|website))\s+live|take\s+(it|this)\s+live|push\s+(it\s+|this\s+)?live|release\s+(it|this|the\s+(app|site|project|website))|launch\s+(it|this|the\s+(app|site|project|website)))\b/;

/** Prompt STARTS with a deploy verb (optionally prefixed by please/ok/yes/now/go ahead). */
const STARTS_WITH_DEPLOY_VERB =
  /^(?:(?:please|now|ok|okay|yes|yeah|sure|go\s+ahead(?:\s+and)?|let'?s|can\s+you|could\s+you)\s+)*(ship|publish|deploy|go\s+live|make\s+(it|this)\s+live|take\s+(it|this)\s+live|push\s+(it\s+|this\s+)?live|release|launch)\b/;

/**
 * Build verbs with an object ("build a page", "add the button", "make me a
 * site") — the message is a build request; deploy words are incidental.
 * Note "make it live" does NOT match (no article/noun object).
 */
const BUILD_REQUEST =
  /\b(create|build|add|make|write|design|generate|implement|develop|code)\s+(a|an|the|some|my|me|us|new)\b/;

/** Questions / explanations — never auto-publish on "how do I deploy?". */
const QUESTION_OR_EXPLAIN =
  /\b(how\s+(do|to|can|would|should)|what|why|where|when|explain|should\s+i|can\s+i|is\s+it\s+possible)\b/;

/** Negation / postponement — "don't deploy yet". */
const NEGATION = /\b(don'?t|do\s+not|never|not\s+yet|later|hold\s+off|wait)\b/;

/** Debugging context — "the deploy failed", "deploy error in the logs". */
const DEBUG_CONTEXT =
  /\b(fail(s|ed|ing|ure)?|error|bug|broken|broke|crash(ed|ing)?|stuck|fix|debug|log|logs)\b/;

/** Sequencing — "fix the header then deploy" is a build/fix ask first. */
const SEQUENCING = /\b(first|then|after|once|before)\b/;

/** Noun usage — "the deploy", "my last release" (talking ABOUT a deploy). */
const NOUN_USAGE =
  /\b(the|a|an|my|our|your|last|previous|latest|old|new)\s+(deploy|deployment|deployments|release|releases|launch)\b/;

/**
 * Returns true when the message's PRIMARY ask is to publish the app.
 *
 * True:  "ship it", "publish", "deploy", "go live", "make it live",
 *        "release it", "publish my app", "can you deploy this"
 * False: "build a page about deployment tools", "add a deploy button",
 *        "how do I deploy this?", "the deploy failed", "don't deploy yet",
 *        "fix the navbar then deploy"
 */
export function detectDeployIntent(prompt: string): boolean {
  if (!prompt || typeof prompt !== "string") return false;

  // Normalize: lowercase, collapse whitespace, strip trailing punctuation.
  const text = prompt
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\s!.?🚀✨]+$/gu, "");

  if (!text) return false;
  // Long prompts are never "just publish" — deploy is incidental.
  if (text.length > 120) return false;

  // Disqualifiers first (conservative).
  if (NEGATION.test(text)) return false;
  if (QUESTION_OR_EXPLAIN.test(text)) return false;
  if (BUILD_REQUEST.test(text)) return false;
  if (DEBUG_CONTEXT.test(text)) return false;
  if (SEQUENCING.test(text)) return false;
  if (NOUN_USAGE.test(text)) return false;

  // Must contain a clear publish phrase in verb form.
  if (!DEPLOY_PHRASE.test(text)) return false;

  // Primary-ask requirement: the prompt STARTS with a deploy verb,
  // or the whole prompt is short enough that the phrase IS the ask.
  if (STARTS_WITH_DEPLOY_VERB.test(text)) return true;
  return text.length <= 64;
}
