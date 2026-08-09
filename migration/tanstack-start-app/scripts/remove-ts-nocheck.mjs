import fs from "node:fs";
import path from "node:path";

const srcRoot = path.resolve(import.meta.dirname, "../src");
const extensions = new Set([".ts", ".tsx"]);
let changedFiles = 0;

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      visit(absolutePath);
      continue;
    }
    if (!extensions.has(path.extname(entry.name))) continue;

    const source = fs.readFileSync(absolutePath, "utf8");
    const cleaned = source.replace(/^\s*(?:\/\/|\/\*)\s*@ts-nocheck[^\r\n]*(?:\*\/)?\s*\r?\n/, "");
    if (cleaned === source) continue;
    fs.writeFileSync(absolutePath, cleaned);
    changedFiles += 1;
  }
}

visit(srcRoot);
console.log(`[remove-ts-nocheck] updated ${changedFiles} files`);
