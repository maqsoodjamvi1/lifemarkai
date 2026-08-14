import {
  assessGenerationQuality,
  validateGeneratedFiles,
  type ParsedFile,
  type ValidationError,
} from "../code-parser.ts";
import { ensureCommonGeneratedSupportFiles } from "../generated-support-files.ts";

export type GenerationValidationOptions = {
  minFiles?: number;
  appType?: string;
};

export type GenerationValidationResult = {
  correctnessErrors: ValidationError[];
  richnessErrors: ValidationError[];
  validationErrors: ValidationError[];
  needsEnrichment: boolean;
};

export function prepareGeneratedFiles(
  files: ParsedFile[],
  existingFiles: ParsedFile[],
): ParsedFile[] {
  return ensureCommonGeneratedSupportFiles(files, existingFiles);
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
