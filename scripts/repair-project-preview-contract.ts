/**
 * Persist preview-contract heals into project_files for a broken project.
 * Usage: npx tsx scripts/repair-project-preview-contract.ts <projectId>
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { healPreviewContractGaps } from "../lib/preview/heal-preview-contract";
import { findContractErrors } from "../lib/preview/export-contract";
import type { ProjectFile } from "../types/database";

const projectId = process.argv[2];
if (!projectId) {
  console.error("Usage: npx tsx scripts/repair-project-preview-contract.ts <projectId>");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

async function main() {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error } = await sb
    .from("project_files")
    .select("id,project_id,path,content,created_at,updated_at")
    .eq("project_id", projectId);
  if (error) throw error;

  const files = (rows ?? []) as ProjectFile[];
  const before = findContractErrors(files.map((f) => ({ path: f.path, content: f.content ?? "" })));
  console.log("before", before.length);
  before.forEach((m) => console.log(" -", m.slice(0, 140)));

  const healed = healPreviewContractGaps(files);
  const byOld = new Map(files.map((f) => [f.path, f]));
  let updated = 0;
  let inserted = 0;

  for (const f of healed) {
    const prev = byOld.get(f.path);
    if (!prev) {
      const { error: insErr } = await sb.from("project_files").insert({
        project_id: projectId,
        path: f.path,
        content: f.content,
      });
      if (insErr) throw insErr;
      inserted++;
      continue;
    }
    if ((prev.content ?? "") === (f.content ?? "")) continue;
    const { error: upErr } = await sb
      .from("project_files")
      .update({ content: f.content, updated_at: new Date().toISOString() })
      .eq("id", prev.id);
    if (upErr) throw upErr;
    updated++;
  }

  const after = findContractErrors(healed.map((f) => ({ path: f.path, content: f.content ?? "" })));
  console.log(JSON.stringify({ updated, inserted, after: after.length }, null, 2));
  after.forEach((m) => console.log(" -", m.slice(0, 140)));
  if (after.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
