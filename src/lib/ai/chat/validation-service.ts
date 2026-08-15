import {
  assessGenerationQuality,
  validateGeneratedFiles,
  type ParsedFile,
  type ValidationError,
} from "../code-parser.ts";
import { ensureCommonGeneratedSupportFiles } from "../generated-support-files.ts";
import { ensureWebsiteChrome } from "../website-chrome.ts";
import { alignGeneratedPackageJson, stripGeneratedRouteTree } from "../../preview/align-package-json.ts";
import { lockControlledDependencyVersions, resolveControlledTemplate } from "../../templates/controlled-registry.ts";

export type GenerationValidationOptions = {
  minFiles?: number;
  appType?: string;
  singlePage?: boolean;
};

export type GenerationValidationResult = {
  correctnessErrors: ValidationError[];
  richnessErrors: ValidationError[];
  validationErrors: ValidationError[];
  needsEnrichment: boolean;
};

export type GenerationNormalizationOptions = {
  prompt: string;
  framework: string;
  appType?: string;
  brand?: string;
};

export type GenerationNormalizationResult = {
  files: ParsedFile[];
  alignedDependencies: string[];
  controlledDependencies: string[];
  controlledTemplate: string | null;
};

export function prepareGeneratedFiles(
  files: ParsedFile[],
  existingFiles: ParsedFile[],
): ParsedFile[] {
  return ensureCommonGeneratedSupportFiles(files, existingFiles);
}

/**
 * Apply platform-owned build guarantees before validation. Model repair should
 * only receive product/code defects; package pins, generated route trees, site
 * chrome, support modules, and safe file extensions are deterministic here.
 */
export function normalizeGenerationStage(
  files: ParsedFile[],
  existingFiles: ParsedFile[],
  options: GenerationNormalizationOptions,
): GenerationNormalizationResult {
  let normalized = prepareGeneratedFiles(files, existingFiles);
  normalized = stripGeneratedRouteTree(normalized);
  normalized = ensureWebsiteChrome(normalized, existingFiles, {
    appType: options.appType,
    brand: options.brand,
  });
  normalized = prepareGeneratedFiles(normalized, existingFiles);

  const alignedDependencies: string[] = [];
  const controlledDependencies: string[] = [];
  let controlledTemplate: string | null = null;
  const packageIndex = normalized.findIndex((file) => file.path === "package.json");
  if (packageIndex >= 0) {
    const aligned = alignGeneratedPackageJson(normalized[packageIndex].content);
    normalized[packageIndex] = { ...normalized[packageIndex], content: aligned.content };
    alignedDependencies.push(...aligned.changed);

    const template = resolveControlledTemplate(options.prompt, options.framework);
    const locked = lockControlledDependencyVersions(normalized[packageIndex].content, template);
    normalized[packageIndex] = { ...normalized[packageIndex], content: locked.content };
    controlledDependencies.push(...locked.changed);
    controlledTemplate = template.key;
  }

  return { files: normalized, alignedDependencies, controlledDependencies, controlledTemplate };
}

/** Validate correctness and product completeness as one deterministic stage. */
export function validateGenerationStage(
  files: ParsedFile[],
  existingFiles: ParsedFile[],
  options: GenerationValidationOptions = {},
): GenerationValidationResult {
  const correctnessErrors = validateGeneratedFiles(files, existingFiles);
  const richnessErrors = assessGenerationQuality(files, existingFiles, options);
  return {
    correctnessErrors,
    richnessErrors,
    validationErrors: [...correctnessErrors, ...richnessErrors],
    needsEnrichment: richnessErrors.length > 0,
  };
}

/** Stable signature for detecting a repair loop that is no longer converging. */
export function generationValidationSignature(errors: ValidationError[]): string {
  return errors
    .filter((error) => error.severity === "error")
    .map((error) => `${error.type}:${error.file ?? ""}`)
    .sort()
    .join("|");
}
