import { buildGenerationPrompt } from "../system-prompts.ts";

export function buildReactGenerationPrompt(
  request: string,
  files: Array<{ path: string; content: string }>,
  contextMaxChars?: number,
  framework = "react",
): string {
  return buildGenerationPrompt(request, files, contextMaxChars, framework);
}
