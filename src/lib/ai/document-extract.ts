/**
 * Best-effort text extraction for chat attachments (Lovable parity: file
 * attachments include Word/Excel/PowerPoint alongside images/PDF).
 *
 * Scope is deliberately narrow: the three modern Office Open XML formats
 * (.docx / .xlsx / .pptx) are ZIP containers of XML, and this project
 * already depends on `jszip` (used by the Lovable-import route) — so these
 * three are extracted with zero new dependencies. Legacy binary formats
 * (.doc / .xls / .ppt, pre-2007 OLE Compound File Binary) are NOT zip files
 * and are explicitly rejected below rather than silently mishandled. PDF is
 * likewise out of scope here: real text extraction needs a proper PDF
 * parser (e.g. pdf-parse), which isn't a project dependency — adding one is
 * a separate, deliberate decision, not a drive-by addition to this change.
 */
import JSZip from "jszip";

export type ExtractedDocument = { text: string } | { error: string };

const MAX_EXTRACTED_CHARS = 50_000;

export const SUPPORTED_DOCUMENT_EXTENSIONS = new Set(["docx", "xlsx", "pptx"]);

function stripXmlTags(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

async function extractDocx(zip: JSZip): Promise<string> {
  const doc = zip.file("word/document.xml");
  if (!doc) return "";
  const xml = await doc.async("string");
  // Word closes each paragraph with </w:p> — insert a newline there before
  // stripping tags, or every paragraph in the document runs together.
  return stripXmlTags(xml.replace(/<\/w:p>/g, "\n"));
}

async function extractPptx(zip: JSZip): Promise<string> {
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      return na - nb;
    });
  const parts: string[] = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const file = zip.file(slideFiles[i]!);
    if (!file) continue;
    const xml = await file.async("string");
    const text = stripXmlTags(xml.replace(/<\/a:p>/g, "\n"));
    if (text) parts.push(`--- Slide ${i + 1} ---\n${text}`);
  }
  return parts.join("\n\n");
}

async function extractXlsx(zip: JSZip): Promise<string> {
  // Shared strings cover most human-authored text content. Formulas and
  // computed-only numeric cells are intentionally out of scope — this gives
  // the AI something to read, it isn't a spreadsheet engine.
  const sharedStrings: string[] = [];
  const sharedStringsFile = zip.file("xl/sharedStrings.xml");
  if (sharedStringsFile) {
    const xml = await sharedStringsFile.async("string");
    for (const m of xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) {
      sharedStrings.push(stripXmlTags(m[1] ?? ""));
    }
  }

  const sheetFiles = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort();

  const parts: string[] = [];
  for (let i = 0; i < sheetFiles.length; i++) {
    const file = zip.file(sheetFiles[i]!);
    if (!file) continue;
    const xml = await file.async("string");
    const rows: string[] = [];
    for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      // Capture the cell's opening-tag attributes separately from its body —
      // matching `t="..."` inline inside one alternation-heavy pattern let
      // the engine skip the optional group entirely (it always matched as
      // absent) and silently degraded every shared-string cell to its raw
      // numeric index. Splitting attrs from body avoids that trap.
      for (const cell of (row[1] ?? "").matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cell[1] ?? "";
        const inner = cell[2] ?? "";
        const type = attrs.match(/\st="([^"]*)"/)?.[1];
        const valueMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        if (!valueMatch) continue;
        if (type === "s") {
          const idx = Number(valueMatch[1]);
          cells.push(sharedStrings[idx] ?? "");
        } else {
          cells.push(valueMatch[1] ?? "");
        }
      }
      if (cells.some((c) => c.trim())) rows.push(cells.join("\t"));
    }
    if (rows.length) parts.push(`--- Sheet ${i + 1} ---\n${rows.join("\n")}`);
  }
  return parts.join("\n\n");
}

/** Extracts plain text from a .docx/.xlsx/.pptx buffer for use as chat
 *  attachment context. Returns `{ error }` for unsupported types, corrupt
 *  files, or documents with no extractable text. */
export async function extractDocumentText(
  buffer: Buffer,
  filename: string,
): Promise<ExtractedDocument> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!SUPPORTED_DOCUMENT_EXTENSIONS.has(ext)) {
    return {
      error: `.${ext || "?"} isn't supported yet. Try .docx, .xlsx, or .pptx, or paste the text directly.`,
    };
  }
  try {
    const zip = await JSZip.loadAsync(buffer);
    const text =
      ext === "docx" ? await extractDocx(zip)
      : ext === "pptx" ? await extractPptx(zip)
      : await extractXlsx(zip);
    if (!text.trim()) {
      return { error: "No readable text found in this file (it may be empty, image-only, or scanned)." };
    }
    return {
      text: text.length > MAX_EXTRACTED_CHARS
        ? `${text.slice(0, MAX_EXTRACTED_CHARS)}\n\n[truncated — file is longer than what's shown here]`
        : text,
    };
  } catch {
    return { error: `Couldn't read this file — it may not be a valid .${ext} document.` };
  }
}
