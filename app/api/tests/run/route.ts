import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sseEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TestFile {
  path: string;
  content: string;
}

interface RunRequest {
  projectId: string;
  files: TestFile[];   // test files to execute
  runner?: "vitest" | "playwright"; // default: vitest
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json() as RunRequest;
  const { projectId, files, runner = "vitest" } = body;

  if (!projectId || !files?.length) {
    return new Response("projectId and files required", { status: 400 });
  }

  // Verify project ownership
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return new Response("Project not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sseEvent(type, data)));
        } catch {
          // stream closed
        }
      };

      // Create a temp directory with the test files
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `lifemark-tests-`));

      try {
        send("status", { message: "Preparing test environment…" });

        // Write all test files to the temp dir
        for (const f of files) {
          const filePath = path.join(tmpDir, path.basename(f.path));
          fs.writeFileSync(filePath, f.content, "utf8");
          send("status", { message: `Writing ${f.path}…` });
        }

        // Determine which test runner to use
        let cmd: string;
        let args: string[];

        if (runner === "playwright") {
          // Write a minimal playwright.config.ts
          fs.writeFileSync(
            path.join(tmpDir, "playwright.config.ts"),
            `import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: ".", timeout: 30_000 });`
          );
          cmd = "npx";
          args = ["--yes", "playwright", "test", "--reporter=json", "--output", tmpDir, tmpDir];
        } else {
          // Write a minimal vitest.config.ts
          fs.writeFileSync(
            path.join(tmpDir, "vitest.config.ts"),
            `import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["**/*.{test,spec}.{ts,tsx,js,jsx}"], environment: "node" } });`
          );
          cmd = "npx";
          args = ["--yes", "vitest", "run", "--reporter=verbose", "--no-coverage", tmpDir];
        }

        send("status", { message: `Running tests with ${runner}…` });

        // Spawn the test process
        let stdout = "";
        let stderr = "";
        const startTime = Date.now();

        await new Promise<void>((resolve) => {
          const child = spawn(cmd, args, {
            cwd: tmpDir,
            env: { ...process.env, CI: "true", NO_COLOR: "1", FORCE_COLOR: "0" },
            timeout: 120_000, // 2-minute hard limit
          });

          child.stdout.on("data", (chunk: Buffer) => {
            const line = chunk.toString();
            stdout += line;
            // Stream individual lines as status events so the UI feels live
            for (const l of line.split("\n")) {
              const trimmed = l.trim();
              if (trimmed) send("log", { line: trimmed });
            }
          });

          child.stderr.on("data", (chunk: Buffer) => {
            const line = chunk.toString();
            stderr += line;
            for (const l of line.split("\n")) {
              const trimmed = l.trim();
              if (trimmed && !trimmed.startsWith("ExperimentalWarning")) {
                send("log", { line: trimmed, isError: true });
              }
            }
          });

          child.on("close", (code) => {
            const duration = Date.now() - startTime;
            const combined = stdout + stderr;

            // ── Parse vitest verbose output ────────────────────────────────
            const suites: Array<{
              file: string;
              tests: Array<{ name: string; status: "pass" | "fail" | "skip"; duration?: number; error?: string }>;
            }> = [];

            let pass = 0;
            let fail = 0;
            let skip = 0;

            if (runner === "vitest") {
              // Parse "✓ test name (Xms)" and "× test name" patterns from verbose output
              let currentFile = "";
              for (const line of combined.split("\n")) {
                const fileMatch = line.match(/^\s*([^\s].*\.(test|spec)\.(ts|tsx|js|jsx))/);
                if (fileMatch) {
                  currentFile = fileMatch[1].trim();
                  if (!suites.find((s) => s.file === currentFile)) {
                    suites.push({ file: currentFile, tests: [] });
                  }
                }
                const passMatch = line.match(/✓\s+(.+?)(?:\s+(\d+)ms)?$/);
                if (passMatch) {
                  const suite = suites.find((s) => s.file === currentFile) ?? { file: currentFile, tests: [] };
                  suite.tests.push({ name: passMatch[1].trim(), status: "pass", duration: passMatch[2] ? parseInt(passMatch[2]) : undefined });
                  if (!suites.includes(suite)) suites.push(suite);
                  pass++;
                }
                const failMatch = line.match(/×\s+(.+)$/);
                if (failMatch) {
                  const suite = suites.find((s) => s.file === currentFile) ?? { file: currentFile, tests: [] };
                  suite.tests.push({ name: failMatch[1].trim(), status: "fail", error: "See logs for details" });
                  if (!suites.includes(suite)) suites.push(suite);
                  fail++;
                }
                const skipMatch = line.match(/↓\s+(.+)$/);
                if (skipMatch) {
                  const suite = suites.find((s) => s.file === currentFile) ?? { file: currentFile, tests: [] };
                  suite.tests.push({ name: skipMatch[1].trim(), status: "skip" });
                  if (!suites.includes(suite)) suites.push(suite);
                  skip++;
                }
              }

              // Fallback: if we parsed zero tests, read from summary line
              if (pass + fail + skip === 0) {
                const summaryMatch = combined.match(/Tests?\s+(\d+)\s+passed.*?(\d+)?\s*failed.*?(\d+)?\s*skipped/i);
                if (summaryMatch) {
                  pass = parseInt(summaryMatch[1] ?? "0");
                  fail = parseInt(summaryMatch[2] ?? "0");
                  skip = parseInt(summaryMatch[3] ?? "0");
                }
                // If still zero and exit code 0, treat all as pass
                if (pass + fail + skip === 0 && code === 0) {
                  for (const f of files) {
                    suites.push({
                      file: f.path,
                      tests: [{ name: "All tests passed", status: "pass" }],
                    });
                    pass++;
                  }
                }
              }
            }

            send("done", {
              exitCode: code,
              suites,
              pass,
              fail,
              skip,
              duration,
              stdout: stdout.slice(0, 8_000), // cap for safety
              stderr: stderr.slice(0, 2_000),
            });

            resolve();
          });

          child.on("error", (err) => {
            send("error", { message: err.message });
            resolve();
          });
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        send("error", { message: msg });
      } finally {
        // Clean up temp dir
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          // best effort
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
