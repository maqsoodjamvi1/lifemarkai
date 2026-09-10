/** File routes need their framework router; they are not standalone App modules. */
export function requiresFrameworkRuntime(files: Array<{ path: string; content?: string | null }>): boolean {
  return files.some(({ path, content }) => {
    const source = content ?? "";
    if (path.replace(/\\/g, "/") === "package.json" && /@tanstack\/react-start/.test(source)) return true;
    return /\.[cm]?[jt]sx?$/.test(path) && (
      /tanstackStart\s*\(/.test(source) ||
      /@tanstack\/react-router/.test(source) && /export\s+const\s+Route\s*=/.test(source)
    );
  });
}
