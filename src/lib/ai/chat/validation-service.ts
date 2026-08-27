import {
  assessGenerationQuality,
  validateGeneratedFiles,
  type ParsedFile,
  type ValidationError,
} from "../code-parser.ts";
import { ensureCommonGeneratedSupportFiles } from "../generated-support-files.ts";
import { ensureWebsiteChrome } from "../website-chrome.ts";
import { alignGeneratedPackageJson, stripGeneratedRouteTree } from "../../preview/align-package-json.ts";
import { normalizeProjectImports } from "../../preview/normalize-imports.ts";
import { syncProjectDependencies } from "../../verify/dependency-gate.ts";
import { lockControlledDependencyVersions, resolveControlledTemplateForPrompt } from "../../templates/controlled-registry.ts";
import { tanstackStartScaffold } from "../../templates/tanstack-start-scaffold.ts";

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
  /** Allowed packages imported by the generation but absent from package.json,
   * written in at their allowlist-pinned versions. */
  addedDependencies: string[];
};

function alignTanStackRuntimeImports(files: ParsedFile[]): ParsedFile[] {
  return files.map((file) => {
    let content = file.content;
    if (/^vite\.config\.(?:ts|js|mts|mjs)$/.test(file.path)) {
      content = content.replace(
        /import\s+([A-Za-z_$][\w$]*)\s+from\s+(["'])@tanstack\/react-start\/plugin\/vite\2[ \t]*;?/,
        'import { tanstackStart as $1 } from "@tanstack/react-start/plugin/vite";',
      );
    }
    content = content.replace(
      /import\s*\{([^}]*)\}\s*from\s*(["'])@tanstack\/react-start\2[ \t]*;?/g,
      (statement, imports: string, quote: string) => {
        const names = imports.split(",").map((name) => name.trim()).filter(Boolean);
        const documentNames = new Set(["HeadContent", "Scripts", "Meta", "Links"]);
        if (!names.some((name) => documentNames.has(name))) return statement;
        const retained = names.filter((name) => !documentNames.has(name));
        const routerNames: string[] = [];
        if (names.includes("Meta") || names.includes("Links")) {
          routerNames.push("HeadContent as RouterHeadContent");
        } else if (names.includes("HeadContent")) {
          routerNames.push("HeadContent");
        }
        if (names.includes("Scripts")) routerNames.push("Scripts");
        const startImport = retained.length > 0
          ? `import { ${retained.join(", ")} } from ${quote}@tanstack/react-start${quote};\n`
          : "";
        return `${startImport}import { ${routerNames.join(", ")} } from ${quote}@tanstack/react-router${quote};`;
      },
    );
    content = content.replace(
      /import\s*\{([^}]*)\}\s*from\s*(["'])@tanstack\/react-router\2[ \t]*;?/g,
      (statement, imports: string, quote: string) => {
        const names = imports.split(",").map((name) => name.trim()).filter(Boolean);
        if (!names.includes("Meta") && !names.includes("Links")) return statement;
        const current = names.filter((name) => !["Meta", "Links"].includes(name));
        if (!current.includes("HeadContent as RouterHeadContent")) current.push("HeadContent as RouterHeadContent");
        return `import { ${current.join(", ")} } from ${quote}@tanstack/react-router${quote};`;
      },
    );
    content = content.replace(/<Meta\s*\/>\s*<Links\s*\/>/g, "<RouterHeadContent />");
    content = content.replace(/<Links\s*\/>\s*<Meta\s*\/>/g, "<RouterHeadContent />");
    content = content.replace(/<Meta\s*\/>/g, "<RouterHeadContent />");
    content = content.replace(/<Links\s*\/>/g, "<RouterHeadContent />");
    if (/^src\/routes\/__root\.(?:tsx|jsx)$/.test(file.path)) {
      content = content.replace(
        /import\s*\{([^}]*)\}\s*from\s*(["'])@tanstack\/react-start\2[ \t]*;?/,
        (statement, imports: string) => {
          const names = imports.split(",").map((name) => name.trim()).filter(Boolean);
          if (!names.includes("Meta") && !names.includes("Links")) return statement;
          const retained = names.filter((name) => !["Meta", "Links", "Scripts"].includes(name));
          const startImport = retained.length > 0
            ? `import { ${retained.join(", ")} } from "@tanstack/react-start";\n`
            : "";
          return `${startImport}import { HeadContent as RouterHeadContent, Scripts } from "@tanstack/react-router";`;
        },
      );
      content = content.replace(/<Meta\s*\/>\s*<Links\s*\/>/g, "<HeadContent />");
      content = content.replace(/<Links\s*\/>\s*<Meta\s*\/>/g, "<HeadContent />");
    }
    if (/^src\/router\.(?:ts|tsx|js|jsx)$/.test(file.path) && !/\bexport\s+function\s+getRouter\b/.test(content)) {
      const routerBinding = content.match(/\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*createRouter\s*\(/)?.[1];
      if (routerBinding) {
        content = `${content.trimEnd()}\n\nexport function getRouter() {\n  return ${routerBinding};\n}\n`;
      }
    }
    return content === file.content ? file : { ...file, content };
  });
}

const CONTROLLED_TANSTACK_INFRASTRUCTURE =
  /^(?:vite\.config\.(?:ts|js|mts|mjs)|tailwind\.config\.(?:ts|js|mts|mjs|cjs)|postcss\.config\.(?:ts|js|mts|mjs|cjs)|tsconfig\.json|src\/router\.(?:ts|tsx|js|jsx)|src\/styles\.css)$/;

function applyControlledTanStackInfrastructure(files: ParsedFile[], brand?: string): ParsedFile[] {
  const canonical = tanstackStartScaffold({}, brand).filter((file) =>
    CONTROLLED_TANSTACK_INFRASTRUCTURE.test(file.path),
  );
  return [
    ...files.filter((file) => !CONTROLLED_TANSTACK_INFRASTRUCTURE.test(file.path)),
    ...canonical,
  ];
}

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

    const template = resolveControlledTemplateForPrompt(options.prompt, options.framework);
    const locked = lockControlledDependencyVersions(normalized[packageIndex].content, template);
    normalized[packageIndex] = { ...normalized[packageIndex], content: locked.content };
    const lockedPackage = JSON.parse(locked.content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    if (
      lockedPackage.dependencies?.["@tanstack/react-start"] ||
      lockedPackage.devDependencies?.["@tanstack/react-start"]
    ) {
      normalized = applyControlledTanStackInfrastructure(normalized, options.brand);
      normalized = alignTanStackRuntimeImports(normalized);
    }
    controlledDependencies.push(...locked.changed);
    controlledTemplate = template.key;
  }

  // ── Files must not be missing at creation ─────────────────────────────────
  // Both fixers below used to run only on later paths (sandbox sync, repair),
  // so a build could leave generation already broken and pay to rediscover it.
  //
  // Import repointing: a specifier aimed at the wrong directory is corrected
  // against the ACTUAL file set the generation is shipping, before validation
  // ever sees it.
  normalized = normalizeProjectImports(normalized);

  // Library contract: every ALLOWED npm package the code imports is written
  // into package.json at its allowlist-pinned version — the same pins the
  // preview image installs, so the sandbox cannot hit TS2307 on a legitimate
  // library. Refused packages are deliberately NOT added (their fix is a code
  // rewrite; findDependencyIssues reports them precisely on the verify path).
  const addedDependencies: string[] = [];
  if (packageIndex >= 0) {
    const synced = syncProjectDependencies(normalized);
    normalized = synced.files;
    addedDependencies.push(...synced.added);
  }

  return { files: normalized, alignedDependencies, controlledDependencies, controlledTemplate, addedDependencies };
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
