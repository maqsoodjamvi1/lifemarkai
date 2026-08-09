/**
 * Re-apply the preview import-repair change on top of whatever the branch is
 * now, instead of restoring files captured against an older commit.
 *
 * Runs AFTER the fast-forward. Every step asserts its anchor first and aborts
 * the whole script on a mismatch, so a surprise upstream edit stops the commit
 * rather than being silently reverted.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const PV = join(REPO, "migration", "tanstack-start-app", "src", "lib", "preview");

let failed = false;
const ok = (m) => console.log(`  ok   ${m}`);
const die = (m) => {
  console.error(`  FAIL ${m}`);
  failed = true;
};

function read(p) {
  return readFileSync(p, "utf8");
}

/* 1 — the two brand-new files: straight copies, nothing upstream to preserve. */
console.log("[1/4] new files");
for (const name of ["normalize-imports.ts", "normalize-imports.test.ts"]) {
  const src = join(HERE, name);
  if (!existsSync(src)) die(`staged file missing: ${src}`);
  else {
    copyFileSync(src, join(PV, name));
    ok(name);
  }
}

/* 2 — push-to-sandbox.ts is a full-file replacement, so refuse to write it
   unless the file on disk is byte-identical to the version this rewrite was
   based on. If upstream touched it, a human has to merge. */
console.log("[2/4] push-to-sandbox.ts");
{
  const target = join(PV, "push-to-sandbox.ts");
  const expected = read(join(HERE, "push-to-sandbox.expected.ts"));
  const current = read(target);
  if (current.replace(/\r\n/g, "\n") !== expected.replace(/\r\n/g, "\n")) {
    die(
      "push-to-sandbox.ts differs from the version this change was written against.\n" +
        "       Upstream edited it — do NOT overwrite. Re-run Claude on the current file.",
    );
  } else {
    copyFileSync(join(HERE, "push-to-sandbox.new.ts"), target);
    ok("replaced (base matched)");
  }
}

/* 3 — patch-sandbox-preview-files.ts: two surgical edits, anchored. */
console.log("[3/4] patch-sandbox-preview-files.ts");
{
  const target = join(PV, "patch-sandbox-preview-files.ts");
  let src = read(target);
  const importAnchor =
    'import { LOVABLE_VITE_DEV_DEPENDENCIES } from "../templates/lovable-vite-scaffold.ts";';
  const callAnchor = "ensureViteEntryFiles(files)";
  const newImport = 'import { normalizeProjectImports } from "./normalize-imports.ts";';

  if (src.includes("normalize-imports")) {
    die("already wired — refusing to double-apply");
  } else if (!src.includes(importAnchor)) {
    die(`import anchor not found: ${importAnchor}`);
  } else if (src.split(callAnchor).length !== 2) {
    die(`expected exactly one "${callAnchor}", found ${src.split(callAnchor).length - 1}`);
  } else {
    src = src.replace(importAnchor, `${importAnchor}\n${newImport}`);
    src = src.replace(callAnchor, "ensureViteEntryFiles(normalizeProjectImports(files))");
    writeFileSync(target, src);
    ok("import + composition wired");
  }
}

/* 4 — register the test in the root package.json runner. */
console.log("[4/4] package.json");
{
  const target = join(REPO, "package.json");
  const src = read(target);
  const anchor = "migration/tanstack-start-app/src/lib/preview/diagnose-preview.test.ts";
  const added = "migration/tanstack-start-app/src/lib/preview/normalize-imports.test.ts";
  if (src.includes(added)) {
    die("test already registered — refusing to double-apply");
  } else if (src.split(anchor).length !== 2) {
    die(`expected exactly one "${anchor}"`);
  } else {
    writeFileSync(target, src.replace(anchor, `${anchor} ${added}`));
    ok("test registered");
  }
}

if (failed) {
  console.error("\nAPPLY FAILED — nothing will be committed.");
  process.exit(1);
}
console.log("\nAPPLY OK");
