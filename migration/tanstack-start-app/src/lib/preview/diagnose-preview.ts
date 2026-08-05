import {
  diagnoseBrokenImports,
  type DiagnosableFile,
} from "./diagnose-imports.ts";
import {
  diagnoseRuntimeErrors,
} from "./diagnose-runtime.ts";
import type { PreviewRuntimeError } from "./preview-error-bridge.ts";

export function buildPreviewDiagnosis(
  files: DiagnosableFile[],
  errors: PreviewRuntimeError[] = [],
): string | null {
  const sections: string[] = [];

  const runtime = diagnoseRuntimeErrors(errors, files);
  if (runtime.length > 0) {
    sections.push(["Runtime stack", ...runtime.map((issue) => `- ${issue}`)].join("\n"));
  }

  const imports = diagnoseBrokenImports(files);
  if (imports.length > 0) {
    sections.push(["Imports / exports", ...imports.map((issue) => `- ${issue}`)].join("\n"));
  }

  return sections.length > 0 ? sections.join("\n\n") : null;
}

export function appendPreviewDiagnosis(
  prompt: string,
  files: DiagnosableFile[],
  errors: PreviewRuntimeError[] = [],
): string {
  if (/Runtime diagnosis|Import diagnosis|Preview diagnosis|Runtime stack|Imports \/ exports/.test(prompt)) {
    return prompt;
  }
  const diagnosis = buildPreviewDiagnosis(files, errors);
  if (!diagnosis) return prompt;
  return [prompt, "", "Preview diagnosis (fix these first):", diagnosis].join("\n");
}
