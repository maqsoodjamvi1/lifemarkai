/** Read/write project env vars stored in project_files at `.env.local`. */

export const ENV_FILE_PATH = ".env.local";

export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function serializeEnvFile(vars: Record<string, string>): string {
  const lines = Object.entries(vars)
    .filter(([k]) => k.trim())
    .map(([k, v]) => {
      const needsQuotes = /[\s#"]/.test(v);
      const escaped = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `${k}=${needsQuotes ? `"${escaped}"` : v}`;
    });
  return lines.length ? `${lines.join("\n")}\n` : "";
}
