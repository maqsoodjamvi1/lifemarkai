import fs from "node:fs";
import path from "node:path";

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

for (const f of walk("src/routes/api")) {
  const s = fs.readFileSync(f, "utf8");
  const n = s.replace(/\},\)/g, "})");
  if (n !== s) {
    fs.writeFileSync(f, n);
    console.log("comma", f);
  }
}

for (const f of walk("src/lib/server-fns")) {
  const s = fs.readFileSync(f, "utf8");
  const n = s.replace(
    /export async function (\w+)\(data\)/g,
    "export async function $1(data: any)",
  );
  if (n !== s) {
    fs.writeFileSync(f, n);
    console.log("typed", path.basename(f));
  }
}
