import { spawn } from "child_process";
import * as path from "path";

export function runNodeScript(scriptPath: string, options: {
  cwd: string;
  env: Record<string, string | undefined>;
  timeout: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [scriptPath], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      timeout: options.timeout,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}
