/** PostgreSQL text rejects NUL, even when JSON escapes it correctly. */
export function encodeBuildContent(content: string, encoding: "utf8" | "base64") {
  if (encoding === "base64") {
    return { content, encoding, byteSize: Buffer.from(content, "base64").length };
  }
  const bytes = Buffer.from(content, "utf8");
  return {
    content: content.includes("\0") ? bytes.toString("base64") : content,
    encoding: content.includes("\0") ? "base64" as const : "utf8" as const,
    byteSize: bytes.length,
  };
}

/** Storage encoding must not bypass HTML asset and SDK transforms. */
export function transformBuildDocument<T extends { content: string; encoding: "utf8" | "base64"; byteSize: number }>(
  file: T,
  transform: (html: string) => string,
): T {
  const html = file.encoding === "base64" ? Buffer.from(file.content, "base64").toString("utf8") : file.content;
  const content = transform(html);
  return { ...file, content, encoding: "utf8", byteSize: Buffer.byteLength(content) };
}
