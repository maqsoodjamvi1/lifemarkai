import { readFileSync, appendFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const { buildDeployIndexHtml } = await import("../lib/deploy/build-deploy-files.ts");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: files } = await sb
  .from("project_files")
  .select("path, content")
  .eq("project_id", "fb18d6f5-400f-4b7c-ba75-737ca94ddcf9");

const html = buildDeployIndexHtml(files ?? [], {
  projectId: "fb18d6f5-400f-4b7c-ba75-737ca94ddcf9",
  projectName: "Cargo",
});

const payload = {
  sessionId: "ed67f3",
  timestamp: Date.now(),
  location: "scripts/verify-deploy-build.mjs",
  message: "deploy build stats",
  data: {
    sourceFiles: files?.length ?? 0,
    deployHtmlLen: html.length,
    hasMatchRoute: html.includes("function matchRoute"),
    hasModules: html.includes("lifemark-module"),
    oldSingleAppOnly:
      html.includes("React.createElement(App)") && !html.includes("lifemark-module"),
  },
  hypothesisId: "H1",
  runId: "post-fix",
};

appendFileSync("debug-ed67f3.log", `${JSON.stringify(payload)}\n`);
console.log(JSON.stringify(payload.data));
