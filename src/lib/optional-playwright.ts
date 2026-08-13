/** Load the optional Playwright package without exposing it to Vite's scanner. */
export async function loadOptionalPlaywright(): Promise<{ chromium: any } | null> {
  if (process.env.PLAYWRIGHT_ENABLED !== "true") return null;
  try {
    const runtimeImport = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<any>;
    const imported = await runtimeImport("playwright");
    const mod = imported?.chromium ? imported : imported?.default;
    return mod?.chromium?.launch ? { chromium: mod.chromium } : null;
  } catch {
    return null;
  }
}
