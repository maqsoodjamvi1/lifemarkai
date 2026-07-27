// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { Octokit } from "@octokit/rest";
import JSZip from "jszip";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { detectLanguage } from "@/lib/ai/code-parser";
import { adaptLovableProject, type ImportFile } from "@/lib/import/lovable-adapter";
import {
  cancelCreditReservation,
  reserveCredits,
  settleCreditReservation,
  type CreditReservation,
} from "@/lib/credits";


/**
 * POST /api/projects/import-lovable — import a project built on Lovable.dev.
 *
 * Two sources (Lovable's two export paths):
 *  - JSON body { repoUrl, branch? }        → the repo Lovable two-way-syncs to
 *  - multipart form-data field "zip"       → Lovable's "Download codebase" ZIP
 *
 * Files are filtered like /api/github/import, then run through the Lovable
 * adapter (strips lovable-tagger / gptengineer.js / .lovable internals and
 * returns migration notes for Cloud/AI dependencies). Costs 2 credits.
 */

const MAX_FILE_BYTES = 100 * 1024;
const MAX_FILES = 300;
const MAX_ZIP_BYTES = 25 * 1024 * 1024; // 25 MB upload cap

const ALLOWED_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "css", "scss", "sass", "less",
  "html", "htm", "svg",
  "json", "yaml", "yml", "toml",
  "md", "mdx",
  "env", "env.example", "env.local",
  "sh", "bash", "sql", "graphql", "gql",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build",
  ".turbo", ".vercel", "coverage", "__pycache__",
  ".pytest_cache", "vendor", ".cache",
]);

function isAllowedPath(path: string): boolean {
  const parts = path.split("/");
  if (parts.slice(0, -1).some((p) => SKIP_DIRS.has(p))) return false;
  // Keep .env* and .lovable/* here — the adapter needs to SEE .lovable to
  // detect provenance (it drops those files itself).
  if (parts.some((p) => p.startsWith(".") && !p.startsWith(".env") && p !== ".lovable")) return false;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXTENSIONS.has(ext) || parts[0] === ".lovable";
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  if (/^[\w.-]+\/[\w.-]+$/.test(url.trim())) {
    const [owner, repo] = url.trim().split("/");
    return { owner, repo: repo.replace(/\.git$/, "") };
  }
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/?\s]+)/);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2].replace(/\.git$/, "") };
  const sshMatch = url.match(/github\.com:([^/]+)\/([^/?\s]+)/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2].replace(/\.git$/, "") };
  return null;
}

async function filesFromGitHub(
  token: string | undefined,
  owner: string,
  repo: string,
  branch?: string,
): Promise<{ files: ImportFile[]; branch: string; description: string | null }> {
  const octokit = new Octokit({ auth: token });
  const { data: repoData } = await octokit.repos.get({ owner, repo });
  const targetBranch = branch ?? repoData.default_branch;

  const { data: treeData } = await octokit.git.getTree({
    owner, repo, tree_sha: targetBranch, recursive: "1",
  });

  const allowed = (treeData.tree ?? [])
    .filter((item) => item.type === "blob" && item.path && isAllowedPath(item.path))
    .slice(0, MAX_FILES);

  const files: ImportFile[] = [];
  for (let i = 0; i < allowed.length; i += 10) {
    const batch = allowed.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(async (file) => {
        const { data: blob } = await octokit.git.getBlob({ owner, repo, file_sha: file.sha! });
        const content = Buffer.from(blob.content, "base64").toString("utf-8");
        if (Buffer.byteLength(content) > MAX_FILE_BYTES) return null;
        return { path: file.path!, content, language: detectLanguage(file.path!) };
      }),
    );
    for (const r of results) if (r.status === "fulfilled" && r.value) files.push(r.value);
  }
  return { files, branch: targetBranch, description: repoData.description ?? null };
}

async function filesFromZip(buf: ArrayBuffer): Promise<ImportFile[]> {
  const zip = await JSZip.loadAsync(buf);
  // Lovable ZIPs (and GitHub archive ZIPs) wrap everything in one root folder —
  // detect and strip a single common root.
  const entries = Object.values(zip.files).filter((e) => !e.dir);
  const roots = new Set(entries.map((e) => e.name.split("/")[0]));
  const stripRoot = roots.size === 1 && entries.every((e) => e.name.includes("/"));

  const files: ImportFile[] = [];
  for (const entry of entries) {
    const path = stripRoot ? entry.name.split("/").slice(1).join("/") : entry.name;
    if (!path || !isAllowedPath(path)) continue;
    const content = await entry.async("string");
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) continue;
    files.push({ path, content, language: detectLanguage(path) });
    if (files.length >= MAX_FILES) break;
  }
  return files;
}

