/**
 * Turn Figma layer-tree components into project files that preview immediately.
 * The first frame becomes App so import is a runnable first screen, not a
 * prompt that still needs a second generate.
 */

function isTanStackProject(paths: string[]): boolean {
  return paths.some(
    (path) =>
      path === "src/routes/__root.tsx" ||
      path === "src/router.tsx" ||
      path === "src/routes/index.tsx",
  );
}

export function pickAppEntryPath(paths: string[]): string {
  if (isTanStackProject(paths)) return "src/routes/index.tsx";
  const candidates = ["src/App.tsx", "src/App.jsx", "App.tsx", "src/app.tsx"];
  return candidates.find((p) => paths.includes(p)) ?? "src/App.tsx";
}

export function importPathForApp(appPath: string, componentFile: string): string {
  const normalized = appPath.replace(/\\/g, "/");
  if (normalized.startsWith("src/routes/")) return `../components/figma/${componentFile}`;
  if (normalized.startsWith("src/")) return `./components/figma/${componentFile}`;
  return `./src/components/figma/${componentFile}`;
}

function uniqueName(base: string, used: Set<string>): string {
  const cleaned = base.replace(/[^A-Za-z0-9]/g, "") || "Frame";
  const start = /^[A-Za-z]/.test(cleaned) ? cleaned : `Frame${cleaned}`;
  let name = start;
  let n = 2;
  while (used.has(name)) {
    name = `${start}${n++}`;
  }
  used.add(name);
  return name;
}

export function buildFigmaImportFiles(
  existingPaths: string[],
  components: Array<{ componentName: string; code: string }>,
): Array<{ path: string; content: string; language: string }> {
  if (components.length === 0) return [];
  const used = new Set<string>();
  const out: Array<{ path: string; content: string; language: string }> = [];
  let firstName = "";

  for (const c of components) {
    const name = uniqueName(c.componentName, used);
    if (!firstName) firstName = name;
    const code = c.code.includes(`export function ${c.componentName}`)
      ? c.code.replace(`export function ${c.componentName}`, `export function ${name}`)
      : `export function ${name}() {\n  return null;\n}\n`;
    out.push({
      path: `src/components/figma/${name}.tsx`,
      content: code.endsWith("\n") ? code : `${code}\n`,
      language: "typescriptreact",
    });
  }

  const appPath = pickAppEntryPath(existingPaths);
  const rel = importPathForApp(appPath, firstName);
  const isFileRoute = appPath.replace(/\\/g, "/").startsWith("src/routes/");
  out.push({
    path: appPath,
    content: isFileRoute
      ? `import { createFileRoute } from "@tanstack/react-router";\n` +
        `import { ${firstName} } from "${rel}";\n\n` +
        `function Home() {\n  return <${firstName} />;\n}\n\n` +
        `export const Route = createFileRoute("/")({ component: Home });\n`
      : `import { ${firstName} } from "${rel}";\n\n` +
        `export default function App() {\n` +
        `  return <${firstName} />;\n` +
        `}\n`,
    language: "typescriptreact",
  });
  return out;
}
