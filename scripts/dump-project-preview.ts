/**
 * Dump project files from Supabase and build fallback preview HTML.
 * Usage: npx tsx scripts/dump-project-preview.ts <projectId>
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { buildFallbackHtml, PREVIEW_ENGINE_REV } from "../lib/preview/build-fallback-html";
import type { ProjectFile } from "../types/database";

const projectId = process.argv[2];
if (!projectId) {
  console.error("Usage: npx tsx scripts/dump-project-preview.ts <projectId>");
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
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(60_000) }) },
  });

  console.log("fetching project…");
  const { data: project, error: pe } = await sb
    .from("projects")
    .select("id,name,framework")
    .eq("id", projectId)
    .maybeSingle();
  console.log("project", JSON.stringify(project), pe?.message ?? "");

  console.log("fetching files…");
  const { data: files, error: fe } = await sb
    .from("project_files")
    .select("id,project_id,path,content,created_at,updated_at")
    .eq("project_id", projectId);
  console.log("fileErr", fe?.message ?? "ok");
  console.log("fileCount", files?.length ?? 0);

  const list = (files ?? []) as ProjectFile[];
  const paths = list.map((f) => f.path).sort();
  console.log("paths:\n" + paths.join("\n"));

  mkdirSync(`outputs/${projectId}`, { recursive: true });
  writeFileSync(
    `outputs/${projectId}-files.json`,
    JSON.stringify(
      list.map((f) => ({ path: f.path, bytes: (f.content ?? "").length })),
      null,
      2,
    ),
  );
  for (const f of list) {
    const safe = f.path.replace(/[\\/]/g, "__");
    writeFileSync(`outputs/${projectId}/${safe}`, f.content ?? "");
  }

  const html = buildFallbackHtml(list);
  writeFileSync(`outputs/${projectId}-preview.html`, html);
  console.log("rev", PREVIEW_ENGINE_REV, "htmlLen", html.length);

  const mock = list.find((f) => /\/data\/mock\.(t|j)sx?$/.test(f.path.replace(/\\/g, "/")));
  const partners = list.filter((f) => /Partners/i.test(f.path) || (f.content ?? "").includes("MOCK_PARTNERS"));
  console.log(
    JSON.stringify(
      {
        hasMockFile: !!mock,
        mockHasPartnersExport: mock ? /MOCK_PARTNERS/.test(mock.content ?? "") : false,
        partnersFiles: partners.map((f) => f.path),
        htmlHasCreateRoot: /createRoot|ReactDOM/.test(html),
        htmlHasModules: html.includes("__Mdefine"),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
