/** Browser-verified together; caret upgrades introduced SPA hydration failures. */
export const TANSTACK_RUNTIME_PINS = {
  react: "19.2.8",
  "react-dom": "19.2.8",
  "@tanstack/react-start": "1.168.32",
  "@tanstack/react-router": "1.170.18",
};
export const TANSTACK_BUILD_VITE_PIN = "7.3.6";

/** Existing apps must publish with the same tested runtime as new generations. */
export function pinTanStackRuntimeManifest(content: string): string {
  try {
    const pkg = JSON.parse(content);
    if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) return content;
    if (!pkg.dependencies?.["@tanstack/react-start"] && !pkg.devDependencies?.["@tanstack/react-start"]) return content;
    pkg.dependencies = { ...pkg.dependencies, ...TANSTACK_RUNTIME_PINS };
    pkg.devDependencies = { ...pkg.devDependencies, vite: TANSTACK_BUILD_VITE_PIN };
    for (const name of Object.keys(TANSTACK_RUNTIME_PINS)) delete pkg.devDependencies[name];
    return `${JSON.stringify(pkg, null, 2)}\n`;
  } catch {
    return content;
  }
}