async function handlePOST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.api);
  if (!rl.success) return Response.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("github_access_token")
    .eq("id", user.id)
    .single();

  let raw: ImportFile[] = [];
  let sourceLabel = "";
  let githubRepo: string | null = null;
  let githubBranch: string | null = null;
  let repoDescription: string | null = null;
  let creditReservation: CreditReservation | null = null;
  let reservationFinalized = false;
  let durableImportStarted = false;

  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      // ── ZIP upload path ────────────────────────────────────────────────────
      const form = await req.formData();
      const zipFile = form.get("zip");
      if (!(zipFile instanceof Blob)) {
        return Response.json({ error: "Attach the Lovable ZIP as form field \"zip\"" }, { status: 400 });
      }
      if (zipFile.size > MAX_ZIP_BYTES) {
        return Response.json({ error: "ZIP too large (max 25 MB)" }, { status: 413 });
      }
      raw = await filesFromZip(await zipFile.arrayBuffer());
      sourceLabel = "Lovable ZIP export";
    } else {
      // ── GitHub repo path (Lovable two-way sync repo) ──────────────────────
      const { repoUrl, branch } = (await req.json()) as { repoUrl?: string; branch?: string };
      if (!repoUrl) return Response.json({ error: "repoUrl is required" }, { status: 400 });
      const parsed = parseGitHubUrl(repoUrl);
      if (!parsed) return Response.json({ error: "Invalid GitHub URL" }, { status: 400 });

      const gh = await filesFromGitHub(
        profile?.github_access_token ?? process.env.GITHUB_TOKEN ?? undefined,
        parsed.owner, parsed.repo, branch,
      );
      raw = gh.files;
      githubRepo = `${parsed.owner}/${parsed.repo}`;
      githubBranch = gh.branch;
      repoDescription = gh.description;
      sourceLabel = `Lovable sync repo ${githubRepo}`;
    }

    if (raw.length === 0) {
      return Response.json({ error: "No importable files found" }, { status: 422 });
    }

    // ── Lovable adaptation ───────────────────────────────────────────────────
    const adapted = adaptLovableProject(raw);
    if (!adapted.isLovable) {
      adapted.notes.unshift(
        "No Lovable-specific tooling detected — imported as a plain Vite/React project (that's fine; nothing needed stripping).",
      );
    }

    // Parsing, fetching, and adaptation are read-only. Reserve immediately
    // before the first durable project write.
    creditReservation = await reserveCredits(supabase, {
      userId: user.id,
      amount: 2,
      action: "lovable_import",
      projectId: null,
    });
    if (!creditReservation) {
      return Response.json(
        { error: "Insufficient credits", requiredCredits: 2 },
        { status: 402 },
      );
    }

    const projectName = `${adapted.packageName ?? githubRepo?.split("/")[1] ?? "Lovable app"} (imported)`;
    const { data: project, error: projectError } = await (supabase as any)
      .from("projects")
      .insert({
        user_id: user.id,
        name: projectName,
        description: repoDescription ?? `Imported from ${sourceLabel}`,
        status: "active",
        framework: "react", // Lovable exports are Vite + React
        ...(githubRepo ? { github_repo: githubRepo, github_branch: githubBranch } : {}),
      })
      .select()
      .single();
    if (projectError || !project) {
      return Response.json({ error: "Failed to create project" }, { status: 500 });
    }
    durableImportStarted = true;

    // Persist migration notes INSIDE the project too — the modal's summary is
    // gone after one click, but these stay:
    //  1. a docs file in the file tree,
    //  2. a first assistant chat message, so the notes greet the user in-editor.
    if (adapted.notes.length > 0) {
      adapted.files.push({
        path: "LOVABLE_IMPORT_NOTES.md",
        language: "markdown",
        content: [
          "# Imported from Lovable",
          "",
          `Imported ${new Date().toISOString().slice(0, 10)} from ${sourceLabel}.`,
          "",
          ...adapted.notes.map((n) => `- ${n}`),
          "",
          "_Delete this file once you've worked through the notes._",
        ].join("\n"),
      });
    }

    for (let i = 0; i < adapted.files.length; i += 50) {
      const batch = adapted.files.slice(i, i + 50).map((f) => ({
        project_id: project.id,
        path: f.path,
        content: f.content,
        language: f.language,
      }));
      const { error: filesError } = await (supabase as any).from("project_files").insert(batch);
      if (filesError) throw new Error(`Failed to persist imported files: ${filesError.message}`);
    }

    // Welcome message in chat (best-effort — import must not fail on this).
    try {
      await (supabase as any).from("messages").insert({
        project_id: project.id,
        role: "assistant",
        mode: "chat",
        content: [
          `👋 **Imported from Lovable** — ${adapted.files.length} files from ${sourceLabel}.`,
          "",
          ...(adapted.notes.length > 0
            ? ["**Migration notes:**", ...adapted.notes.map((n) => `- ${n}`)]
            : ["No Lovable-specific tooling needed changes — you're ready to build."]),
          "",
          "Try: *\"give me an overview of this app\"* or open the Preview to see it running.",
        ].join("\n"),
        metadata: { imported_from: "lovable" },
      });
    } catch { /* non-fatal */ }

    const remainingCredits = await settleCreditReservation(
      supabase,
      creditReservation.id,
      2,
    );
    if (remainingCredits == null) throw new Error("Unable to settle reserved Lovable import credits");
    reservationFinalized = true;

    return Response.json({
      projectId: project.id,
      name: projectName,
      filesImported: adapted.files.length,
      isLovable: adapted.isLovable,
      notes: adapted.notes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("404") || message.includes("Not Found")) {
      return Response.json(
        { error: "Repository not found or private. Connect your GitHub account (Git panel) to import private Lovable sync repos." },
        { status: 404 },
      );
    }
    console.error("[projects/import-lovable]", err);
    return Response.json({ error: "Import failed: " + message }, { status: 500 });
  } finally {
    if (creditReservation && !reservationFinalized) {
      try {
        if (durableImportStarted) {
          const remaining = await settleCreditReservation(supabase, creditReservation.id, 2);
          reservationFinalized = remaining != null;
        } else {
          await cancelCreditReservation(supabase, creditReservation.id);
          reservationFinalized = true;
        }
      } catch {
        // Fail closed when a project or any imported files may already exist.
      }
    }
  }
}


export const Route = createFileRoute("/api/projects/import-lovable")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePOST(request),
    },
  },
});
