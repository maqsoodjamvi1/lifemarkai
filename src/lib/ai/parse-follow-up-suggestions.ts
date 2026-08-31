/**
 * Parses the raw text response from the follow-up-suggestions AI call
 * (routes/api/ai/follow-up-suggestions.ts) into a clean chip list.
 *
 * Pulled out as a pure function so the part of that route with real failure
 * modes — a model that ignores "one per line", wraps items in quotes/dashes/
 * numbering, or pads with commentary — has direct unit test coverage instead
 * of only being exercised through a live model call.
 */
export function parseFollowUpSuggestions(raw: string, max = 3): string[] {
  const lines = raw
    .split("\n")
    .map((line) =>
      line
        .trim()
        // Strip common list markers: "- ", "* ", "1. ", "1) "
        .replace(/^[-*•]\s+/, "")
        .replace(/^\d+[.)]\s+/, "")
        // Strip wrapping quotes the model sometimes adds.
        .replace(/^["'](.*)["']$/, "$1")
        .trim(),
    )
    .filter((line) => line.length > 0 && line.length <= 80)
    // Drop anything that reads like preamble/commentary rather than a chip.
    .filter((line) => !/^(here are|sure|suggestions?:?|follow-?up)/i.test(line));

  return [...new Set(lines)].slice(0, max);
}
