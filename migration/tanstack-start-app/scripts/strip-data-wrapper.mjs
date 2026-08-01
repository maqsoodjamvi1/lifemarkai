/**
 * Safe rewrite: await fn({ data: EXPR }) → await fn(EXPR)
 * Only under src/routes/api. Preserves `await`. Parses brace-balanced wrappers.
 */
import fs from "node:fs";
import path from "node:path";

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(ent.name)) out.push(p);
  }
  return out;
}

function stripFile(src) {
  const needle = /await\s+([A-Za-z_$][\w$]*)\(\{\s*data:\s*/g;
  let out = "";
  let last = 0;
  let count = 0;
  let m;
  while ((m = needle.exec(src)) !== null) {
    const fnName = m[1];
    const exprStart = m.index + m[0].length;
    // Wrapper `{` is the `{` just before `data:` inside the match
    const openBrace = m[0].lastIndexOf("{");
    const wrapperStart = m.index + openBrace; // absolute index of wrapper `{`

    // Scan from wrapperStart to find matching `}`
    let depth = 0;
    let inStr = null;
    let escape = false;
    let k = wrapperStart;
    let end = -1;
    while (k < src.length) {
      const c = src[k];
      if (inStr) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === inStr) inStr = null;
        k++;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        inStr = c;
        k++;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          end = k;
          break;
        }
      }
      k++;
    }
    if (end < 0) {
      throw new Error(`unbalanced wrapper near ${fnName}`);
    }
    // Skip whitespace after `}`, expect `)`
    let p = end + 1;
    while (p < src.length && /\s/.test(src[p])) p++;
    if (src[p] !== ")") {
      throw new Error(`expected ) after wrapper for ${fnName}, got ${JSON.stringify(src[p])}`);
    }

    const expr = src.slice(exprStart, end).trim();
    out += src.slice(last, m.index);
    out += `await ${fnName}(${expr})`;
    last = p + 1;
    count++;
    needle.lastIndex = last;
  }
  out += src.slice(last);
  return { out, count };
}

const root = path.resolve("src/routes/api");
let files = 0;
let total = 0;
for (const file of walk(root)) {
  const src = fs.readFileSync(file, "utf8");
  if (!/\(\{\s*data:/.test(src)) continue;
  try {
    const { out, count } = stripFile(src);
    if (count === 0) continue;
    if (out === src) continue;
    fs.writeFileSync(file, out);
    files++;
    total += count;
    console.log(`${path.relative(process.cwd(), file)}: ${count}`);
  } catch (e) {
    console.error(`FAIL ${file}: ${e.message}`);
  }
}
console.log(`done files=${files} replacements=${total}`);
