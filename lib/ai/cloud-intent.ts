/**
 * Cloud-ops chat intents (Lovable parity, Jul 8 2026 changelog):
 *  - "Resize your Cloud instance from chat" — describe slowness / ask for a
 *    bigger instance → approval card with a size picker.
 *  - "Pause a Lovable Cloud project" — ask to pause/resume the backend.
 *
 * Pure + conservative, modeled on deploy-intent.ts: false negatives are
 * cheap (the Cloud panel always works), false positives burn trust.
 */

export type CloudIntent =
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "resize" };

const PAUSE_RE = /\b(pause|suspend|stop)\b[^.?!]{0,40}\b(cloud|backend|database|db|instance|project)\b/i;
const RESUME_RE = /\b(resume|unpause|wake|restart)\b[^.?!]{0,40}\b(cloud|backend|database|db|instance|project)\b/i;
const RESIZE_RE = /\b(resize|upgrade|downgrade|scale|bigger|larger|smaller)\b[^.?!]{0,60}\b(instance|compute|cloud|database|db)\b/i;
const SLOW_DB_RE = /\b(database|db|backend)\b[^.?!]{0,60}\b(slow|sluggish|overloaded|under load|struggling)\b[^.?!]{0,80}\b(resize|upgrade|bigger|larger|instance)\b/i;

/** Things that mean the user is talking ABOUT the feature, not asking for it. */
const DISQUALIFY_RE = /\b(how (do|can|would)|what (is|does)|why|explain|docs?|documentation|tutorial|don'?t|do not|never|without)\b/i;
/** Build requests that merely mention pausing (e.g. "add a pause button"). */
const BUILD_RE = /\b(add|build|create|implement|make|design)\b[^.?!]{0,30}\b(button|page|feature|component|screen|ui)\b/i;

export function detectCloudIntent(prompt: string): CloudIntent | null {
  const p = prompt.trim();
  if (p.length === 0 || p.length > 200) return null;
  if (DISQUALIFY_RE.test(p) || BUILD_RE.test(p)) return null;

  if (RESIZE_RE.test(p) || SLOW_DB_RE.test(p)) return { kind: "resize" };
  if (RESUME_RE.test(p)) return { kind: "resume" };
  if (PAUSE_RE.test(p)) return { kind: "pause" };
  return null;
}

export const CLOUD_INSTANCE_TIERS = ["tiny", "mini", "small", "medium", "large"] as const;
export type CloudInstanceTier = (typeof CLOUD_INSTANCE_TIERS)[number];
