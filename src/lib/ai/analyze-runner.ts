/**
 * Run an AI-generated Python analyze script in an isolated environment.
 * Prefers E2B when E2B_API_KEY is set; else Modal when MODAL_TOKEN_* are set;
 * host python only when ALLOW_UNSANDBOXED_ANALYZE=true (trusted/local).
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const SCRIPT_TIMEOUT_MS = 25_000;
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;

export type AnalyzeOutputFile = {
  name: string;
  base64: string;
  sizeBytes: number;
  mimeType: string;
};

export type AnalyzeRunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  files: AnalyzeOutputFile[];
  engine: "e2b" | "modal" | "local";
};

function isModalConfigured(): boolean {
  return Boolean(process.env.MODAL_TOKEN_ID && process.env.MODAL_TOKEN_SECRET);
}

export function isAnalyzeExecutionEnabled(): boolean {
  return (
    process.env.ALLOW_UNSANDBOXED_ANALYZE === "true" ||
    Boolean(process.env.E2B_API_KEY) ||
    isModalConfigured()
  );
}

export function analyzeUnavailableReason(): string | null {
  if (isAnalyzeExecutionEnabled()) return null;
  return "Data analysis needs an isolated sandbox. Set E2B_API_KEY or MODAL_TOKEN_ID+MODAL_TOKEN_SECRET (recommended), or ALLOW_UNSANDBOXED_ANALYZE=true only in trusted environments.";
}

function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function guessMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    csv: "text/csv",
    json: "application/json",
    txt: "text/plain",
    md: "text/markdown",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
  };
  return map[ext] ?? "application/octet-stream";
}

function buildLocalEnv(inputPath: string, outputDir: string, sandboxDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    INPUT_FILE: inputPath,
    OUTPUT_DIR: outputDir,
    MPLBACKEND: "Agg",
    MPLCONFIGDIR: path.join(sandboxDir, ".matplotlib"),
    HOME: sandboxDir,
    USERPROFILE: sandboxDir,
    TEMP: sandboxDir,
    TMP: sandboxDir,
  };
  for (const key of ["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "LANG", "LC_ALL"] as const) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

async function runLocal(opts: {
  script: string;
  inputFile?: { name: string; buffer: Buffer };
}): Promise<AnalyzeRunResult> {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifemark-analyze-"));
  const outputDir = path.join(sandboxDir, "out");
  fs.mkdirSync(outputDir, { recursive: true });
  let inputPath = "";
  if (opts.inputFile) {
    inputPath = path.join(sandboxDir, opts.inputFile.name.replace(/[^a-zA-Z0-9._-]/g, "_"));
    fs.writeFileSync(inputPath, opts.inputFile.buffer);
  }
  const scriptPath = path.join(sandboxDir, "script.py");
  fs.writeFileSync(scriptPath, opts.script);

  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn("python3", [scriptPath], {
      env: buildLocalEnv(inputPath, outputDir, sandboxDir),
      cwd: sandboxDir,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      if (stdout.length < 200_000) stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      if (stderr.length < 200_000) stderr += d.toString();
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      stderr += "\n[timeout — script killed after 25s]";
    }, SCRIPT_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + `\nspawn error: ${err.message}` });
    });
  });

  const files: AnalyzeOutputFile[] = [];
  let totalBytes = 0;
  try {
    for (const name of fs.readdirSync(outputDir)) {
      const full = path.join(outputDir, name);
      const stat = fs.statSync(full);
      if (!stat.isFile()) continue;
      if (totalBytes + stat.size > MAX_OUTPUT_BYTES) {
        files.push({ name, base64: "", sizeBytes: stat.size, mimeType: guessMime(name) });
        continue;
      }
      const buf = fs.readFileSync(full);
      files.push({
        name,
        base64: buf.toString("base64"),
        sizeBytes: stat.size,
        mimeType: guessMime(name),
      });
      totalBytes += stat.size;
    }
  } catch {
    /* empty */
  }
  try {
    fs.rmSync(sandboxDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  return { ...result, files, engine: "local" };
}

async function runE2B(opts: {
  script: string;
  inputFile?: { name: string; buffer: Buffer };
}): Promise<AnalyzeRunResult> {
  const name = ["@e2b", "code-interpreter"].join("/");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import(/* webpackIgnore: true */ name as string)) as any;
  const Sandbox = mod?.Sandbox;
  if (!Sandbox) throw new Error("E2B SDK not installed (npm i @e2b/code-interpreter)");

  const sandbox = await Sandbox.create();
  try {
    await sandbox.setTimeout(60_000);
    await sandbox.files.write("/home/user/script.py", opts.script);
    await sandbox.commands.run("mkdir -p /home/user/out");
    let inputPath = "";
    if (opts.inputFile) {
      const safe = opts.inputFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      inputPath = `/home/user/${safe}`;
      await sandbox.files.write(inputPath, opts.inputFile.buffer);
    }

    const envPrefix = [
      `INPUT_FILE=${inputPath ? JSON.stringify(inputPath) : '""'}`,
      `OUTPUT_DIR="/home/user/out"`,
      `MPLBACKEND=Agg`,
    ].join(" ");

    let stdout = "";
    let stderr = "";
    const run = await sandbox.commands.run(`${envPrefix} python3 /home/user/script.py`, {
      timeoutMs: SCRIPT_TIMEOUT_MS,
      onStdout: (d: string) => {
        if (stdout.length < 200_000) stdout += d;
      },
      onStderr: (d: string) => {
        if (stderr.length < 200_000) stderr += d;
      },
    });
    stdout = (run?.stdout ?? stdout).slice(0, 200_000);
    stderr = (run?.stderr ?? stderr).slice(0, 200_000);
    const code = typeof run?.exitCode === "number" ? run.exitCode : 0;

    const files: AnalyzeOutputFile[] = [];
    let totalBytes = 0;
    try {
      const listing = await sandbox.commands.run("ls -1 /home/user/out 2>/dev/null || true");
      const names = String(listing?.stdout ?? "")
        .split("\n")
        .map((s: string) => s.trim())
        .filter(Boolean);
      for (const fileName of names) {
        try {
          const content = await sandbox.files.read(`/home/user/out/${fileName}`);
          const buf = Buffer.isBuffer(content)
            ? content
            : Buffer.from(typeof content === "string" ? content : String(content));
          if (totalBytes + buf.length > MAX_OUTPUT_BYTES) {
            files.push({
              name: fileName,
              base64: "",
              sizeBytes: buf.length,
              mimeType: guessMime(fileName),
            });
            continue;
          }
          files.push({
            name: fileName,
            base64: buf.toString("base64"),
            sizeBytes: buf.length,
            mimeType: guessMime(fileName),
          });
          totalBytes += buf.length;
        } catch {
          /* skip unreadable */
        }
      }
    } catch {
      /* no outputs */
    }

    return { code, stdout, stderr, files, engine: "e2b" };
  } finally {
    try {
      await sandbox.kill();
    } catch {
      /* already gone */
    }
  }
}

