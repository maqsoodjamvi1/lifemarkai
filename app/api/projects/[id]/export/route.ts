// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canReadProjectFiles, getProjectAccess } from "@/lib/project/access";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await getProjectAccess(supabase, id, user.id);
    if (!canReadProjectFiles(access)) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const { data: project } = await (supabase as any)
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const { data: files } = await (supabase as any)
      .from("project_files")
      .select("path, content, language")
      .eq("project_id", id);

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files to export" }, { status: 400 });
    }

    // Build a simple ZIP using pure JS (no native deps)
    const zipEntries = buildZipEntries(files as Array<{ path: string; content: string }>);

    return new NextResponse(zipEntries, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${project.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.zip"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}

// Pure JS ZIP builder (no native addons needed)
function buildZipEntries(files: Array<{ path: string; content: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const entries: Array<{ path: string; data: Uint8Array; crc: number; size: number }> = [];

  for (const file of files) {
    const data = encoder.encode(file.content || "");
    const crc = crc32(data);
    entries.push({ path: file.path, data, crc, size: data.length });
  }

  const localHeaders: Uint8Array[] = [];
  const offsets: number[] = [];
  let offset = 0;

  for (const entry of entries) {
    offsets.push(offset);
    const pathBytes = encoder.encode(entry.path);
    const local = buildLocalFileHeader(pathBytes, entry.data, entry.crc);
    localHeaders.push(local);
    offset += local.length;
  }

  const centralDir: Uint8Array[] = [];
  for (let i = 0; i < entries.length; i++) {
    const pathBytes = encoder.encode(entries[i].path);
    centralDir.push(buildCentralDirectoryEntry(pathBytes, entries[i], offsets[i]));
  }

  const centralSize = centralDir.reduce((s, b) => s + b.length, 0);
  const eocd = buildEndOfCentralDirectory(entries.length, centralSize, offset);

  const parts = [...localHeaders, ...centralDir, eocd];
  const total = parts.reduce((s, b) => s + b.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const part of parts) {
    result.set(part, pos);
    pos += part.length;
  }
  return result;
}

function buildLocalFileHeader(path: Uint8Array, data: Uint8Array, crc: number): Uint8Array {
  const buf = new ArrayBuffer(30 + path.length + data.length);
  const view = new DataView(buf);
  const arr = new Uint8Array(buf);

  view.setUint32(0, 0x04034b50, true); // Local file header signature
  view.setUint16(4, 20, true);          // Version needed
  view.setUint16(6, 0, true);           // General purpose bit flag
  view.setUint16(8, 0, true);           // Compression method (stored)
  view.setUint16(10, 0, true);          // Last mod time
  view.setUint16(12, 0, true);          // Last mod date
  view.setUint32(14, crc, true);        // CRC-32
  view.setUint32(18, data.length, true); // Compressed size
  view.setUint32(22, data.length, true); // Uncompressed size
  view.setUint16(26, path.length, true); // File name length
  view.setUint16(28, 0, true);           // Extra field length

  arr.set(path, 30);
  arr.set(data, 30 + path.length);
  return arr;
}

function buildCentralDirectoryEntry(
  path: Uint8Array,
  entry: { data: Uint8Array; crc: number; size: number },
  localOffset: number
): Uint8Array {
  const buf = new ArrayBuffer(46 + path.length);
  const view = new DataView(buf);
  const arr = new Uint8Array(buf);

  view.setUint32(0, 0x02014b50, true);  // Central directory signature
  view.setUint16(4, 20, true);           // Version made by
  view.setUint16(6, 20, true);           // Version needed
  view.setUint16(8, 0, true);            // General purpose bit flag
  view.setUint16(10, 0, true);           // Compression method
  view.setUint16(12, 0, true);           // Last mod time
  view.setUint16(14, 0, true);           // Last mod date
  view.setUint32(16, entry.crc, true);   // CRC-32
  view.setUint32(20, entry.size, true);  // Compressed size
  view.setUint32(24, entry.size, true);  // Uncompressed size
  view.setUint16(28, path.length, true); // File name length
  view.setUint16(30, 0, true);           // Extra field length
  view.setUint16(32, 0, true);           // File comment length
  view.setUint16(34, 0, true);           // Disk number start
  view.setUint16(36, 0, true);           // Internal file attributes
  view.setUint32(38, 0, true);           // External file attributes
  view.setUint32(42, localOffset, true); // Relative offset of local header

  arr.set(path, 46);
  return arr;
}

function buildEndOfCentralDirectory(
  numEntries: number,
  centralSize: number,
  centralOffset: number
): Uint8Array {
  const buf = new ArrayBuffer(22);
  const view = new DataView(buf);

  view.setUint32(0, 0x06054b50, true);      // EOCD signature
  view.setUint16(4, 0, true);                // Disk number
  view.setUint16(6, 0, true);                // Disk with central dir
  view.setUint16(8, numEntries, true);       // Entries on this disk
  view.setUint16(10, numEntries, true);      // Total entries
  view.setUint32(12, centralSize, true);     // Size of central dir
  view.setUint32(16, centralOffset, true);   // Offset of central dir
  view.setUint16(20, 0, true);               // Comment length

  return new Uint8Array(buf);
}

function crc32(data: Uint8Array): number {
  const table = getCrc32Table();
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let _crc32Table: number[] | null = null;
function getCrc32Table(): number[] {
  if (_crc32Table) return _crc32Table;
  _crc32Table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    _crc32Table[i] = c;
  }
  return _crc32Table;
}
