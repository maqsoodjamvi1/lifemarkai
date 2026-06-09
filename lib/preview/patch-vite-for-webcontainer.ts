/** Ensure Vite dev server binds for WebContainer preview (server-ready iframe). */
export function patchViteConfigForWebContainer(content: string): string {
  if (!content.trim()) return content;
  if (/host\s*:\s*(true|['"]0\.0\.0\.0['"])/.test(content)) return content;

  const serverBlock = /server\s*:\s*\{/;
  if (serverBlock.test(content)) {
    return content.replace(serverBlock, "server: {\n    host: true,");
  }

  const defineConfig = /defineConfig\s*\(\s*\{/;
  if (defineConfig.test(content)) {
    return content.replace(
      defineConfig,
      "defineConfig({\n  server: { host: true },",
    );
  }

  return `${content.trim()}\n// Added for WebContainer preview\nexport const __webcontainerHost = true;\n`;
}

export function patchFilesForWebContainer<T extends { path: string; content?: string | null }>(
  files: T[],
): T[] {
  return files.map((file) => {
    const path = file.path.replace(/\\/g, "/");
    if (!/vite\.config\.(t|j)sx?$/.test(path) || file.content == null) return file;
    return { ...file, content: patchViteConfigForWebContainer(file.content) };
  });
}
