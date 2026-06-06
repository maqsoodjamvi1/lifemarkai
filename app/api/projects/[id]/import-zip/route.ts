import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { detectLanguage } from "@/lib/ai/code-parser";

// Paths/patterns to skip when importing
const SKIP_PATTERNS = [
  /^node_modules\//,
  /^\.next\//,
  /^\.git\//,
  /^dist\//,
  /^build\//,
  /^\.cache\//,
  /^coverage\//,
  /\.(png|jpg|jpeg|gif|ico|webp|woff|woff2|ttf|eot|otf|mp4|mp3|wav|ogg|zip|tar|gz|7z|pdf|exe|bin)$/i,
];

function shouldSkip(path: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(path));
}

// POST /api/projects/[id]/import-zip
// Body: multipart/form-data with a single "file" field (the ZIP)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Parse multipart
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "ZIP file must be under 50 MB" }, { status: 413 });
  }
  if (!file.name.endsWith(".zip")) {
    return NextResponse.json({ error: "File must be a .zip archive" }, { status: 400 });
  }

  // Read the ZIP bytes
  const arrayBuffer = await file.arrayBuffer();
  const zipBytes = Buffer.from(arrayBuffer);

  // Parse ZIP without external deps using the ZIP spec
  const entries = parseZip(zipBytes);
  if (entries.length === 0) {
    return NextResponse.json({ error: "ZIP is empty or unreadable" }, { status: 400 });
  }

  // Detect common root prefix (e.g. "my-project/") and strip it
  const prefix = detectRootPrefix(entries.map((e) => e.path));

  const toImport = entries
    .filter((e) => !e.isDir)
    .map((e) => ({
      ...e,
      path: prefix ? e.path.slice(prefix.length) : e.path,
    }))
    .filter((e) => e.path && !shouldSkip(e.path))
    .slice(0, 200); // cap at 200 files

  if (toImport.length === 0) {
    return NextResponse.json({ error: "No importable source files found in ZIP" }, { status: 400 });
  }

  // Load existing files for this project (to upsert by path)
  const { data: existing } = await (supabase as any)
    .from("project_files")
    .select("id, path")
    .eq("project_id", id);

  const existingMap = new Map<string, string>(
    ((existing ?? []) as Array<{ id: string; path: string }>).map((f) => [f.path, f.id])
  );

  const toUpdate: Array<{ id: string; content: string; language: string }> = [];
  const toInsert: Array<{ project_id: string; path: string; content: string; language: string }> = [];

  for (const entry of toImport) {
    const content = entry.content;
    const language = detectLanguage(entry.path);
    const existingId = existingMap.get(entry.path);
    if (existingId) {
      toUpdate.push({ id: existingId, content, language });
    } else {
      toInsert.push({ project_id: id, path: entry.path, content, language });
    }
  }

  // Batch upsert
  const errors: string[] = [];

  for (const u of toUpdate) {
    const { error } = await (supabase as any)
      .from("project_files")
      .update({ content: u.content, language: u.language })
      .eq("id", u.id);
    if (error) errors.push(u.id);
  }

  if (toInsert.length > 0) {
    // Insert in batches of 50
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      const { error } = await (supabase as any)
        .from("project_files")
        .insert(batch);
      if (error) errors.push(`batch-${i}`);
    }
  }

  return NextResponse.json({
    imported: toImport.length,
    updated: toUpdate.length,
    inserted: toInsert.length,
    errors: errors.length,
  });
}

// ── Minimal ZIP parser ─────────────────────────────────────────────────────────
// Parses the central directory to enumerate entries, then reads local file data.

interface ZipEntry {
  path: string;
  content: string;
  isDir: boolean;
}

function parseZip(buf: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];

  // Find end-of-central-directory record (EOCD) — signature 0x06054b50
  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return entries;

  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const cdSize = buf.readUInt32LE(eocdOffset + 12);

  // Walk central directory
  const CD_SIG = 0x02014b50;
  let pos = cdOffset;
  while (pos < cdOffset + cdSize && pos + 46 <= buf.length) {
    if (buf.readUInt32LE(pos) !== CD_SIG) break;

    const compMethod = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const uncompSize = buf.readUInt32LE(pos + 24);
    const fileNameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);

    const fileName = buf.toString("utf8", pos + 46, pos + 46 + fileNameLen);
    pos += 46 + fileNameLen + extraLen + commentLen;

    const isDir = fileName.endsWith("/") || uncompSize === 0 && fileName.endsWith("\\");

    if (isDir) {
      entries.push({ path: fileName.replace(/\\/g, "/"), content: "", isDir: true });
      continue;
    }

    // Read local file header to find actual data offset
    const LFH_SIG = 0x04034b50;
    if (localOffset + 30 > buf.length) continue;
    if (buf.readUInt32LE(localOffset) !== LFH_SIG) continue;

    const lfhFileNameLen = buf.readUInt16LE(localOffset + 26);
    const lfhExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + lfhFileNameLen + lfhExtraLen;

    if (dataOffset + compSize > buf.length) continue;

    let content = "";
    try {
      if (compMethod === 0) {
        // Stored (no compression)
        content = buf.toString("utf8", dataOffset, dataOffset + uncompSize);
      } else if (compMethod === 8) {
        // Deflate — use Node's built-in zlib
        const { inflateRawSync } = require("zlib");
        const compressed = buf.subarray(dataOffset, dataOffset + compSize);
        const decompressed = inflateRawSync(compressed);
        content = decompressed.toString("utf8");
      }
      // Strip null bytes that can corrupt DB storage
      content = content.replace(/\0/g, "");
    } catch {
      continue; // skip unreadable entries
    }

    entries.push({ path: fileName.replace(/\\/g, "/"), content, isDir: false });
  }

  return entries;
}

// ── Root prefix detection ──────────────────────────────────────────────────────
// If all paths share a common root folder (e.g. "my-project/"), strip it.

function detectRootPrefix(paths: string[]): string {
  if (paths.length === 0) return "";
  const firstSlash = paths[0].indexOf("/");
  if (firstSlash === -1) return "";
  const candidate = paths[0].slice(0, firstSlash + 1);
  if (paths.every((p) => p.startsWith(candidate))) return candidate;
  return "";
}