async function runModal(opts: {
  script: string;
  inputFile?: { name: string; buffer: Buffer };
}): Promise<AnalyzeRunResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import(/* webpackIgnore: true */ "modal")) as any;
  const ModalClient = mod?.ModalClient;
  if (!ModalClient) throw new Error("Modal SDK not installed (npm i modal)");

  const modal = new ModalClient();
  const appName = process.env.MODAL_APP_NAME || "lifemark-preview";
  const imageRef = process.env.MODAL_ANALYZE_IMAGE || "python:3.12-slim-bookworm";
  const app = await modal.apps.fromName(appName, { createIfMissing: true });
  const image = modal.images.fromRegistry(imageRef);
  const sb = await modal.sandboxes.create(app, image, {
    timeoutMs: 90_000,
    idleTimeoutMs: 90_000,
    workdir: "/workspace",
    command: ["sleep", "180"],
  });

  const exec = async (command: string) => {
    const proc = await sb.exec(["bash", "-c", command], {
      stdout: "pipe",
      stderr: "pipe",
      workdir: "/workspace",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      proc.stdout.readText(),
      proc.stderr.readText(),
      proc.wait(),
    ]);
    return { stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), exitCode: Number(exitCode ?? 0) };
  };

  const writeBytes = async (target: string, buf: Buffer) => {
    const b64 = buf.toString("base64");
    const tmp = `${target}.b64`;
    // Assemble base64 text in chunks, then decode once (avoids mid-chunk corruption).
    const chunkSize = 48_000;
    await exec(`mkdir -p "$(dirname ${shellSingleQuote(target)})" && : > ${shellSingleQuote(tmp)}`);
    for (let i = 0; i < b64.length; i += chunkSize) {
      await exec(
        `printf %s ${shellSingleQuote(b64.slice(i, i + chunkSize))} >> ${shellSingleQuote(tmp)}`,
      );
    }
    await exec(
      `base64 -d ${shellSingleQuote(tmp)} > ${shellSingleQuote(target)} 2>/dev/null || ` +
        `base64 -D -i ${shellSingleQuote(tmp)} -o ${shellSingleQuote(target)}; rm -f ${shellSingleQuote(tmp)}`,
    );
  };

  try {
    await writeBytes("/workspace/script.py", Buffer.from(opts.script, "utf8"));
    await exec("mkdir -p /workspace/out");
    let inputPath = "";
    if (opts.inputFile) {
      const safe = opts.inputFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      inputPath = `/workspace/${safe}`;
      await writeBytes(inputPath, opts.inputFile.buffer);
    }

    const envPrefix = [
      `INPUT_FILE=${inputPath ? shellSingleQuote(inputPath) : '""'}`,
      `OUTPUT_DIR=/workspace/out`,
      `MPLBACKEND=Agg`,
    ].join(" ");

    const run = await exec(
      `timeout ${Math.ceil(SCRIPT_TIMEOUT_MS / 1000)}s env ${envPrefix} python3 /workspace/script.py`,
    );
    const stdout = run.stdout.slice(0, 200_000);
    let stderr = run.stderr.slice(0, 200_000);
    if (run.exitCode === 124) {
      stderr = `${stderr}\n[timeout — script killed after 25s]`.trim();
    }

    const files: AnalyzeOutputFile[] = [];
    let totalBytes = 0;
    const listing = await exec("ls -1 /workspace/out 2>/dev/null || true");
    const names = listing.stdout
      .split("\n")
      .map((s: string) => s.trim())
      .filter(Boolean);
    for (const fileName of names) {
      try {
        const encoded = await exec(
          `base64 -w 0 ${shellSingleQuote(`/workspace/out/${fileName}`)} 2>/dev/null || base64 ${shellSingleQuote(`/workspace/out/${fileName}`)} | tr -d '\\n'`,
        );
        if (encoded.exitCode !== 0 || !encoded.stdout.trim()) continue;
        const buf = Buffer.from(encoded.stdout.trim(), "base64");
        if (totalBytes + buf.length > MAX_OUTPUT_BYTES) {
          files.push({
            name: fileName,
            base64: "",
            sizeBytes: buf.length,
            mimeType: guessMime(fileName),
          });
          continue;
        }
        files.push({
          name: fileName,
          base64: buf.toString("base64"),
          sizeBytes: buf.length,
          mimeType: guessMime(fileName),
        });
        totalBytes += buf.length;
      } catch {
        /* skip */
      }
    }

    return { code: run.exitCode, stdout, stderr, files, engine: "modal" };
  } finally {
    try {
      await sb.terminate();
    } catch {
      /* already gone */
    }
  }
}

