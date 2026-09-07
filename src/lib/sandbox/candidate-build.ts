import type { SandboxFile } from "./index.ts";

export interface CandidateBuildResult {
  available: boolean;
  passed: boolean;
  errors: string[];
  reason?: string;
}

/** Recover only exact repeated JSON objects; never choose between conflicting manifests. */
export function normalizeRepeatedManifest(content: string): string {
  try { JSON.parse(content); return content; } catch { /* Inspect exact repeats only. */ }
  const text = content.trim();
  if (!text.startsWith("{")) return content;
  for (let end = 1; end <= text.length; end++) {
    if (text[end - 1] !== "}") continue;
    const first = text.slice(0, end);
    try { JSON.parse(first); } catch { continue; }
    let rest = text.slice(end).trim();
    if (!rest) return content;
    while (rest.startsWith(first)) rest = rest.slice(first.length).trim();
    return rest ? content : `${first}\n`;
  }
  return content;
}

/** Collapse an on-disk concatenated package.json; null means the file is already valid or not a safe repeat. */
export function repairedManifestFromDisk(raw: string): string | null {
  const repaired = normalizeRepeatedManifest(raw);
  if (repaired === raw) return null;
  try {
    JSON.parse(repaired);
  } catch {
    return null;
  }
  return repaired;
}

/** Collapse a concatenated package.json in a sandbox file list before npm sees it. */
export function applyManifestRepair<T extends { path: string; content?: string | null }>(
  files: T[],
): { files: T[]; repaired: boolean } {
  let repaired = false;
  const next = files.map((file) => {
    if (file.path.replace(/\\/g, "/") !== "package.json" || typeof file.content !== "string") return file;
    const content = normalizeRepeatedManifest(file.content);
    if (content === file.content) return file;
    repaired = true;
    return { ...file, content };
  });
  return { files: next, repaired };
}

/** Archive paths must never escape the disposable candidate directory. */
export function validCandidateFiles(files: SandboxFile[]): boolean {
  return files.length > 0 && files.every(({ path, content }) =>
    typeof content === "string" && typeof path === "string" &&
    /^[^\\:]+$/.test(path) && !Array.from(path).some((char) => char.charCodeAt(0) < 32) && !path.startsWith("/") &&
    path.split("/").every((part) => part !== ".." && part !== "." && part !== "" && part !== "node_modules"),
  );
}

/** Runs only inside the existing untrusted-code sandbox, never in the app server. */
export function candidateBuildScript(appDir: string, candidateDir: string, timeoutSec: number): string {
  return `
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const app = ${JSON.stringify(appDir)}, candidate = ${JSON.stringify(candidateDir)};
const finish = result => console.log('LM_CANDIDATE_RESULT:' + JSON.stringify(result));
try {
  const readPackage = dir => {
    const text = fs.readFileSync(path.join(dir, 'package.json'), 'utf8').trim();
    try { return JSON.parse(text); } catch (error) {
      if (!text.startsWith('{')) throw error;
      for (let end = 1; end <= text.length; end++) {
        if (text[end - 1] !== '}') continue;
        const first = text.slice(0, end);
        let value;
        try { value = JSON.parse(first); } catch { continue; }
        let rest = text.slice(end).trim();
        while (rest.startsWith(first)) rest = rest.slice(first.length).trim();
        if (!rest) return value;
        throw error;
      }
      throw error;
    }
  };
  const dependencies = pkg => JSON.stringify(Object.entries({...pkg.dependencies, ...pkg.devDependencies}).sort(([a], [b]) => a.localeCompare(b)));
  if (dependencies(readPackage(app)) !== dependencies(readPackage(candidate))) {
    finish({available:false, passed:false, errors:[], reason:'Candidate dependencies differ from the installed preview; a fresh dependency environment is required.'});
  } else {
    const vite = path.join(app, 'node_modules/vite/bin/vite.js');
    if (!fs.existsSync(vite)) {
      finish({available:false, passed:false, errors:[], reason:'The preview has no installed Vite build tool.'});
    } else {
      fs.symlinkSync(path.join(app, 'node_modules'), path.join(candidate, 'node_modules'), 'junction');
      const build = spawnSync('timeout', ['${timeoutSec}', process.execPath, vite, 'build', '--outDir', path.join(candidate, 'dist')], {
        cwd:candidate, encoding:'utf8', maxBuffer:2*1024*1024, timeout:${(timeoutSec + 5) * 1000},
        env:{...process.env, CI:'true', NO_COLOR:'1'}
      });
      if (build.error || build.status === null || build.status === 124 || build.status === 137) {
        finish({available:false, passed:false, errors:[], reason:'Candidate build did not finish within its time budget.'});
      } else {
        const output = ((build.stdout || '') + '\\n' + (build.stderr || '')).split(candidate).join('[candidate]');
        finish({available:true, passed:build.status === 0, errors:build.status === 0 ? [] : [output.slice(-6000) || 'Candidate build failed.']});
      }
    }
  }
} catch (error) {
  finish({available:false, passed:false, errors:[], reason:'Candidate build environment unavailable: ' + error.message});
}
`;
}

export function parseCandidateBuildResult(output: string): CandidateBuildResult {
  const line = output.split(/\r?\n/).filter((line) => line.startsWith("LM_CANDIDATE_RESULT:")).at(-1);
  try {
    const value = JSON.parse(line?.slice("LM_CANDIDATE_RESULT:".length) ?? "null");
    if (value && typeof value.available === "boolean" && typeof value.passed === "boolean" &&
        Array.isArray(value.errors) && value.errors.every((error: unknown) => typeof error === "string")) return value;
  } catch { /* Missing or malformed output is never a pass. */ }
  return { available: false, passed: false, errors: [], reason: "Candidate build returned no complete result." };
}
