import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { extractDocumentText, SUPPORTED_DOCUMENT_EXTENSIONS } from "./document-extract.ts";

async function buildDocx(paragraphs: string[]): Promise<Buffer> {
  const zip = new JSZip();
  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
    .join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildPptx(slideTexts: string[]): Promise<Buffer> {
  const zip = new JSZip();
  slideTexts.forEach((text, i) => {
    zip.file(
      `ppt/slides/slide${i + 1}.xml`,
      `<?xml version="1.0"?><p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    );
  });
  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildXlsx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "xl/sharedStrings.xml",
    `<?xml version="1.0"?><sst><si><t>Name</t></si><si><t>Alice</t></si></sst>`,
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0"?><worksheet><sheetData>` +
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42</v></c></row>` +
      `<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>7</v></c></row>` +
      `</sheetData></worksheet>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

test("document-extract: extracts paragraph text from a .docx", async () => {
  const buf = await buildDocx(["Hello world", "Second paragraph"]);
  const result = await extractDocumentText(buf, "notes.docx");
  assert.ok("text" in result, "expected text, got " + JSON.stringify(result));
  if ("text" in result) {
    assert.match(result.text, /Hello world/);
    assert.match(result.text, /Second paragraph/);
  }
});

test("document-extract: extracts slide text from a .pptx, in slide order", async () => {
  const buf = await buildPptx(["First slide", "Second slide", "Third slide"]);
  const result = await extractDocumentText(buf, "deck.pptx");
  assert.ok("text" in result);
  if ("text" in result) {
    const firstIdx = result.text.indexOf("First slide");
    const secondIdx = result.text.indexOf("Second slide");
    const thirdIdx = result.text.indexOf("Third slide");
    assert.ok(firstIdx >= 0 && secondIdx > firstIdx && thirdIdx > secondIdx);
  }
});

test("document-extract: extracts shared-string and numeric cells from a .xlsx", async () => {
  const buf = await buildXlsx();
  const result = await extractDocumentText(buf, "data.xlsx");
  assert.ok("text" in result);
  if ("text" in result) {
    assert.match(result.text, /Name/);
    assert.match(result.text, /42/);
    assert.match(result.text, /Alice/);
    assert.match(result.text, /7/);
  }
});

test("document-extract: rejects an unsupported extension without touching the file", async () => {
  const result = await extractDocumentText(Buffer.from("not a zip"), "report.pdf");
  assert.ok("error" in result);
  if ("error" in result) {
    assert.match(result.error, /docx.*xlsx.*pptx|isn't supported/i);
  }
});

test("document-extract: rejects a corrupt/non-zip file with a supported extension", async () => {
  const result = await extractDocumentText(Buffer.from("this is not a valid zip"), "broken.docx");
  assert.ok("error" in result);
});

test("document-extract: reports no-readable-text for an empty document body", async () => {
  const buf = await buildDocx([]);
  const result = await extractDocumentText(buf, "empty.docx");
  assert.ok("error" in result);
  if ("error" in result) {
    assert.match(result.error, /no readable text/i);
  }
});

test("document-extract: SUPPORTED_DOCUMENT_EXTENSIONS matches what extractDocumentText accepts", () => {
  assert.deepEqual([...SUPPORTED_DOCUMENT_EXTENSIONS].sort(), ["docx", "pptx", "xlsx"]);
});
