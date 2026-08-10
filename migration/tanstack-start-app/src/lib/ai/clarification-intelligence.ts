/** Requests whose wording hides materially different product capabilities. */
const CAPABILITY_AMBIGUITY =
  /\b(connectors?|integrations?|connect(?:ing)? (?:accounts?|services?|apps?)|real data|custom domains?|publishable|published app backend|AI (?:models?|providers?))\b/i;

export function shouldClarifyCapabilities(prompt: string, forceBuild = false): boolean {
  return !forceBuild && CAPABILITY_AMBIGUITY.test(prompt);
}
