import type { ProjectFile } from "../../types/database.ts";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Compose a dependency-free static project into one srcdoc document. */
export function buildStaticPreview(files: Pick<ProjectFile, "path" | "content">[]): string {
  const normalized = files.map((file) => ({
    ...file,
    path: file.path.replace(/\\/g, "/").replace(/^\.\//, ""),
  }));
  const entry = normalized.find((file) => file.path === "index.html")
    ?? normalized.find((file) => file.path.endsWith(".html"));
  if (!entry) {
    return "<!doctype html><html><body style=\"font-family:system-ui;padding:2rem\">No index.html yet.</body></html>";
  }

  let html = entry.content;
  for (const file of normalized) {
    if (file.path === entry.path) continue;
    const path = escapeRegex(file.path);
    if (file.path.endsWith(".css")) {
      html = html.replace(
        new RegExp(`<link[^>]*href=["'](?:\\./|/)?${path}["'][^>]*>`, "gi"),
        `<style data-lifemark-file="${file.path}">\n${file.content}\n</style>`,
      );
    } else if (/\.(?:m?js)$/.test(file.path)) {
      html = html.replace(
        new RegExp(`<script([^>]*)src=["'](?:\\./|/)?${path}["']([^>]*)>\\s*</script>`, "gi"),
        `<script type="module" data-lifemark-file="${file.path}">\n${file.content}\n</script>`,
      );
    }
  }
  return html;
}
