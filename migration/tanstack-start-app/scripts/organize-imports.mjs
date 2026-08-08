import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const appRoot = path.resolve(import.meta.dirname, "..");
const configPath = path.join(appRoot, "tsconfig.json");
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

if (configFile.error) {
  throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
}

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, appRoot);
const versions = new Map(parsed.fileNames.map((fileName) => [fileName, "0"]));
const host = {
  getCompilationSettings: () => parsed.options,
  getScriptFileNames: () => parsed.fileNames,
  getScriptVersion: (fileName) => versions.get(fileName) ?? "0",
  getScriptSnapshot: (fileName) => {
    if (!fs.existsSync(fileName)) return undefined;
    return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, "utf8"));
  },
  getCurrentDirectory: () => appRoot,
  getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
};

const service = ts.createLanguageService(host, ts.createDocumentRegistry());
let changedFiles = 0;

for (const fileName of parsed.fileNames) {
  const relativePath = path.relative(appRoot, fileName);
  if (!relativePath.startsWith(`src${path.sep}`)) continue;
  const changes = service.organizeImports(
    { type: "file", fileName, mode: ts.OrganizeImportsMode.RemoveUnused },
    {},
    {},
  );
  if (changes.length === 0) continue;

  let source = fs.readFileSync(fileName, "utf8");
  for (const change of changes.flatMap((item) => item.textChanges).sort((a, b) => b.span.start - a.span.start)) {
    source = source.slice(0, change.span.start) + change.newText + source.slice(change.span.start + change.span.length);
  }
  fs.writeFileSync(fileName, source);
  changedFiles += 1;
}

console.log(`[organize-imports] updated ${changedFiles} files`);
