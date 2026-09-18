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
