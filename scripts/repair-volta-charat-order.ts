/**
 * Fix titleCase helper placement (must be after imports) for Volta project.
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

const HELPER = `function titleCase(value: unknown): string {
  const s = String(value ?? "").trim() || "Item";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
`;

function fixFile(content: string): string {
  // Strip any leading titleCase helpers / blank lines before imports
  let next = content.replace(
    /^(?:function titleCase\([\s\S]*?\n\}\s*\n)+/,
    "",
  );

  if (!/function titleCase\(/.test(next)) {
    const m = next.match(/^(?:import[\s\S]*?;\s*\n)+/);
    if (m) {
      next = m[0] + "\n" + HELPER + "\n" + next.slice(m[0].length);
    } else {
      next = HELPER + "\n" + next;
    }
  }

  // Ensure JSX uses titleCase
  next = next.replace(
    /\{\s*([A-Za-z_$][\w$]*)\.charAt\(0\)\.toUpperCase\(\)\s*\+\s*\1\.slice\(1\)\s*\}/g,
    "{titleCase($1)}",
  );
  next = next.replace(
    /\{\s*\(([^)]+)\)\.charAt\(0\)\.toUpperCase\(\)\s*\+\s*\(([^)]+)\)\.slice\(1\)\s*\}/g,
    "{titleCase($1)}",
  );
  next = next.replace(
    /categoryColors\[service\.category\](?!\s*\?\?)/g,
    "categoryColors[(service.category as keyof typeof categoryColors) ?? 'wellness'] ?? 'gold'",
  );

  return next;
}

async function main() {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const paths = [
    "src/components/home/ServicesPreview.tsx",
    "src/pages/Services.tsx",
  ];
  for (const path of paths) {
    const { data: row, error } = await sb
      .from("project_files")
      .select("id,content")
      .eq("project_id", projectId)
      .eq("path", path)
      .maybeSingle();
    if (error) throw error;
    if (!row) {
      console.log("missing", path);
      continue;
    }
    const next = fixFile(row.content ?? "");
    const { error: upErr } = await sb
      .from("project_files")
      .update({ content: next, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (upErr) throw upErr;
    const startsWithImport = /^\s*import\b/.test(next);
    const hasHelper = /function titleCase\(/.test(next);
    console.log(JSON.stringify({ path, startsWithImport, hasHelper, bytes: next.length }));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
