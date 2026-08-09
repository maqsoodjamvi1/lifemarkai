import { buildGenerationPrompt } from "../system-prompts.ts";

export function buildTanStackGenerationPrompt(
  request: string,
  files: Array<{ path: string; content: string }>,
  contextMaxChars?: number,
): string {
  return buildGenerationPrompt(request, files, contextMaxChars, "tanstack-start");
}
