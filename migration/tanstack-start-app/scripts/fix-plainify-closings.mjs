/**
 * After plainify-server-fns.mjs, many `export async function` bodies still end
 * with `});` (leftover from createServerFn().handler(...)). Rewrite those to `}`.
 *
 * Heuristic: a 2-space-indented `});` immediately before another top-level
 * declaration (export/const/interface/type/function) or EOF is a function close.
 * Column-0 `});` (zod schemas) and deeper-indented `});` (nested calls) are kept.
 */
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("src/lib/server-fns");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts"));

let total = 0;
for (const file of files) {
  const p = path.join(dir, file);
  const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
  let changed = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== "  });") continue;

    // Find next non-empty line
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;
    const next = j < lines.length ? lines[j] : null;
    const nextIsTopLevel =
      next === null ||
      /^(export |const |let |var |interface |type |function |async function |class |\/\*\*|\/\/)/.test(
        next,
      );

    if (!nextIsTopLevel) continue;

    // Previous non-empty should look like end of a return / statement inside a fn
    let k = i - 1;
    while (k >= 0 && lines[k].trim() === "") k--;
    const prev = k >= 0 ? lines[k].trim() : "";
    if (!prev) continue;

    lines[i] = "}";
    changed++;
  }

  if (changed > 0) {
    fs.writeFileSync(p, lines.join("\n"));
    console.log(`${file}: fixed ${changed}`);
    total += changed;
  }
}
console.log(`done, ${total} closings fixed`);
