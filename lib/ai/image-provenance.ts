/**
 * AI-provenance metadata for generated images (Lovable parity, Jul 8 2026:
 * "Images Lovable generates are labeled as AI-generated").
 *
 * Embeds an XMP packet with the IPTC `DigitalSourceType =
 * trainedAlgorithmicMedia` marker into PNG images by inserting an iTXt chunk
 * (keyword "XML:com.adobe.xmp") right after IHDR. Platforms that read
 * provenance metadata (Google, some social networks) can then label the
 * image as AI-generated. Pure TypeScript — no image library needed, pixels
 * untouched.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** CRC-32 (PNG variant), table-based. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buildXmpPacket(tool: string): string {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:dc="http://purl.org/dc/elements/1.1/">
   <Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>
   <xmp:CreatorTool>${tool}</xmp:CreatorTool>
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">AI-generated image</rdf:li></rdf:Alt></dc:description>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/** Build a PNG iTXt chunk carrying the XMP packet. */
function buildXmpChunk(xmp: string): Uint8Array {
  const keyword = "XML:com.adobe.xmp";
  const encoder = new TextEncoder();
  const xmpBytes = encoder.encode(xmp);
  // iTXt: keyword \0 compressionFlag(0) compressionMethod(0) \0(lang) \0(translated) text
  const data = new Uint8Array(keyword.length + 5 + xmpBytes.length);
  let o = 0;
  for (let i = 0; i < keyword.length; i++) data[o++] = keyword.charCodeAt(i);
  data[o++] = 0; // keyword terminator
  data[o++] = 0; // compression flag: uncompressed
  data[o++] = 0; // compression method
  data[o++] = 0; // language tag terminator (empty)
  data[o++] = 0; // translated keyword terminator (empty)
  data.set(xmpBytes, o);

  const type = encoder.encode("iTXt");
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(type, 4);
  chunk.set(data, 8);
  const crcInput = new Uint8Array(4 + data.length);
  crcInput.set(type, 0);
  crcInput.set(data, 4);
  view.setUint32(8 + data.length, crc32(crcInput));
  return chunk;
}

/**
 * Insert the AI-provenance XMP chunk into a PNG buffer (after IHDR).
 * Returns the original bytes unchanged when the input is not a valid PNG
 * or already carries an XMP packet.
 */
export function addPngAiProvenance(png: Uint8Array, tool = "LifemarkAI"): Uint8Array {
  if (png.length < 33) return png;
  for (let i = 0; i < 8; i++) if (png[i] !== PNG_SIGNATURE[i]) return png;

  // Cheap existing-XMP check (avoid double-tagging)
  const probe = new TextDecoder("latin1").decode(png.subarray(0, Math.min(png.length, 4096)));
  if (probe.includes("XML:com.adobe.xmp")) return png;

  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const ihdrLen = view.getUint32(8);
  // sig(8) + length(4) + "IHDR"(4) + data(ihdrLen) + crc(4)
  const insertAt = 8 + 4 + 4 + ihdrLen + 4; // right after IHDR's CRC

  const chunk = buildXmpChunk(buildXmpPacket(tool));
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, insertAt), 0);
  out.set(chunk, insertAt);
  out.set(png.subarray(insertAt), insertAt + chunk.length);
  return out;
}

const JPEG_XMP_NS = "http://ns.adobe.com/xap/1.0/\0";

/**
 * Insert the AI-provenance XMP as a JPEG APP1 segment (after SOI, and after
 * an APP0/JFIF segment when present). Returns the original bytes unchanged
 * when the input is not a valid JPEG or already carries an XMP packet.
 */
export function addJpegAiProvenance(jpeg: Uint8Array, tool = "LifemarkAI"): Uint8Array {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;

  // Cheap existing-XMP check on the header region
  const probe = new TextDecoder("latin1").decode(jpeg.subarray(0, Math.min(jpeg.length, 8192)));
  if (probe.includes("ns.adobe.com/xap/1.0")) return jpeg;

  const payload = new TextEncoder().encode(JPEG_XMP_NS + buildXmpPacket(tool));
  const segLen = payload.length + 2; // length field includes itself
  if (segLen > 0xffff) return jpeg; // XMP too large for one APP1 — bail

  const seg = new Uint8Array(4 + payload.length);
  seg[0] = 0xff;
  seg[1] = 0xe1; // APP1
  seg[2] = (segLen >> 8) & 0xff;
  seg[3] = segLen & 0xff;
  seg.set(payload, 4);

  // Insert after SOI, skipping an initial APP0 (JFIF) segment when present.
  let insertAt = 2;
  if (jpeg.length > 4 && jpeg[2] === 0xff && jpeg[3] === 0xe0) {
    const app0Len = (jpeg[4] << 8) | jpeg[5];
    insertAt = 2 + 2 + app0Len;
    if (insertAt > jpeg.length) insertAt = 2; // corrupt length — fall back
  }

  const out = new Uint8Array(jpeg.length + seg.length);
  out.set(jpeg.subarray(0, insertAt), 0);
  out.set(seg, insertAt);
  out.set(jpeg.subarray(insertAt), insertAt + seg.length);
  return out;
}

/**
 * Tag a data-URL image with AI provenance. Supports PNG (iTXt chunk) and
 * JPEG (APP1 XMP segment); other formats are returned unchanged.
 */
export function addDataUrlAiProvenance(dataUrl: string, tool = "LifemarkAI"): string {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(dataUrl);
  if (!m) return dataUrl;
  const [, format, b64] = m;
  try {
    const raw = Uint8Array.from(Buffer.from(b64, "base64"));
    const tagged = format === "png" ? addPngAiProvenance(raw, tool) : addJpegAiProvenance(raw, tool);
    if (tagged === raw) return dataUrl;
    return `data:image/${format};base64,${Buffer.from(tagged).toString("base64")}`;
  } catch {
    return dataUrl;
  }
}