export async function runAnalyzeScript(opts: {
  script: string;
  inputFile?: { name: string; buffer: Buffer };
}): Promise<AnalyzeRunResult> {
  if (process.env.E2B_API_KEY) {
    try {
      return await runE2B(opts);
    } catch (err) {
      if (isModalConfigured()) {
        try {
          const modal = await runModal(opts);
          modal.stderr =
            `${modal.stderr}\n[e2b→modal fallback] ${err instanceof Error ? err.message : String(err)}`.trim();
          return modal;
        } catch {
          /* fall through */
        }
      }
      if (process.env.ALLOW_UNSANDBOXED_ANALYZE === "true") {
        const local = await runLocal(opts);
        local.stderr =
          `${local.stderr}\n[e2b fallback] ${err instanceof Error ? err.message : String(err)}`.trim();
        return local;
      }
      throw err;
    }
  }
  if (isModalConfigured()) {
    try {
      return await runModal(opts);
    } catch (err) {
      if (process.env.ALLOW_UNSANDBOXED_ANALYZE === "true") {
        const local = await runLocal(opts);
        local.stderr =
          `${local.stderr}\n[modal fallback] ${err instanceof Error ? err.message : String(err)}`.trim();
        return local;
      }
      throw err;
    }
  }
  if (process.env.ALLOW_UNSANDBOXED_ANALYZE === "true") {
    return runLocal(opts);
  }
  throw new Error(analyzeUnavailableReason() ?? "Analyze execution unavailable");
}
