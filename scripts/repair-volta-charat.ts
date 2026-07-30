/**
 * Force-safe every `.charAt` call site in the Lumière/Volta project and
 * ensure mock services carry category fields. Fixes:
 *   Cannot read properties of undefined (reading 'charAt')
 *
 * Usage: npx tsx scripts/repair-volta-charat.ts [projectId]
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const projectId = process.argv[2] ?? "df9dd882-ec56-450f-b9ce-dbddd227af31";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const SAFE_HELPER = `function titleCase(value: unknown): string {
  const s = String(value ?? "").trim() || "Item";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
`;

function ensureHelper(content: string): string {
  if (/function titleCase\(/.test(content)) return content;
  // Insert after imports block
  const m = content.match(/^(?:import[\s\S]*?;\s*\n)+/);
  if (m) return content.slice(0, m[0].length) + "\n" + SAFE_HELPER + "\n" + content.slice(m[0].length);
  return SAFE_HELPER + "\n" + content;
}

function rewriteCharAtSites(content: string): string {
  let next = ensureHelper(content);

  // cat.charAt(0).toUpperCase() + cat.slice(1)
  next = next.replace(
    /\{\s*([A-Za-z_$][\w$]*)\.charAt\(0\)\.toUpperCase\(\)\s*\+\s*\1\.slice\(1\)\s*\}/g,
    "{titleCase($1)}",
  );

  // (service.category ?? 'wellness').charAt(0)... + (...).slice(1)
  next = next.replace(
    /\{\s*\(([^)]+)\)\.charAt\(0\)\.toUpperCase\(\)\s*\+\s*\(([^)]+)\)\.slice\(1\)\s*\}/g,
    "{titleCase($1)}",
  );

  // service.category.charAt(0).toUpperCase() + service.category.slice(1)
  next = next.replace(
    /\{\s*([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*)\.charAt\(0\)\.toUpperCase\(\)\s*\+\s*\1\.slice\(1\)\s*\}/g,
    "{titleCase($1)}",
  );

  // categoryColors[service.category] without fallback
  next = next.replace(
    /categoryColors\[service\.category\]/g,
    "categoryColors[(service.category as keyof typeof categoryColors) ?? 'wellness'] ?? 'gold'",
  );

  return next;
}

async function main() {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error } = await sb
    .from("project_files")
    .select("id,path,content")
    .eq("project_id", projectId);
  if (error) throw error;

  let updated = 0;
  for (const row of rows ?? []) {
    const content = row.content ?? "";
    if (!content.includes(".charAt(") && !content.includes("categoryColors[service.category]")) {
      continue;
    }
    // Skip non-app files
    if (!/\.(tsx|ts|jsx|js)$/.test(row.path)) continue;
    if (row.path.includes("node_modules")) continue;

    const next = rewriteCharAtSites(content);
    if (next === content) {
      console.log("no-op", row.path);
      continue;
    }
    const { error: upErr } = await sb
      .from("project_files")
      .update({ content: next, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (upErr) throw upErr;
    updated++;
    console.log("updated", row.path);
    // Show remaining charAt lines
    next.split("\n").forEach((line, i) => {
      if (line.includes(".charAt(")) console.log("  still:", i + 1, line.trim().slice(0, 100));
    });
  }
  console.log(JSON.stringify({ updated, files: (rows ?? []).length }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
